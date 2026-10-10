import { ref, watch, computed, nextTick, onBeforeUnmount } from "vue";
import { message, Modal } from "ant-design-vue";
import { useArticleEditorViewport } from "./article-detail/useArticleEditorViewport.js";
import { useArticleAutosave } from "./article-detail/useArticleAutosave.js";
import { useArticleImageWorkflow } from "./article-detail/useArticleImageWorkflow.js";
import { readManualTextTask, runManualModelTask } from "./article-detail/manualTextTaskWait.js";
import { useArticlePlanningActions, type PreviewThemeKey } from "./article-detail/useArticlePlanningActions.js";
import { syncArticleEditorContent } from "./article-detail/articleDetailContentSync.js";
import { checkPublishConditions } from "./articleStatusShared.js";
import { hasDraftPushStatus } from "../../../core/creative/manualForcedRewrite.js";
import { editFinishedArticle, readCreativeSourceItem, deleteFinishedArticle, restoreFinishedArticle, generateComments, generateAuthorExtensions, generateFinishedArticleCodeImages, type CreativeFinishedArticle, type WechatThemeId } from "../../services/creativeApi.js";
import { renderWechatThemePreview } from "../../services/wechatRenderer.js";
import { formatRelativeTime, parseJsonArray } from "./article-detail/articleDetailPresentation.js";
import { readFirstH1 } from "./article-detail/articleTitleSync.js";

export type ArticleDetailDrawerProps = {
  open: boolean;
  article: CreativeFinishedArticle | null;
  readonly?: boolean;
  loading?: boolean;
};

export type ArticleDetailDrawerEvents = {
  "update:open": [value: boolean];
  saved: [];
  openSourceItem: [sourceItemId: number];
  openPush: [article: CreativeFinishedArticle, themeId: WechatThemeId];
};

