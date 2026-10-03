import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { saveArticlePerformanceFeedback, type ArticleRewriteLevel, type CreativeFinishedArticle } from "../../services/creativeApi.js";

export type ArticlePerformanceFeedbackModalProps = {
  open: boolean;
  article: CreativeFinishedArticle | null;
};

export type ArticlePerformanceFeedbackModalEvents = {
  "update:open": [value: boolean];
  saved: [];
};

/** 管理文章发布效果的输入校验和提交；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useArticlePerformanceFeedbackModal(props: ArticlePerformanceFeedbackModalProps, emit: <K extends keyof ArticlePerformanceFeedbackModalEvents>(event: K, ...args: ArticlePerformanceFeedbackModalEvents[K]) => void) {


  const isSaving = ref(false);
  const deliveredUsers = ref<number | null>(null);
  const readUsers = ref<number | null>(null);
  const shareUsers = ref<number | null>(null);
  const newFollowers = ref<number | null>(null);
  const rewriteLevel = ref<ArticleRewriteLevel | null>(null);

  const titleSnapshot = computed(() => {
    if (!props.article) return "—";
    return props.article.performanceTitleSnapshot || getSelectedTitle(props.article);
  });

  /**
   * 读取文章当前选中的标题，供弹窗预览；真正落库的快照仍由服务端生成。
   */
  function getSelectedTitle(article: CreativeFinishedArticle): string {
    const rawTitles = article.titles;
    let titles: string[] = [];
    if (Array.isArray(rawTitles)) {
      titles = rawTitles;
    } else if (rawTitles) {
      try {
        const parsed = JSON.parse(rawTitles);
        titles = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        titles = [];
      }
    }
    return titles[article.titleIndex] ?? titles[0] ?? "无标题";
  }

  /**
   * 打开弹窗时载入已有反馈，允许用户更正数字而不必重新录入全部字段。
   */
  function resetFormFromArticle(): void {
    const article = props.article;
    deliveredUsers.value = article?.performanceDeliveredUsers ?? null;
    readUsers.value = article?.performanceReadUsers ?? null;
    shareUsers.value = article?.performanceShareUsers ?? null;
    newFollowers.value = article?.performanceNewFollowers ?? null;
    rewriteLevel.value = article?.performanceRewriteLevel ?? null;
  }

  watch(
    () => [props.open, props.article?.id] as const,
    ([open]) => {
      if (open) resetFormFromArticle();
    },
    { immediate: true }
  );

  /**
   * 校验并保存第一阶段试验数据；空的新关注人数按“未记录”处理。
   */
  async function handleSave(): Promise<void> {
    if (!props.article) return;
    if (deliveredUsers.value == null || readUsers.value == null || shareUsers.value == null || rewriteLevel.value == null) {
      message.warning("请填写送达、阅读、分享人数和人工复述程度");
      return;
    }

    isSaving.value = true;
    try {
      await saveArticlePerformanceFeedback(props.article.id, {
        deliveredUsers: deliveredUsers.value,
        readUsers: readUsers.value,
        shareUsers: shareUsers.value,
        newFollowers: newFollowers.value,
        rewriteLevel: rewriteLevel.value
      });
      message.success("文章效果已记录");
      emit("saved");
      emit("update:open", false);
    } catch {
      message.error("效果数据保存失败");
    } finally {
      isSaving.value = false;
    }
  }

  return {
    isSaving,
    deliveredUsers,
    readUsers,
    shareUsers,
    newFollowers,
    rewriteLevel,
    titleSnapshot,
    handleSave,
  };
}
