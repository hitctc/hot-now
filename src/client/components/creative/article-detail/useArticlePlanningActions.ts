import { computed, ref, type ComputedRef, type Ref } from "vue";
import { message } from "ant-design-vue";

import {
  editFinishedArticle,
  regenIntro,
  regenTitle,
  type CreativeFinishedArticle,
  type WechatThemeId,
} from "../../../services/creativeApi.js";
import { renderWechatThemePreview } from "../../../services/wechatRenderer.js";
import { parseJsonArray } from "./articleDetailPresentation.js";
import {
  buildArticleTitleSync,
  replaceFirstH1 as replaceH1,
} from "./articleTitleSync.js";

export type PreviewThemeKey = "classic" | "live" | "bauhaus" | "sunsetFilm" | "receipt" | "blackGold";

type TitleSyncResult = ReturnType<typeof buildArticleTitleSync>;

export type ArticlePlanningActionsOptions = {
  getArticle: () => CreativeFinishedArticle | null;
  isManualArticle: ComputedRef<boolean>;
  editContent: Ref<string>;
  humanContent: Ref<string>;
  activePreviewTheme: Ref<PreviewThemeKey>;
  themeIdMap: Record<Exclude<PreviewThemeKey, "live">, WechatThemeId>;
  prepareExplicitContentSave: () => Promise<void>;
  getLastSavedContent: () => string;
  setLastSavedContent: (content: string) => void;
  getLastSavedHuman: () => string;
  setLastSavedHuman: (content: string) => void;
  onSaved: () => void;
};

