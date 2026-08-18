import { computed, ref, type Ref } from "vue";
import { message } from "ant-design-vue";

import {
  editFinishedArticle,
  generateFinishedArticleCoverPrompt,
  generateFinishedArticleInlinePrompts,
  regenCover,
  regenInlineImage,
  renderShortImage,
  regenImagePrompts,
  parseArticleImages,
  extractImageUrl,
  uploadImages,
  enqueueLunaImageJob,
  fetchLunaImageJobs,
  type CreativeFinishedArticle,
  type LunaImageJob,
  type LunaImageTarget,
  type WechatThemeId,
} from "../../../services/creativeApi.js";
import { renderWechatThemePreview } from "../../../services/wechatRenderer.js";

export type ArticleImageWorkflowOptions = {
  /** 通过函数读取当前文章，避免抽屉切换文章后继续写入旧对象。 */
  getArticle: () => CreativeFinishedArticle | null;
  isOpen: () => boolean;
  editContent: Ref<string>;
  humanContent: Ref<string>;
  getLastSavedContent: () => string;
  setLastSavedContent: (content: string) => void;
  getLastSavedHuman: () => string;
  setLastSavedHuman: (content: string) => void;
  setPromptDirty: (key: string, dirty: boolean) => void;
  isLivePreview: () => boolean;
  getPreviewThemeId: () => WechatThemeId;
  tickArticleChange: () => void;
  onSaved: () => void;
};

/** 在 markdown 中替换第 imageIndex 个配图，兼容占位符和已有图片两种历史格式。 */
export function applyInlineImage(md: string, imageIndex: number, newUrl: string): string {
  if (new RegExp(`\\[IMAGE${imageIndex}\\]`).test(md)) {
    return md.replace(new RegExp(`\\[IMAGE${imageIndex}\\]`, "g"), `![配图${imageIndex}](${newUrl})`);
  }
  const imgPattern = /!\[配图[^\]]*\]\([^)]+\)/g;
  if ([...md.matchAll(imgPattern)][imageIndex - 1]) {
    let count = 0;
    return md.replace(imgPattern, (full) => {
      count++;
      return count === imageIndex ? `![配图${imageIndex}](${newUrl})` : full;
    });
  }
  return `${md}\n\n![配图${imageIndex}](${newUrl})`;
}

/** 从 markdown 提取第 imageIndex 个配图 URL，用于重新生成后同步人工转写内容。 */
export function extractInlineImageUrl(md: string, imageIndex: number): string | null {
  const matches = [...md.matchAll(/!\[配图[^\]]*\]\(([^)]+)\)/g)];
  return matches[imageIndex - 1]?.[1] ?? null;
}

/** 替换 markdown 中的封面图行；没有封面图行时插入到正文开头。 */
export function applyCoverImage(md: string, newUrl: string): string {
  if (!newUrl) return md;
  const coverRegex = /^!\[封面图[^\]]*\]\([^)]+\)/m;
  if (coverRegex.test(md)) return md.replace(coverRegex, `![封面图](${newUrl})`);
  return `![封面图](${newUrl})\n\n${md}`;
}

/** 将同一目标的多条服务端记录合并为详情页需要的最新状态。 */
export function mergeLunaImageJobs(jobs: LunaImageJob[]): Record<string, LunaImageJob> {
  const next: Record<string, LunaImageJob> = {};
  for (const job of jobs) {
    const key = lunaJobKey(job.target, job.imageIndex ?? undefined);
    const previous = next[key];
    if (!previous || job.updatedAt > previous.updatedAt) next[key] = job;
  }
  return next;
}

/** 将服务端任务映射到封面或正文的单个提示词。 */
export function lunaJobKey(target: LunaImageTarget, imageIndex?: number): string {
  return target === "cover" ? "cover" : `inline-${imageIndex}`;
}

/**
 * 管理详情页全部图片相关状态和动作，包括提示词、普通上传/生图以及 GPT Luna 独立任务。
 * 这里不改变旧 ImageActionModal 流程，只负责它之外的图片工作流。
 */
