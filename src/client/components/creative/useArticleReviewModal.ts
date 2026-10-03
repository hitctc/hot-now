import { ref, computed } from "vue";
import { Modal } from "ant-design-vue";
import type { CreativeFinishedArticle } from "../../services/creativeApi";
import { editFinishedArticle, deleteFinishedArticle } from "../../services/creativeApi";
import { getDisplayTitle } from "./articleStatusShared.js";
import { message } from "ant-design-vue";

export type ArticleReviewModalProps = {
  visible: boolean;
  article: CreativeFinishedArticle | null;
};

export type ArticleReviewModalEvents = {
  "update:visible": [value: boolean];
  reviewed: [];
};

/** 管理文章审核的通过、拒绝和删除；返回展示状态与动作，集中维护原请求、错误处理和生命周期副作用。 */
export function useArticleReviewModal(props: ArticleReviewModalProps, emit: <K extends keyof ArticleReviewModalEvents>(event: K, ...args: ArticleReviewModalEvents[K]) => void) {


  const rejectReason = ref("");

  // 展示标题：优先发布标题，无标题时回退主旨
  const displayTitle = computed(() => {
    const article = props.article;
    if (!article) return "";
    const title = getDisplayTitle(article.titles, article.titleIndex);
    return title === "无标题" && article.thesis ? article.thesis : title;
  });
  const submitting = ref(false);
  /** 关闭当前界面并发送原有关闭事件，不创建新的业务任务。 */
  function close(): void {
    rejectReason.value = "";
    emit("update:visible", false);
  }
  /** 保存文章审核通过的结果并发送原有完成事件，失败时保留界面。 */
  async function handleApprove(): Promise<void> {
    if (!props.article) return;
    submitting.value = true;
    try {
      const res = await editFinishedArticle(props.article.id, {
        status: "ready_for_publish",
        anomalyReason: "",
        _source: "review",
      } as any);
      if (res.ok) {
        message.success("审核通过");
        emit("reviewed");
        close();
      }
    } catch {
      message.error("操作失败");
    } finally {
      submitting.value = false;
    }
  }
  /** 保存文章审核拒绝的结果并发送原有完成事件，失败时保留界面。 */
  async function handleReject(): Promise<void> {
    if (!props.article) return;
    submitting.value = true;
    try {
      const res = await editFinishedArticle(props.article.id, {
        status: "soft_deleted",
        anomalyReason: rejectReason.value || "审核不通过",
      } as any);
      if (res.ok) {
        message.success("已标记为审核不通过");
        emit("reviewed");
        close();
      }
    } catch {
      message.error("操作失败");
    } finally {
      submitting.value = false;
    }
  }
  /** 按原确认流程删除当前记录并刷新视图，失败沿用原错误提示。 */
  function handleDelete(): void {
    if (!props.article) return;
    Modal.confirm({
      bodyStyle: { padding: '24px' },
      title: "确认删除",
      content: `确定要删除文章 #${props.article.id} 吗？删除后可从回收站恢复。`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          const res = await deleteFinishedArticle(props.article!.id);
          if (res.ok) {
            message.success("已删除");
            emit("reviewed");
            close();
          }
        } catch {
          message.error("删除失败");
        }
      },
    });
  }

  return {
    rejectReason,
    displayTitle,
    submitting,
    close,
    handleApprove,
    handleReject,
    handleDelete,
  };
}
