import { message } from "ant-design-vue";
import { computed, reactive, ref, watch } from "vue";
import { useSummaryDisclosure } from "./useSummaryDisclosure";
import { cloneContentCard, editorialContentBadgeClass, editorialContentCardClass, editorialContentMetaClass, editorialContentScoreBadgeClass, formatPublishedAt, readSafeUrl } from "./contentCardShared";
import { saveFeedbackPoolEntry, type ContentCard, type SaveFeedbackPoolEntryPayload } from "../../services/contentApi";
import { HttpError } from "../../services/http";

export type ContentHeroCardProps = {
  card: ContentCard;
  statusText?: string | null;
};

/** 管理首要内容卡片的反馈表单与本地展示状态；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useContentHeroCard(props: ContentHeroCardProps) {


  const cardState = reactive<ContentCard>(cloneContentCard(props.card));
  const feedbackOpen = ref(false);
  const isBusy = ref(false);
  const statusText = ref<string | null>(props.statusText ?? null);
  /** 将当前卡片字段同步到本地展示状态，供反馈成功后保持界面一致。 */
  function syncCardState(nextCard: ContentCard): void {
    Object.assign(cardState, cloneContentCard(nextCard));
    statusText.value = props.statusText ?? null;
    feedbackOpen.value = false;
  }

  watch(
    () => props.statusText,
    (nextStatusText) => {
      if (nextStatusText !== undefined) {
        statusText.value = nextStatusText;
      }
    },
    { immediate: true }
  );
  /** 提交当前内容的反馈并更新本地反馈状态；失败保留表单和原有提示。 */
  async function handleFeedbackSubmit(payload: SaveFeedbackPoolEntryPayload): Promise<void> {
    isBusy.value = true;

    try {
      await saveFeedbackPoolEntry(cardState.id, payload);
      cardState.feedbackEntry = {
        freeText: payload.freeText || null,
        suggestedEffect: payload.suggestedEffect || null,
        strengthLevel: payload.strengthLevel || null,
        positiveKeywords: payload.positiveKeywords,
        negativeKeywords: payload.negativeKeywords
      };
      feedbackOpen.value = false;
      statusText.value = "反馈词已保存到反馈池";
      void message.success("反馈词已保存到反馈池");
    } catch (error) {
      // 内容页允许公开浏览，401 更可能是用户未登录而不是后端异常，需要给出明确提示。
      if (error instanceof HttpError && error.status === 401) {
        statusText.value = "请先登录后再保存反馈词。";
        void message.warning("请先登录后再保存反馈词。");
      } else {
        statusText.value = "反馈词保存失败，请稍后重试。";
        void message.error("反馈词保存失败，请稍后重试。");
      }
    } finally {
      isBusy.value = false;
    }
  }

  watch(() => props.card, syncCardState, { deep: true });

  const safeUrl = computed(() => readSafeUrl(cardState.canonicalUrl));
  const publishedText = computed(() => formatPublishedAt(cardState.publishedAt));
  const {
    summaryElement,
    summaryExpanded,
    summaryOverflowed,
    summaryBodyClass,
    toggleSummaryExpanded
  } = useSummaryDisclosure(() => cardState.summary, 6, 280);

  return {
    cardState,
    feedbackOpen,
    isBusy,
    statusText,
    handleFeedbackSubmit,
    safeUrl,
    publishedText,
    summaryExpanded,
    summaryOverflowed,
    summaryBodyClass,
    toggleSummaryExpanded,
    editorialContentBadgeClass,
    editorialContentCardClass,
    editorialContentMetaClass,
    editorialContentScoreBadgeClass,
    summaryElement,
  };
}