/** 集中管理文章详情里的标题、导语和摘要选择，抽屉只保留组合式状态装配。 */
export function useArticlePlanningActions(options: ArticlePlanningActionsOptions) {
  const {
    getArticle,
    isManualArticle,
    editContent,
    humanContent,
    activePreviewTheme,
    themeIdMap,
    prepareExplicitContentSave,
    getLastSavedContent,
    setLastSavedContent,
    getLastSavedHuman,
    setLastSavedHuman,
    onSaved,
  } = options;
  const manualTitle = ref("");
  const regenTitleLoading = ref(false);
  const activeTitleIndex = ref(0);
  const localTitles = ref<string[]>([]);
  const editingTitleIdx = ref<number | null>(null);
  const editingTitleValue = ref("");
  const regenIntroLoading = ref(false);
  const activeIntroIndex = ref(0);
  const localIntros = ref<string[]>([]);

  const displayTitles = computed(() => {
    return localTitles.value.length > 0 ? localTitles.value : parseJsonArray(getArticle()?.titles ?? null);
  });

  /** 按标题索引读取 v2 元数据；旧文章没有候选元数据时返回空。 */
  function titleCandidateAt(idx: number) {
    return getArticle()?.titleCandidates?.[idx] ?? null;
  }

  async function handleRegenTitle(): Promise<void> {
    const article = getArticle();
    if (!article || regenTitleLoading.value) return;
    regenTitleLoading.value = true;
    try {
      const result = await regenTitle(article.id);
      if (result.ok && result.titles) {
        localTitles.value = result.titles;
        activeTitleIndex.value = 0;
        article.titles = JSON.stringify(result.titles);
        article.titleIndex = 0;
        article.titleCandidates = result.titleCandidates ?? null;
        article.titleSelectionConfirmed = false;
        message.success("分组标题已生成，请选择发布标题");
      } else {
        message.error(result.reason ?? "标题生成失败");
      }
    } catch {
      message.error("标题生成请求失败");
    } finally {
      regenTitleLoading.value = false;
    }
  }

  /** 将当前抽屉状态交给纯标题同步函数，保存行为保持在组件内。 */
  function buildTitleSync(content: string): TitleSyncResult {
    return buildArticleTitleSync({
      isManualArticle: isManualArticle.value,
      titles: displayTitles.value,
      activeTitleIndex: activeTitleIndex.value,
      humanMarkdown: content,
      contentMarkdown: editContent.value,
    });
  }

  /** 请求成功后再更新本地标题和正文快照，失败时保留未保存状态供自动重试。 */
  function applyTitleSync(result: TitleSyncResult): void {
    const article = getArticle();
    if (!article) return;
    humanContent.value = result.humanMarkdown;
    article.humanMarkdown = result.humanMarkdown;
    if (result.title) {
      localTitles.value = result.titles;
      article.titles = JSON.stringify(result.titles);
      manualTitle.value = result.title;
    }
    if (result.contentMarkdown !== undefined) {
      editContent.value = result.contentMarkdown;
      article.contentMarkdown = result.contentMarkdown;
      setLastSavedContent(result.contentMarkdown);
    }
  }

  /** 手动稿标题保存后同步左右两栏 H1；只有显式标题操作允许改写编辑器内容。 */
  async function saveManualTitle(): Promise<void> {
    const article = getArticle();
    if (!article || !isManualArticle.value) return;
    await prepareExplicitContentSave();
    const latestArticle = getArticle();
    if (!latestArticle || !isManualArticle.value) return;
    const title = manualTitle.value.trim();
    if (!title) {
      message.warning("标题不能为空");
      manualTitle.value = displayTitles.value[0] ?? "";
      return;
    }
    const contentMarkdown = replaceH1(editContent.value, title);
    const humanMarkdown = replaceH1(humanContent.value, title);
    const titles = [title];
    try {
      await editFinishedArticle(latestArticle.id, { titles, contentMarkdown, humanMarkdown });
      localTitles.value = titles;
      latestArticle.titles = JSON.stringify(titles);
      latestArticle.contentMarkdown = contentMarkdown;
      latestArticle.humanMarkdown = humanMarkdown;
      editContent.value = contentMarkdown;
      humanContent.value = humanMarkdown;
      setLastSavedContent(contentMarkdown);
      setLastSavedHuman(humanMarkdown);
      onSaved();
    } catch {
      message.error("标题保存失败");
    }
  }

  // 选择发布标题：替换 markdown 中的 H1，并显式记录人工确认。
  async function selectTitle(idx: number): Promise<void> {
    const article = getArticle();
    if (!article || (idx === activeTitleIndex.value && article.titleSelectionConfirmed)) return;
    await prepareExplicitContentSave();
    const latestArticle = getArticle();
    if (!latestArticle || (idx === activeTitleIndex.value && latestArticle.titleSelectionConfirmed)) return;
    const newTitle = displayTitles.value[idx];
    if (!newTitle) return;

    // 同步替换 AI 草稿和人工转写（发布内容）的 H1，只动 # 标题行不 replaceAll 正文。
    const content = replaceH1(editContent.value, newTitle);
    const humanMd = replaceH1(humanContent.value, newTitle);
    activeTitleIndex.value = idx;
    editContent.value = content;
    humanContent.value = humanMd;
    setLastSavedHuman(humanMd);

    try {
      const saveFields: Record<string, unknown> = {
        titleIndex: idx,
        titleSelectionConfirmed: true,
        contentMarkdown: content,
        humanMarkdown: humanMd,
      };

      if (activePreviewTheme.value !== "live" && humanMd) {
        const themeId = themeIdMap[activePreviewTheme.value];
        const html = renderWechatThemePreview(humanMd, themeId);
        latestArticle.wechatHtml = html;
        saveFields.wechatHtml = html;
      }

      await editFinishedArticle(latestArticle.id, saveFields);
      latestArticle.titleIndex = idx;
      latestArticle.titleSelectionConfirmed = true;
      latestArticle.contentMarkdown = content;
      latestArticle.humanMarkdown = humanMd;
      setLastSavedContent(content);
      onSaved();
    } catch {
      // 本地状态已更新，保留原有静默失败语义，等待用户下次显式保存。
    }
  }

  // 进入备选标题原地编辑：先把 displayTitles 整体固化进 localTitles，避免只改一项丢其他。
  function startEditTitle(idx: number): void {
    if (localTitles.value.length === 0) {
      localTitles.value = [...displayTitles.value];
    }
    editingTitleIdx.value = idx;
    editingTitleValue.value = localTitles.value[idx] ?? "";
  }

  function cancelEditTitle(): void {
    editingTitleIdx.value = null;
    editingTitleValue.value = "";
  }

  // 保存编辑：更新标题数组；若改的是发布标题，同步替换正文 H1 与主题预览。
  async function saveTitleEdit(idx: number): Promise<void> {
    if (editingTitleIdx.value !== idx) return;
    const newTitle = editingTitleValue.value.trim();
    const titles = localTitles.value;
    const oldTitle = titles[idx] ?? "";
    if (!getArticle() || !newTitle || newTitle === oldTitle) {
      cancelEditTitle();
      return;
    }
    await prepareExplicitContentSave();
    cancelEditTitle();
    const article = getArticle();
    if (!article) return;

    titles[idx] = newTitle;
    article.titles = JSON.stringify(titles);
    const saveFields: Record<string, unknown> = { titles };

    // 发布标题：同步 AI 草稿、人工转写和主题预览。
    if (idx === activeTitleIndex.value) {
      const content = replaceH1(editContent.value, newTitle);
      const humanMd = replaceH1(humanContent.value, newTitle);
      editContent.value = content;
      humanContent.value = humanMd;
      article.contentMarkdown = content;
      article.humanMarkdown = humanMd;
      setLastSavedContent(content);
      setLastSavedHuman(humanMd);
      saveFields.contentMarkdown = content;
      saveFields.humanMarkdown = humanMd;

      if (activePreviewTheme.value !== "live" && humanMd) {
        const themeId = themeIdMap[activePreviewTheme.value];
        const html = renderWechatThemePreview(humanMd, themeId);
        article.wechatHtml = html;
        saveFields.wechatHtml = html;
      }
    }

    try {
      await editFinishedArticle(article.id, saveFields);
      onSaved();
    } catch {
      // 本地状态已经更新，保留原有静默失败语义。
    }
  }

  const displayIntros = computed(() => {
    return localIntros.value.length > 0 ? localIntros.value : (getArticle()?.intros ?? []);
  });

  const displaySummaries = computed(() => getArticle()?.summary100 ?? []);

  async function handleRegenIntro(): Promise<void> {
    const article = getArticle();
    if (!article || regenIntroLoading.value) return;
    regenIntroLoading.value = true;
    try {
      const result = await regenIntro(article.id);
      if (result.ok && result.intros) {
        localIntros.value = result.intros;
        activeIntroIndex.value = 0;
        article.intros = result.intros;
        article.introIndex = 0;

        // 联动：替换 markdown 中的 blockquote，渲染并保存 wechatHtml。
        const newIntro = result.intros[0] ?? "";
        let md = editContent.value;
        const bqMatch = md.match(/\n\n(> [^\n]+(?:\n> [^\n]+)*)\n\n/);
        if (bqMatch) {
          md = md.replace(bqMatch[1], `> ${newIntro}`);
        }
        editContent.value = md;
        article.contentMarkdown = md;
        setLastSavedContent(md);

        const saveFields: Record<string, unknown> = {
          intros: result.intros,
          introIndex: 0,
          contentMarkdown: md,
        };
        if (activePreviewTheme.value !== "live" && md) {
          const html = renderWechatThemePreview(md, themeIdMap[activePreviewTheme.value]);
          article.wechatHtml = html;
          saveFields.wechatHtml = html;
        }
        editFinishedArticle(article.id, saveFields).catch(() => {});
        message.success("新导语已生成");
      } else {
        message.error(result.reason ?? "导语生成失败");
      }
    } catch {
      message.error("导语生成请求失败");
    } finally {
      regenIntroLoading.value = false;
    }
  }

  async function selectIntro(idx: number): Promise<void> {
    const article = getArticle();
    if (!article || idx === activeIntroIndex.value) return;
    const selectedIntro = displayIntros.value[idx];
    if (!selectedIntro) return;

    // 在 markdown 中替换/插入导语 blockquote。
    let content = editContent.value;
    const existingBqMatch = content.match(/\n\n(> [^\n]+(?:\n> [^\n]+)*)\n\n/);
    if (existingBqMatch) {
      content = content.replace(existingBqMatch[1], `> ${selectedIntro}`);
    } else {
      const h1Match = /^(#[^\n]+)\n/.exec(content);
      if (h1Match) {
        content = content.replace(h1Match[0], `${h1Match[1]}\n\n> ${selectedIntro}\n\n`);
      } else {
        const coverMatch = /^!\[[^\]]*\]\([^)]+\)\n*/.exec(content);
        if (coverMatch) {
          content = `${coverMatch[0]}\n> ${selectedIntro}\n\n${content.slice(coverMatch[0].length)}`;
        } else {
          content = `> ${selectedIntro}\n\n${content}`;
        }
      }
    }

    activeIntroIndex.value = idx;
    editContent.value = content;

    try {
      const saveFields: Record<string, unknown> = {
        introIndex: idx,
        contentMarkdown: content,
      };
      if (activePreviewTheme.value !== "live" && content) {
        const html = renderWechatThemePreview(content, themeIdMap[activePreviewTheme.value]);
        article.wechatHtml = html;
        saveFields.wechatHtml = html;
      }

      await editFinishedArticle(article.id, saveFields);
      article.introIndex = idx;
      article.contentMarkdown = content;
      setLastSavedContent(content);
      onSaved();
    } catch {
      // 本地状态已更新，保持原有静默失败语义。
    }
  }

  return {
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
    getLastSavedContent,
    getLastSavedHuman,
    setLastSavedContent,
    setLastSavedHuman,
  };
}