/** 按响应式文章属性协调编辑器，向模板返回状态与动作；保存、图片和发布复用专用组合式逻辑，关闭按原编号收口脏稿。 */
export function useArticleDetailDrawer(props: ArticleDetailDrawerProps, emit: <K extends keyof ArticleDetailDrawerEvents>(event: K, ...args: ArticleDetailDrawerEvents[K]) => void) {


  const isManualArticle = computed(() => props.article?.originType === "manual");

  // 深层文章对象修改不会触发响应式，图片和保存组合式逻辑通过这个计数器通知发布条件重新计算。
  const articleChangeTick = ref(0);
  /** 通知依赖文章深层字段的展示重新计算，不直接发起保存。 */
  function tickArticleChange(): void { articleChangeTick.value++; }

  const previewThemeOptions: { key: PreviewThemeKey; label: string }[] = [
    { key: "classic", label: "默认" },
    { key: "bauhaus", label: "包豪斯" },
    { key: "sunsetFilm", label: "落日胶片" },
    { key: "receipt", label: "购物小票" },
    { key: "blackGold", label: "黑金主题" },
    { key: "live", label: "实时预览" },
  ];

  const activePreviewTheme = ref<PreviewThemeKey>("sunsetFilm");

  const themeIdMap: Record<Exclude<PreviewThemeKey, "live">, WechatThemeId> = {
    classic: "classic",
    bauhaus: "bauhaus",
    sunsetFilm: "sunset-film",
    receipt: "receipt",
    blackGold: "black-gold",
  };

  const reverseThemeIdMap: Record<string, Exclude<PreviewThemeKey, "live">> = {
    classic: "classic",
    bauhaus: "bauhaus",
    "sunset-film": "sunsetFilm",
    receipt: "receipt",
    "black-gold": "blackGold",
  };

  /** 图片操作使用当前预览主题；实时预览没有固定主题时沿用原来的 classic 兜底。 */
  function getImagePreviewThemeId(): WechatThemeId {
    if (activePreviewTheme.value !== "live") return themeIdMap[activePreviewTheme.value];
    return "classic";
  }

  // 编辑器可视区由组合式逻辑管理，抽屉只负责在打开/关闭时调用其生命周期方法。
  const {
    articleDetailMaskStyle,
    articleDetailWrapClass,
    autoFocusModeEnabled,
    dynamicEditorHeight,
    editorFullscreen,
    editorSectionRef,
    focusMode,
    handleFullscreenEsc,
    resetEditorFullscreen,
    setupEditorResize,
    syncScrollEnabled,
    teardownEditorResize,
    toggleAutoFocusMode,
    toggleEditorFullscreen,
    toggleSyncScroll,
    unlockFocusMode,
  } = useArticleEditorViewport();
  /** 将当前文章编号复制到剪贴板并显示原有操作反馈。 */
  function copyArticleId(id: number): void {
    navigator.clipboard.writeText(`【成品文章id: ${id}】`).then(() => {
      message.success("已复制");
    });
  }
  /** 复制当前图片提示词，不改变提示词或图片任务。 */
  function copyPrompt(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      message.success("已复制");
    });
  }

  const codeImagesGenerating = ref(false);

  /** 本地制作当前成品的三比例代码图，同步短内容人工正文与封面候选；长文正文保持不变。 */
  async function handleGenerateCodeImages(mode: "missing" | "all"): Promise<void> {
    if (!props.article) return;
    codeImagesGenerating.value = true;
    try {
      const result = await generateFinishedArticleCodeImages(props.article.id, mode);
      if (result.article) {
        Object.assign(props.article, result.article);
        syncCurrentArticleContent();
      }
      if (result.status === "succeeded") message.success("三张代码制图片已完成");
      else if (result.status === "partial") message.warning("部分代码制图片已完成，可稍后补做失败图片");
      else if (result.status === "running") message.info("图片正在制作中，请稍后刷新");
      else message.error(result.reason ?? "代码制图片制作失败");
      tickArticleChange();
    } catch {
      message.error("代码制图片制作失败");
    } finally {
      codeImagesGenerating.value = false;
    }
  }

  /** 复制当前图片的公开地址，供用户手动选择封面或外部分享。 */
  function copyCodeImageUrl(url: string): void {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => message.success("图片地址已复制"));
  }

  // 提示词编辑使用显式保存；关闭弹窗前统一检查仍未保存的行。
  const promptDirtyKeys = ref<Set<string>>(new Set());
  /** 标记指定提示词已编辑，供保存时区分用户输入与服务端快照。 */
  function setPromptDirty(key: string, dirty: boolean): void {
    const next = new Set(promptDirtyKeys.value);
    if (dirty) next.add(key);
    else next.delete(key);
    promptDirtyKeys.value = next;
  }

  // ─── 正文编辑 ───

  const editContent = ref("");
  // 人工转写内容（中栏 = 发布内容）：注入真人 token 过朱雀；打开时初始预填 AI 草稿副本
  const humanContent = ref("");
  // 相对时间展示需要每秒刷新，用 tick 驱动 computed 重算
  const relativeTick = ref(0);
  let relativeTimer: ReturnType<typeof setInterval> | null = null;
  // 记住打开时的原始内容，用于判断是否真正发生变化
  let lastSavedContent = "";
  let lastSavedHuman = "";

  /** 同步当前服务端文章正文；未保存的用户编辑按栏位独立保留。 */
  function syncCurrentArticleContent(force = false): void {
    if (!props.article) return;
    syncArticleEditorContent({
      article: props.article,
      editContent,
      humanContent,
      getLastSavedContent: () => lastSavedContent,
      setLastSavedContent: (value) => { lastSavedContent = value; },
      getLastSavedHuman: () => lastSavedHuman,
      setLastSavedHuman: (value) => { lastSavedHuman = value; },
      force,
    });
  }

  const {
    saving,
    lastSavedAt,
    clearAutosaveTimers,
    prepareExplicitContentSave,
    flushAutosaveBeforeClose,
    enqueueDraftAutosave,
    enqueueHumanAutosave,
  } = useArticleAutosave({
    getArticle: () => props.article,
    editContent,
    humanContent,
    getLastSavedContent: () => lastSavedContent,
    setLastSavedContent: (content) => { lastSavedContent = content; },
    getLastSavedHuman: () => lastSavedHuman,
    setLastSavedHuman: (content) => { lastSavedHuman = content; },
    isOpen: () => props.open,
    isReadonly: () => Boolean(props.readonly),
  });

  const {
    articleImages,
    displayCoverImages,
    activeCoverIndex,
    inlineImageSlotCount,
    totalImageSlotCount,
    coverPromptGenerating,
    inlinePromptsGenerating,
    inlinePromptGeneratingIndex,
    uploadingCover,
    uploadingInline,
    lunaImageEligible,
    lunaImageJobs,
    handleGenerateCoverPrompt,
    handleUploadCover,
    selectCoverImage,
    saveCoverPrompt,
    handleGenerateInlinePrompts,
    handleUploadInlineImage,
    saveInlinePrompt,
    saveLegacyShortPrompt,
    handleGenerateLunaImage,
    loadLunaImageJobs,
    stopLunaImageJobsPolling,
    resetImageState,
  } = useArticleImageWorkflow({
    getArticle: () => props.article,
    isOpen: () => props.open,
    editContent,
    humanContent,
    getLastSavedContent: () => lastSavedContent,
    setLastSavedContent: (content) => { lastSavedContent = content; },
    getLastSavedHuman: () => lastSavedHuman,
    setLastSavedHuman: (content) => { lastSavedHuman = content; },
    prepareExplicitContentSave,
    setPromptDirty,
    isLivePreview: () => activePreviewTheme.value === "live",
    getPreviewThemeId: getImagePreviewThemeId,
    tickArticleChange,
    onSaved: () => emit("saved"),
  });

  const savedAtLabel = computed(() => {
    // 依赖 relativeTick 触发重算
    void relativeTick.value;
    if (lastSavedAt.value == null) return "";
    return `保存成功 · ${formatRelativeTime(lastSavedAt.value)}`;
  });

  const {
    manualTitle,
    regenTitleLoading,
    activeTitleIndex,
    localTitles,
    editingTitleIdx,
    editingTitleValue,
    displayTitles,
    titleCandidateAt,
    handleRegenTitle,
    buildTitleSync,
    applyTitleSync,
    saveManualTitle,
    selectTitle,
    startEditTitle,
    cancelEditTitle,
    saveTitleEdit,
    regenIntroLoading,
    activeIntroIndex,
    localIntros,
    displayIntros,
    displaySummaries,
    handleRegenIntro,
    selectIntro,
    regenCodeImageKeywordsLoading,
    handleRegenCodeImageKeywords,
    handleCancelTextTask,
  } = useArticlePlanningActions({
    // 关闭详情即停止文案查询，后台任务和浏览器任务编号继续保留。
    getArticle: () => props.open ? props.article : null,
    isManualArticle,
    editContent,
    humanContent,
    activePreviewTheme,
    themeIdMap,
    prepareExplicitContentSave,
    getLastSavedContent: () => lastSavedContent,
    setLastSavedContent: (content) => { lastSavedContent = content; },
    getLastSavedHuman: () => lastSavedHuman,
    setLastSavedHuman: (content) => { lastSavedHuman = content; },
    onSaved: () => emit("saved"),
  });

  // 审核弹窗
  const reviewModalVisible = ref(false);

  // 手动生图弹窗
  const imageActionVisible = ref(false);
  /** 审核完成后同步当前文章状态并通知原有刷新入口。 */
  function handleReviewDone(): void {
    emit("saved");
  }
  /** 合并图片操作结果并通知展示更新，不覆盖当前人工编辑稿。 */
  function handleImageActionDone(): void {
    tickArticleChange();
    emit("saved");
  }

  const generatingComments = ref(false);
  /** 恢复或提交评论任务；离开文章后不写入另一篇详情。 */
  async function handleGenerateComments(): Promise<void> {
    const article = props.article;
    if (!article || generatingComments.value) return;
    generatingComments.value = true;
    try {
      const result = await runManualModelTask(article.id, "comments", () => generateComments(article.id), () => props.open && props.article?.id === article.id);
      if (!result || !props.open || props.article?.id !== article.id) return;
      if (result.ok && result.comments) {
        article.comments = result.comments;
        message.success(`已生成 ${result.comments.length} 对评论`);
        tickArticleChange();
      } else {
        message.error(result.reason ?? "评论生成失败");
      }
    } catch {
      message.error("评论生成请求失败");
    } finally {
      generatingComments.value = false;
    }
  }

  const generatingAuthorExtensions = ref(false);
  /** 恢复或提交作者拓展任务；关闭详情只停止查询，不取消生成。 */
  async function handleGenerateAuthorExtensions(): Promise<void> {
    const article = props.article;
    if (!article || generatingAuthorExtensions.value) return;
    generatingAuthorExtensions.value = true;
    try {
      const result = await runManualModelTask(article.id, "extensions", () => generateAuthorExtensions(article.id), () => props.open && props.article?.id === article.id);
      if (!result || !props.open || props.article?.id !== article.id) return;
      if (result.ok && result.extensions) {
        article.authorExtensions = result.extensions;
        message.success(`已生成 ${result.extensions.length} 条作者拓展`);
        tickArticleChange();
      } else {
        message.error(result.reason ?? "作者拓展生成失败");
      }
    } catch {
      message.error("作者拓展生成请求失败");
    } finally {
      generatingAuthorExtensions.value = false;
    }
  }

  /** 重开详情只恢复已有的评论/拓展编号，不自动发起新模型调用。 */
  watch(() => [props.open, props.article?.id] as const, ([open, id]) => {
    if (!open || !id) return;
    if (readManualTextTask(id, "comments")) void handleGenerateComments();
    if (readManualTextTask(id, "extensions")) void handleGenerateAuthorExtensions();
  }, { immediate: true });

  // ─── 素材原图：按 sourceItemId 取素材 cover 外链展示（不转存，no-referrer 绕防盗链）───
  const sourceCoverUrl = ref<string | null>(null);
  watch(() => [props.open, props.article?.sourceItemId] as const, ([open, sid], _previous, onCleanup) => {
    let current = true;
    // 切换素材、关闭及卸载都会使旧读取失效，旧失败也不能清空新素材封面。
    onCleanup(() => { current = false; });
    sourceCoverUrl.value = null;
    if (!open || !sid) return;
    readCreativeSourceItem(sid)
      .then(s => { if (current) sourceCoverUrl.value = s.coverImageUrl ?? null; })
      .catch(() => { if (current) sourceCoverUrl.value = null; });
  }, { immediate: true });

  /**
   * 打开或切换到有效文章时做首次初始化，关闭时收尾。
   * 加载态会先以 article=null 打开，所以条件必须同时看 open 与文章，
   * 否则正文到达后初始化与高度测量都不会执行。
   */
  watch(() => [props.open, props.article?.id] as const, ([open, id], previous) => {
    const ready = Boolean(open && id);
    const wasReady = Boolean(previous?.[0] && previous?.[1]);
    if (ready && (!wasReady || previous?.[1] !== id)) {
      // 原稿属于上一文章，必须在重置编辑器前按原编号提交，不能写入新文章。
      if (wasReady && previous?.[1] !== id && !props.readonly) {
        if (editContent.value !== lastSavedContent) enqueueDraftAutosave(editContent.value, previous?.[1]);
        if (humanContent.value !== lastSavedHuman) enqueueHumanAutosave(humanContent.value, previous?.[1]);
      }
      // 首次打开强制以服务端正文初始化；保持打开后的刷新则走下面的安全同步监听。
      syncCurrentArticleContent(true);
      // 重置保存时间，避免上一篇的相对时间残留到当前文章
      lastSavedAt.value = null;
      // 重置本地缓存状态
      resetImageState(props.article!);
      localTitles.value = [];
      manualTitle.value = parseJsonArray(props.article!.titles)[0] ?? readFirstH1(humanContent.value || editContent.value);
      promptDirtyKeys.value = new Set();
      localIntros.value = [];
      activeTitleIndex.value = props.article!.titleIndex ?? 0;
      activeIntroIndex.value = props.article!.introIndex ?? 0;
      // 重置标题编辑态，避免上一篇的编辑下标残留到当前文章
      editingTitleIdx.value = null;
      editingTitleValue.value = "";
      clearAutosaveTimers();
      resetEditorFullscreen();
      document.addEventListener("keydown", handleFullscreenEsc);
      // 恢复文章保存的主题偏好，无记录时默认使用落日胶片。
      const saved = props.article!.wechatThemeId;
      const previewKey = saved ? reverseThemeIdMap[saved] : undefined;
      activePreviewTheme.value = previewKey ?? "sunsetFilm";
      // 正文渲染后再测量编辑器可用高度，此时顶部与底部已确定。
      nextTick(() => { if (props.open && props.article?.id === id) setupEditorResize(); });
      void loadLunaImageJobs();
      return;
    }
    if (!open && previous?.[0]) {
      stopLunaImageJobsPolling();
      teardownEditorResize();
      // 关闭弹窗时如果有未保存的内容，立即保存一次，避免防抖定时器还没触发就丢失
      clearAutosaveTimers();
      // 父页可能同时清空 article；使用监听的原编号，队列仍会校验响应不能串写当前界面。
      if (!props.readonly && editContent.value !== lastSavedContent) {
        enqueueDraftAutosave(editContent.value, previous?.[1]);
      }
      if (!props.readonly && humanContent.value !== lastSavedHuman) {
        enqueueHumanAutosave(humanContent.value, previous?.[1]);
      }
    }
  }, { immediate: true });

  watch(
    () => [props.article?.id, props.article?.contentMarkdown, props.article?.humanMarkdown] as const,
    (current, previous) => {
      if (!props.open || !props.article) return;
      // 同一篇文章的图片回写只同步未编辑栏位；弹窗内切换文章时强制重置两栏。
      syncCurrentArticleContent(previous?.[0] !== current[0]);
    },
  );

  /** 手动保存等待自动队列收口后，再执行双栏正文和标题的完整同步。 */
  async function handleSave(): Promise<boolean> {
    if (!props.article) return false;
    saving.value = true;
    try {
      await prepareExplicitContentSave();
      if (!props.article) return false;
      const sync = buildTitleSync(humanContent.value);
      // 手动保存同时落盘左栏 AI 草稿（content_markdown）和中栏人工转写（human_markdown）
      const saved = await editFinishedArticle(props.article.id, {
        contentMarkdown: editContent.value,
        ...sync.fields,
      });
      applyTitleSync(sync);
      if (saved.updatedAt) props.article.updatedAt = saved.updatedAt;
      lastSavedContent = sync.contentMarkdown ?? editContent.value;
      lastSavedHuman = sync.humanMarkdown;
      tickArticleChange();
      lastSavedAt.value = Date.now();
      emit("saved");
      return true;
    } catch {
      message.error("保存失败");
      return false;
    } finally {
      saving.value = false;
    }
  }

  /** 保存最新发布正文后立即进入草稿箱推送，不再要求用户重复确认同一动作。 */
  async function saveAndPush(): Promise<void> {
    if (!props.article) return;
    // 中栏（发布内容）为空则阻止发布
    if (!humanContent.value.trim()) {
      message.warning("请先在中间栏输入或转写发布内容");
      return;
    }
    if (!await handleSave()) return;
    emit("openPush", props.article, currentWechatThemeId.value);
  }
  let closing = false;
  /** 全屏时只退出；提示词需确认放弃，正文保存成功后才通知父页关闭，失败仍保留当前稿。 */
  async function handleClose(): Promise<void> {
    if (closing) return;
    // 全屏状态下 ESC/关闭只退出全屏，不连带关闭详情弹窗。
    if (editorFullscreen.value) { resetEditorFullscreen(); return; }
    const articleId = props.article?.id;
    closing = true;
    try {
      if (promptDirtyKeys.value.size > 0) {
        const confirmed = await new Promise<boolean>((resolve) => {
          Modal.confirm({
            title: "提示词尚未保存",
            content: "关闭后会丢失正在编辑的提示词，确认关闭？",
            okText: "放弃修改",
            cancelText: "继续编辑",
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (!confirmed) return;
      }
      if (articleId && props.article?.id !== articleId) return;
      if (!await flushAutosaveBeforeClose()) return;
      if (articleId && props.article?.id !== articleId) return;
      promptDirtyKeys.value = new Set();
      document.removeEventListener("keydown", handleFullscreenEsc);
      emit("update:open", false);
    } finally { closing = false; }
  }

  // ─── 预览主题切换 ───

  // 切换预览主题：客户端即时渲染（基于人工转写内容 = 发布内容）
  function switchPreviewTheme(key: PreviewThemeKey): void {
    activePreviewTheme.value = key;
    if (key === "live" || !humanContent.value) return;

    const themeId = themeIdMap[key];
    const html = renderWechatThemePreview(humanContent.value, themeId);

    // 首次选中该主题时保存偏好和渲染结果
    if (props.article && (props.article.wechatThemeId !== themeId || props.article.wechatHtml !== html)) {
      props.article.wechatThemeId = themeId;
      props.article.wechatHtml = html;
      editFinishedArticle(props.article.id, { wechatThemeId: themeId, wechatHtml: html }).catch(() => {});
    }
  }

  const mediaQuery = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 768px)") : null;
  const mobileViewport = ref(mediaQuery?.matches ?? window.innerWidth <= 768);
  const mobilePreviewOpen = ref(false);
  /** 与既有 CSS 断点一致；方向变化后只调整预览计算，不改变编辑稿和保存节奏。 */
  function handlePreviewViewport(event: MediaQueryListEvent): void { mobileViewport.value = event.matches; }
  mediaQuery?.addEventListener?.("change", handlePreviewViewport);
  onBeforeUnmount(() => mediaQuery?.removeEventListener?.("change", handlePreviewViewport));
  const previewEnabled = computed(() => props.open && (props.readonly === true || !mobileViewport.value || mobilePreviewOpen.value));

  // 不可见时不读取正文依赖，手机输入不会触发重复渲染；打开预览时一次读取最新稿。
  const activePreviewHtml = computed(() => {
    if (!previewEnabled.value || activePreviewTheme.value === "live") return "";
    const themeId = themeIdMap[activePreviewTheme.value];
    if (!humanContent.value) return "";
    return renderWechatThemePreview(humanContent.value, themeId);
  });

  const activePreviewLabel = computed(() => {
    const opt = previewThemeOptions.find(o => o.key === activePreviewTheme.value);
    return opt?.label ?? "预览";
  });

  /** 编辑器面板传回字符串键；父抽屉保留主题枚举约束。 */
  function handlePreviewThemeSelection(key: string): void {
    if (previewThemeOptions.some((option) => option.key === key)) {
      switchPreviewTheme(key as PreviewThemeKey);
    }
  }

  // 当前主题对应的 WechatThemeId（用于复制公众号格式和推送）
  const currentWechatThemeId = computed<WechatThemeId>(() => {
    if (activePreviewTheme.value !== "live") {
      return themeIdMap[activePreviewTheme.value as Exclude<PreviewThemeKey, "live">];
    }
    // 实时预览模式下回退到文章保存的主题
    return (props.article?.wechatThemeId as WechatThemeId) ?? "sunset-film";
  });

  // ─── 微信公众号格式复制 ───

  const wechatCopying = ref(false);
  /** 按当前主题生成并复制微信格式，保留原有文本和 HTML 输出。 */
  async function copyAsWechatFormat(): Promise<void> {
    if (!humanContent.value) {
      message.warning("文章无正文内容");
      return;
    }
    if (!props.article) return;
    wechatCopying.value = true;
    try {
      const html = renderWechatThemePreview(humanContent.value, currentWechatThemeId.value);
      const htmlBlob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([humanContent.value], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })
      ]);
      message.success("已复制公众号格式，可直接粘贴到编辑器");
    } catch {
      message.error("复制失败，请检查浏览器剪贴板权限");
    } finally {
      wechatCopying.value = false;
    }
  }

  // ─── 纯文本复制 ───

  async function copyText(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    message.success("已复制到剪贴板");
  }

  /** 编辑器操作区复制 AI 草稿，避免子组件了解父级文本状态。 */
  function copyAiDraft(): void {
    void copyText(editContent.value);
  }

  /** 编辑器操作区复制清洗后的 AI 草稿。 */
  function copyAiDraftAsPlainText(): void {
    void copyMarkdownAsPlainText(editContent.value);
  }
  /** 将指定 Markdown 转成复制用纯文本，保留当前编辑稿。 */
  async function copyMarkdownAsPlainText(mdText: string): Promise<void> {
    const text = mdText
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`(.*?)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^[-*]\s+/gm, "")
      .replace(/^>\s+/gm, "")
      .replace(/---+/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    await navigator.clipboard.writeText(text);
    message.success("已复制纯文本到剪贴板");
  }

  // ─── 推送条件检查（复用共享模块） ───
  // props.article 深层属性修改不会触发响应式，用一个计数器手动刷新
  const canPush = computed(() => {
    void articleChangeTick.value;
    const article = props.article;
    if (!article) return false;
    const allowed = hasDraftPushStatus(article);
    if (!allowed) return false;
    return checkPublishConditions(article).qualified;
  });

  const missingConditions = computed(() => {
    void articleChangeTick.value;
    const article = props.article;
    if (!article) return [];
    const missing: string[] = [];
    const allowed = hasDraftPushStatus(article);
    if (!allowed) missing.push("状态不允许推送");
    missing.push(...checkPublishConditions(article).missing);
    return missing;
  });

  // ─── 状态操作（标记可推送 / 取消推送标记） ───

  async function handleDetailMarkPublishable(): Promise<void> {
    if (!props.article) return;
    const { Modal } = await import("ant-design-vue");
    const confirmed = await new Promise<boolean>(resolve => {
      Modal.confirm({
        bodyStyle: { padding: '24px' },
        title: "标记可推送",
        content: "确认标记该文章为可推送？后续可在平台手动推送到微信公众号草稿箱。",
        okText: "确认", cancelText: "取消",
        onOk: () => resolve(true), onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;
    try {
      const res = await editFinishedArticle(props.article.id, { status: "ready_for_publish" } as any);
      if (res.ok) {
        message.success("已标记为可推送");
        emit("saved");
      } else {
        message.error("操作失败");
      }
    } catch (err: unknown) {
      const httpErr = err as { body?: { reason?: string } };
      message.error(httpErr?.body?.reason ?? "操作失败");
    }
  }
  /** 取消当前文章可发布标记并同步展示结果。 */
  async function handleDetailCancelPublishable(): Promise<void> {
    if (!props.article) return;
    const { Modal } = await import("ant-design-vue");
    const confirmed = await new Promise<boolean>(resolve => {
      Modal.confirm({
        bodyStyle: { padding: '24px' },
        title: "取消推送标记",
        content: "确认取消推送标记？文章将回到已生成状态。",
        okText: "确认", cancelText: "取消",
        onOk: () => resolve(true), onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;
    try {
      const res = await editFinishedArticle(props.article.id, { status: "generated" } as any);
      if (res.ok) {
        message.success("已取消推送标记");
        emit("saved");
      } else {
        message.error("操作失败");
      }
    } catch (err: unknown) {
      const httpErr = err as { body?: { reason?: string } };
      message.error(httpErr?.body?.reason ?? "操作失败");
    }
  }
  /** 按原确认流程废弃当前文章并通知列表刷新。 */
  async function handleDetailDiscard(): Promise<void> {
    if (!props.article) return;
    const { Modal } = await import("ant-design-vue");
    const confirmed = await new Promise<boolean>(resolve => {
      Modal.confirm({
        bodyStyle: { padding: '24px' },
        title: "废弃文章",
        content: "废弃后文章不再走自动生图和发布流程，但保留记录可随时查看。确认废弃？",
        okText: "确认废弃", cancelText: "取消",
        onOk: () => resolve(true), onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;
    try {
      const res = await deleteFinishedArticle(props.article.id);
      if (res.ok) {
        message.success("已废弃");
        emit("saved");
      } else {
        message.error("废弃失败");
      }
    } catch {
      message.error("废弃失败");
    }
  }
  /** 恢复当前废弃文章并同步列表和详情展示。 */
  async function handleDetailRestore(): Promise<void> {
    if (!props.article) return;
    try {
      const res = await restoreFinishedArticle(props.article.id);
      if (res.ok) {
        message.success("已恢复");
        emit("saved");
      } else {
        message.error("恢复失败");
      }
    } catch {
      message.error("恢复失败");
    }
  }

  // 有保存时间后启动每秒刷新，让相对时间持续更新
  watch(lastSavedAt, (ts) => {
    if (ts != null && !relativeTimer) {
      relativeTimer = setInterval(() => { relativeTick.value++; }, 5000);
    }
  });

  onBeforeUnmount(() => {
    teardownEditorResize();
    clearAutosaveTimers();
    stopLunaImageJobsPolling();
    if (relativeTimer) { clearInterval(relativeTimer); relativeTimer = null; }
  });

  return {
    isManualArticle,
    previewThemeOptions,
    activePreviewTheme,
    articleDetailMaskStyle,
    articleDetailWrapClass,
    autoFocusModeEnabled,
    dynamicEditorHeight,
    editorFullscreen,
    focusMode,
    syncScrollEnabled,
    toggleAutoFocusMode,
    toggleEditorFullscreen,
    toggleSyncScroll,
    unlockFocusMode,
    copyArticleId,
    copyPrompt,
    codeImagesGenerating,
    handleGenerateCodeImages,
    copyCodeImageUrl,
    setPromptDirty,
    editContent,
    humanContent,
    saving,
    articleImages,
    displayCoverImages,
    activeCoverIndex,
    inlineImageSlotCount,
    totalImageSlotCount,
    coverPromptGenerating,
    inlinePromptsGenerating,
    inlinePromptGeneratingIndex,
    uploadingCover,
    uploadingInline,
    lunaImageEligible,
    lunaImageJobs,
    handleGenerateCoverPrompt,
    handleUploadCover,
    selectCoverImage,
    saveCoverPrompt,
    handleGenerateInlinePrompts,
    handleUploadInlineImage,
    saveInlinePrompt,
    saveLegacyShortPrompt,
    handleGenerateLunaImage,
    savedAtLabel,
    manualTitle,
    regenTitleLoading,
    activeTitleIndex,
    editingTitleIdx,
    editingTitleValue,
    displayTitles,
    titleCandidateAt,
    handleRegenTitle,
    saveManualTitle,
    selectTitle,
    startEditTitle,
    cancelEditTitle,
    saveTitleEdit,
    regenIntroLoading,
    activeIntroIndex,
    displayIntros,
    displaySummaries,
    handleRegenIntro,
    selectIntro,
    regenCodeImageKeywordsLoading,
    handleRegenCodeImageKeywords,
    handleCancelTextTask,
    reviewModalVisible,
    imageActionVisible,
    handleReviewDone,
    handleImageActionDone,
    generatingComments,
    handleGenerateComments,
    generatingAuthorExtensions,
    handleGenerateAuthorExtensions,
    sourceCoverUrl,
    handleSave,
    saveAndPush,
    handleClose,
    mobilePreviewOpen,
    previewEnabled,
    activePreviewHtml,
    activePreviewLabel,
    handlePreviewThemeSelection,
    wechatCopying,
    copyAsWechatFormat,
    copyText,
    copyAiDraft,
    copyAiDraftAsPlainText,
    canPush,
    missingConditions,
    handleDetailMarkPublishable,
    handleDetailCancelPublishable,
    handleDetailDiscard,
    handleDetailRestore,
    editorSectionRef,
  };
}