export function useArticleImageWorkflow(options: ArticleImageWorkflowOptions) {
  const coverPromptGenerating = ref(false);
  const inlinePromptsGenerating = ref(false);
  const inlinePromptGeneratingIndex = ref<number | null>(null);
  const regenInlineImageLoading = ref<Set<number>>(new Set());
  const renderShortImageLoading = ref<Set<number>>(new Set());
  const uploadingInline = ref<Set<number>>(new Set());
  const uploadingCover = ref(false);
  const activeCoverIndex = ref(0);
  const regenerating = ref(false);
  const localCoverImages = ref<string[]>([]);
  const lunaImageJobs = ref<Record<string, LunaImageJob>>({});
  const appliedLunaJobIds = new Set<string>();
  let lunaImageJobsTimer: ReturnType<typeof setInterval> | null = null;

  const articleImages = computed(() => parseArticleImages(options.getArticle()?.imagesJson ?? null));

  /** 新短内容优先使用独立封面，历史短内容继续兼容 images_json 中的第一组图片。 */
  const displayCoverImages = computed(() => {
    const article = options.getArticle();
    if (!article) return [];
    if (article.direction === "short_content") {
      if (article.coverImage.length > 0) return article.coverImage.slice(0, 10);
      return parseArticleImages(article.imagesJson ?? null).map(extractImageUrl).slice(0, 10);
    }
    const source = localCoverImages.value.length > 0 ? localCoverImages.value : article.coverImage;
    return source.slice(0, 10);
  });

  /** 只有文章 trace 明确记录 codex/gpt-5.6-luna 时才展示独立按钮。 */
  const lunaImageEligible = computed(() => {
    return Boolean(options.getArticle()?.stepTrace?.some((entry) => {
      const meta = entry.meta;
      if (meta?.writingProvider === "codex" && meta.writingModel === "gpt-5.6-luna") return true;
      const shortTrace = entry as typeof entry & { provider?: string; model?: string };
      return entry.stepName === "短内容写作"
        && shortTrace.provider === "codex"
        && shortTrace.model === "gpt-5.6-luna";
    }));
  });

  /** 只生成封面提示词，现有封面图和正文均不变。 */
  async function handleGenerateCoverPrompt(): Promise<void> {
    const article = options.getArticle();
    if (!article || coverPromptGenerating.value) return;
    coverPromptGenerating.value = true;
    try {
      const result = await generateFinishedArticleCoverPrompt(article.id);
      article.coverImagePrompt = result.article.coverImagePrompt;
      options.setPromptDirty("cover", false);
      message.success("封面提示词已生成");
      options.onSaved();
    } catch {
      message.error("封面提示词生成失败");
    } finally {
      coverPromptGenerating.value = false;
    }
  }

  /** 首次成功时接收占位符；再次或单条生成只更新提示词。 */
  async function handleGenerateInlinePrompts(index?: number): Promise<void> {
    const article = options.getArticle();
    if (!article || inlinePromptsGenerating.value || inlinePromptGeneratingIndex.value !== null) return;
    if (index) inlinePromptGeneratingIndex.value = index;
    else inlinePromptsGenerating.value = true;
    try {
      const result = await generateFinishedArticleInlinePrompts(article.id, index);
      article.inlineImagePrompts = result.article.inlineImagePrompts;
      if (result.article.humanMarkdown !== null) {
        article.humanMarkdown = result.article.humanMarkdown;
        options.humanContent.value = result.article.humanMarkdown;
        options.setLastSavedHuman(result.article.humanMarkdown);
      }
      if (index) options.setPromptDirty(`inline-${index}`, false);
      message.success(index ? `配图 ${index} 提示词已更新` : "正文配图提示词已生成");
      options.tickArticleChange();
      options.onSaved();
    } catch {
      message.error("正文配图提示词生成失败");
    } finally {
      inlinePromptsGenerating.value = false;
      inlinePromptGeneratingIndex.value = null;
    }
  }

  /** 保存封面提示词，不触碰封面图和正文内容。 */
  async function saveCoverPrompt(value: string): Promise<void> {
    const article = options.getArticle();
    if (!article) return;
    try {
      await editFinishedArticle(article.id, { coverImagePrompt: value });
      article.coverImagePrompt = value;
      options.setPromptDirty("cover", false);
      options.onSaved();
    } catch {
      message.error("封面提示词保存失败");
    }
  }

  /** 保存正文单条提示词，保持其他提示词和正文图片不变。 */
  async function saveInlinePrompt(key: string, value: string): Promise<void> {
    const article = options.getArticle();
    if (!article) return;
    const prompts = { ...(article.inlineImagePrompts ?? {}), [key]: value };
    try {
      await editFinishedArticle(article.id, { inlineImagePrompts: prompts });
      article.inlineImagePrompts = prompts;
      options.setPromptDirty(`inline-${key}`, false);
      options.onSaved();
    } catch {
      message.error("正文配图提示词保存失败");
    }
  }

  /** 保存短内容的历史图片提示词数组。 */
  async function saveLegacyShortPrompt(index: number, value: string): Promise<void> {
    const article = options.getArticle();
    if (!article) return;
    const prompts = [...(article.imagePrompts ?? [])];
    prompts[index] = value;
    try {
      await editFinishedArticle(article.id, { imagePrompts: prompts });
      article.imagePrompts = prompts;
      options.setPromptDirty(`short-${index}`, false);
      options.onSaved();
    } catch {
      message.error("短内容提示词保存失败");
    }
  }

  /** 重新生成整篇文章的图片提示词，保留原有确认和覆盖语义。 */
  const regenPromptsLoading = ref(false);
  async function handleRegenImagePrompts(): Promise<void> {
    const article = options.getArticle();
    if (!article) return;
    const { Modal } = await import("ant-design-vue");
    const confirmed = await new Promise<boolean>(resolve => {
      Modal.confirm({
        bodyStyle: { padding: "24px" },
        title: "重新生成图片提示词",
        content: "将根据当前正文重新生成所有图片提示词，原有提示词会被覆盖。预计需要 2~3 分钟，确认继续？",
        okText: "确认生成", cancelText: "取消",
        onOk: () => resolve(true), onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;

    regenPromptsLoading.value = true;
    try {
      const result = await regenImagePrompts(article.id);
      if (result.ok) {
        message.success("图片提示词已更新");
        options.onSaved();
      } else {
        message.error(result.reason ?? "图片提示词生成失败");
      }
    } catch {
      message.error("图片提示词生成请求失败");
    } finally {
      regenPromptsLoading.value = false;
    }
  }

  /** 重新生成正文单图，保留人工转写文字，仅替换对应图片。 */
  async function handleRegenInlineImage(imageIndex: number): Promise<void> {
    const article = options.getArticle();
    if (!article || regenInlineImageLoading.value.has(imageIndex)) return;
    regenInlineImageLoading.value = new Set([...regenInlineImageLoading.value, imageIndex]);
    try {
      const result = await regenInlineImage(article.id, imageIndex);
      if (result.ok) {
        if (result.contentMarkdown) {
          options.editContent.value = result.contentMarkdown;
          article.contentMarkdown = result.contentMarkdown;
          options.setLastSavedContent(result.contentMarkdown);

          const newUrl = extractInlineImageUrl(result.contentMarkdown, imageIndex);
          let humanMarkdown = options.humanContent.value;
          if (newUrl) {
            humanMarkdown = applyInlineImage(options.humanContent.value, imageIndex, newUrl);
            options.humanContent.value = humanMarkdown;
            options.setLastSavedHuman(humanMarkdown);
            article.humanMarkdown = humanMarkdown;
          }

          const saveFields: Record<string, unknown> = { contentMarkdown: result.contentMarkdown };
          if (newUrl) saveFields.humanMarkdown = humanMarkdown;
          const html = renderWechatThemePreview(humanMarkdown, options.getPreviewThemeId());
          article.wechatHtml = html;
          saveFields.wechatHtml = html;
          editFinishedArticle(article.id, saveFields).catch(() => {});
        }
        if (result.images) article.imagesJson = result.images as typeof article.imagesJson;
        message.success(`配图 ${imageIndex} 已重新生成`);
        options.tickArticleChange();
      } else {
        message.error(result.reason ?? "配图生成失败");
      }
    } catch {
      message.error("配图生成请求失败");
    } finally {
      regenInlineImageLoading.value = new Set([...regenInlineImageLoading.value].filter(i => i !== imageIndex));
    }
  }

  /** 短内容配图只更新图片数组，不把图片注入正文。 */
  async function handleRenderShortImage(promptIndex: number): Promise<void> {
    const article = options.getArticle();
    if (!article || renderShortImageLoading.value.has(promptIndex)) return;
    renderShortImageLoading.value = new Set([...renderShortImageLoading.value, promptIndex]);
    try {
      const result = await renderShortImage(article.id, promptIndex);
      if (result.ok) {
        if (result.images) article.imagesJson = result.images as typeof article.imagesJson;
        message.success(`配图 ${promptIndex + 1} 已生成`);
        options.tickArticleChange();
      } else {
        message.error(result.reason ?? "配图生成失败");
      }
    } catch {
      message.error("配图生成请求失败");
    } finally {
      renderShortImageLoading.value = new Set([...renderShortImageLoading.value].filter(i => i !== promptIndex));
    }
  }

  /** 手动上传正文图并同步 AI 草稿、人工转写和公众号预览。 */
  async function handleUploadInlineImage(imageIndex: number, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    const article = options.getArticle();
    if (!files || files.length === 0 || !article) return;
    const fileArray = Array.from(files);
    input.value = "";

    uploadingInline.value = new Set([...uploadingInline.value, imageIndex]);
    try {
      const uploaded = await uploadImages(fileArray, "inline");
      if (uploaded.length === 0) {
        message.error(`配图 ${imageIndex} 上传失败`);
        return;
      }
      const newUrl = uploaded[0].storedUrl;
      const currentImages = parseArticleImages(article.imagesJson ?? null);
      const updatedImages = [...currentImages];
      while (updatedImages.length < imageIndex) updatedImages.push({ url: "", purpose: "inline", alt: "" });
      updatedImages[imageIndex - 1] = newUrl;
      article.imagesJson = updatedImages as typeof article.imagesJson;

      const aiDraftHasSameSlot = new RegExp(`\\[IMAGE${imageIndex}\\]`).test(options.editContent.value)
        || [...options.editContent.value.matchAll(/!\[配图[^\]]*\]\([^)]+\)/g)].length >= imageIndex;
      const md = aiDraftHasSameSlot ? applyInlineImage(options.editContent.value, imageIndex, newUrl) : options.editContent.value;
      const humanMarkdown = applyInlineImage(options.humanContent.value, imageIndex, newUrl);
      options.editContent.value = md;
      options.humanContent.value = humanMarkdown;
      article.contentMarkdown = md;
      article.humanMarkdown = humanMarkdown;
      options.setLastSavedContent(md);
      options.setLastSavedHuman(humanMarkdown);

      const saveFields: Record<string, unknown> = {
        contentMarkdown: md,
        humanMarkdown: humanMarkdown,
        images: updatedImages,
      };
      const html = renderWechatThemePreview(humanMarkdown, options.getPreviewThemeId());
      article.wechatHtml = html;
      saveFields.wechatHtml = html;

      await editFinishedArticle(article.id, saveFields);
      message.success(`配图 ${imageIndex} 已上传`);
      options.tickArticleChange();
    } catch {
      message.error(`配图 ${imageIndex} 上传失败`);
    } finally {
      uploadingInline.value = new Set([...uploadingInline.value].filter(i => i !== imageIndex));
    }
  }

  /** 重新生成封面并同步两栏正文中的封面图行。 */
  async function handleRegenCover(): Promise<void> {
    const article = options.getArticle();
    if (!article || regenerating.value) return;
    regenerating.value = true;
    try {
      const result = await regenCover(article.id);
      if (result.ok && result.coverImage) {
        localCoverImages.value = result.coverImage;
        activeCoverIndex.value = 0;
        article.coverImage = result.coverImage;
        article.coverImageIndex = 0;

        const newUrl = result.coverImage[0] ?? "";
        const md = applyCoverImage(options.editContent.value, newUrl);
        const humanMarkdown = applyCoverImage(options.humanContent.value, newUrl);
        options.editContent.value = md;
        options.humanContent.value = humanMarkdown;
        article.contentMarkdown = md;
        article.humanMarkdown = humanMarkdown;
        options.setLastSavedContent(md);
        options.setLastSavedHuman(humanMarkdown);

        const saveFields: Record<string, unknown> = {
          coverImageIndex: 0,
          contentMarkdown: md,
          humanMarkdown: humanMarkdown,
        };
        if (!options.isLivePreview() && humanMarkdown) {
          const html = renderWechatThemePreview(humanMarkdown, options.getPreviewThemeId());
          article.wechatHtml = html;
          saveFields.wechatHtml = html;
        }
        editFinishedArticle(article.id, saveFields).catch(() => {});

        message.success("新封面图已生成");
        options.tickArticleChange();
      } else {
        message.error(result.reason ?? "封面图生成失败");
      }
    } catch {
      message.error("封面图生成请求失败");
    } finally {
      regenerating.value = false;
    }
  }

  /** 手动上传封面图并追加到封面列表，默认选中新图。 */
  async function handleUploadCover(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    const article = options.getArticle();
    if (!files || files.length === 0 || !article) return;
    const fileArray = Array.from(files);
    input.value = "";

    uploadingCover.value = true;
    try {
      const uploaded = await uploadImages(fileArray, "cover");
      if (uploaded.length === 0) {
        message.error("封面图上传失败");
        return;
      }
      const newUrl = uploaded[0].storedUrl;
      const updatedCovers = [newUrl, ...displayCoverImages.value];
      localCoverImages.value = updatedCovers;
      activeCoverIndex.value = 0;
      article.coverImage = updatedCovers;
      article.coverImageIndex = 0;

      const md = applyCoverImage(options.editContent.value, newUrl);
      const humanMarkdown = applyCoverImage(options.humanContent.value, newUrl);
      options.editContent.value = md;
      options.humanContent.value = humanMarkdown;
      article.contentMarkdown = md;
      article.humanMarkdown = humanMarkdown;
      options.setLastSavedContent(md);
      options.setLastSavedHuman(humanMarkdown);

      const saveFields: Record<string, unknown> = {
        coverImage: updatedCovers,
        coverImageIndex: 0,
        contentMarkdown: md,
        humanMarkdown: humanMarkdown,
      };
      if (!options.isLivePreview() && humanMarkdown) {
        const html = renderWechatThemePreview(humanMarkdown, options.getPreviewThemeId());
        article.wechatHtml = html;
        saveFields.wechatHtml = html;
      }
      await editFinishedArticle(article.id, saveFields);
      message.success("封面图已上传");
      options.tickArticleChange();
    } catch {
      message.error("封面图上传失败");
    } finally {
      uploadingCover.value = false;
    }
  }

  /** 选择发布封面；短内容只保存索引，长文同步两栏正文的封面图。 */
  async function selectCoverImage(index: number): Promise<void> {
    const article = options.getArticle();
    if (!article || index === activeCoverIndex.value) return;
    if (article.direction === "short_content") {
      activeCoverIndex.value = index;
      try {
        await editFinishedArticle(article.id, { coverImageIndex: index });
        article.coverImageIndex = index;
        options.onSaved();
      } catch { /* 静默失败，本地状态已更新 */ }
      return;
    }

    const newUrl = displayCoverImages.value[index];
    const content = applyCoverImage(options.editContent.value, newUrl);
    const humanMarkdown = applyCoverImage(options.humanContent.value, newUrl);
    activeCoverIndex.value = index;
    options.editContent.value = content;
    options.humanContent.value = humanMarkdown;
    options.setLastSavedHuman(humanMarkdown);

    try {
      const saveFields: Record<string, unknown> = {
        coverImageIndex: index,
        contentMarkdown: content,
        humanMarkdown: humanMarkdown,
      };
      if (!options.isLivePreview() && humanMarkdown) {
        const html = renderWechatThemePreview(humanMarkdown, options.getPreviewThemeId());
        article.wechatHtml = html;
        saveFields.wechatHtml = html;
      }

      await editFinishedArticle(article.id, saveFields);
      article.coverImageIndex = index;
      article.contentMarkdown = content;
      article.humanMarkdown = humanMarkdown;
      options.setLastSavedContent(content);
      options.onSaved();
    } catch { /* 静默失败，本地状态已更新 */ }
  }

  /** 将独立任务的最终图片结果合并到当前文章视图，不触碰图片提示词。 */
  function applyLunaJobResult(job: LunaImageJob): void {
    const article = options.getArticle();
    if (!article || job.status !== "succeeded" || !job.imageUrl) return;
    if (appliedLunaJobIds.has(job.jobId)) return;
    appliedLunaJobIds.add(job.jobId);

    if (job.target === "cover") {
      const covers = Array.isArray(job.coverImage)
        ? job.coverImage
        : [job.imageUrl, ...displayCoverImages.value];
      localCoverImages.value = covers;
      article.coverImage = covers;
      article.coverImageIndex = 0;
      activeCoverIndex.value = 0;
    } else if (job.imageIndex != null) {
      if (Array.isArray(job.images)) article.imagesJson = job.images as typeof article.imagesJson;
      if (typeof job.contentMarkdown === "string") {
        article.contentMarkdown = job.contentMarkdown;
        const draftWasDirty = options.editContent.value !== options.getLastSavedContent();
        options.editContent.value = draftWasDirty
          ? applyInlineImage(options.editContent.value, job.imageIndex, job.imageUrl)
          : job.contentMarkdown;
        if (!draftWasDirty) options.setLastSavedContent(job.contentMarkdown);
      }
      if (typeof job.humanMarkdown === "string") {
        article.humanMarkdown = job.humanMarkdown;
        const humanWasDirty = options.humanContent.value !== options.getLastSavedHuman();
        options.humanContent.value = humanWasDirty
          ? applyInlineImage(options.humanContent.value, job.imageIndex, job.imageUrl)
          : job.humanMarkdown;
        if (!humanWasDirty) options.setLastSavedHuman(job.humanMarkdown);
      }
    }
    options.tickArticleChange();
    options.onSaved();
  }

  /** 查询 Luna 任务并在没有活动任务时停止轮询，避免详情页常驻请求。 */
  async function loadLunaImageJobs(): Promise<void> {
    const article = options.getArticle();
    if (!options.isOpen() || !article || !lunaImageEligible.value) return;
    try {
      const result = await fetchLunaImageJobs(article.id);
      const next = mergeLunaImageJobs(result.jobs ?? []);
      lunaImageJobs.value = next;
      Object.values(next).forEach(applyLunaJobResult);
      const hasActiveJob = Object.values(next).some(job => job.status === "queued" || job.status === "running");
      if (hasActiveJob) startLunaImageJobsPolling();
      else stopLunaImageJobsPolling();
    } catch {
      // 轮询失败不弹重复错误；下一次打开或用户点击时仍可继续请求。
    }
  }

  /** 启动独立 Luna 状态轮询，间隔内不触发任何旧图片流程。 */
  function startLunaImageJobsPolling(): void {
    if (lunaImageJobsTimer) return;
    lunaImageJobsTimer = setInterval(() => { void loadLunaImageJobs(); }, 3_000);
  }

  /** 清理详情关闭或组件销毁时的 Luna 状态轮询。 */
  function stopLunaImageJobsPolling(): void {
    if (!lunaImageJobsTimer) return;
    clearInterval(lunaImageJobsTimer);
    lunaImageJobsTimer = null;
  }

  /** 提交一个提示词对应的一张 Luna 图片；封面追加，正文由服务端覆盖对应位置。 */
  async function handleGenerateLunaImage(target: LunaImageTarget, imageIndex?: number): Promise<void> {
    const article = options.getArticle();
    if (!article || !lunaImageEligible.value) return;
    const key = lunaJobKey(target, imageIndex);
    const current = lunaImageJobs.value[key];
    if (current?.status === "queued" || current?.status === "running") return;
    try {
      const result = await enqueueLunaImageJob(article.id, target, imageIndex);
      if (!result.job) {
        message.error(result.reason ?? "Luna 生图任务提交失败");
        return;
      }
      lunaImageJobs.value = { ...lunaImageJobs.value, [key]: result.job };
      startLunaImageJobsPolling();
      message.success(target === "cover" ? "Luna 封面图已排队，完成后追加到封面列表" : `Luna 配图${imageIndex}已排队，完成后覆盖对应图片`);
    } catch {
      message.error("Luna 生图任务提交失败");
    }
  }

  /** 重新打开文章时清理上一文章的本地图片状态，保留服务端图片和任务记录。 */
  function resetImageState(article: CreativeFinishedArticle): void {
    localCoverImages.value = [];
    lunaImageJobs.value = {};
    appliedLunaJobIds.clear();
    activeCoverIndex.value = article.coverImageIndex ?? 0;
  }

  // 检测正文中剩余的占位符索引；短内容没有正文占位符时仍由提示词数组提供槽位。
  const remainingImageSlots = computed(() => {
    const content = options.humanContent.value;
    if (!content) return [];
    const matches = content.match(/\[IMAGE(\d+)\]/gi) ?? [];
    return matches.map(match => parseInt(match.replace(/\[IMAGE|\]/gi, ""), 10));
  });

  const imagePromptSlotCount = computed(() => {
    const article = options.getArticle();
    if (!article) return 0;
    if (article.direction === "short_content") return article.imagePrompts?.length ?? 0;
    const indices = Object.keys(article.inlineImagePrompts ?? {})
      .map(Number)
      .filter(Number.isInteger);
    return indices.length > 0 ? Math.max(...indices) : 0;
  });

  const totalImageSlotCount = computed(() => {
    const fromImages = articleImages.value.length;
    const fromPlaceholders = remainingImageSlots.value.length > 0 ? Math.max(...remainingImageSlots.value) : 0;
    return Math.max(fromImages, fromPlaceholders, imagePromptSlotCount.value);
  });

  const inlineImageSlotCount = computed(() => remainingImageSlots.value.length);

  // 保留旧的完整性计算，供后续图片状态展示或调试使用；当前模板不直接依赖它。
  const inlineImagesComplete = computed(() => articleImages.value.length > 0 && inlineImageSlotCount.value === 0);

  return {
    articleImages,
    displayCoverImages,
    activeCoverIndex,
    inlineImageSlotCount,
    totalImageSlotCount,
    inlineImagesComplete,
    coverPromptGenerating,
    inlinePromptsGenerating,
    inlinePromptGeneratingIndex,
    uploadingCover,
    uploadingInline,
    lunaImageEligible,
    lunaImageJobs,
    regenPromptsLoading,
    regenInlineImageLoading,
    renderShortImageLoading,
    regenerating,
    handleGenerateCoverPrompt,
    handleGenerateInlinePrompts,
    saveCoverPrompt,
    saveInlinePrompt,
    saveLegacyShortPrompt,
    handleRegenImagePrompts,
    handleRegenInlineImage,
    handleRenderShortImage,
    handleUploadInlineImage,
    handleRegenCover,
    handleUploadCover,
    selectCoverImage,
    handleGenerateLunaImage,
    loadLunaImageJobs,
    stopLunaImageJobsPolling,
    resetImageState,
  };
}
