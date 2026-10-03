import { onBeforeUnmount, ref } from "vue";
import { message } from "ant-design-vue";
import { readCreativeFinishedArticle, type CreativeFinishedArticle } from "../../../services/creativeListApi.js";
import { createLatestRequestGuard } from "../../../utils/latestRequestGuard.js";

/** 管理一个成品页的详情身份和保存后读取；关闭只使GET失效，不取消后台任务或编辑器保存。 */
export function useFinishedArticleDetail(loadItems: () => Promise<void>) {
  const detailArticle = ref<CreativeFinishedArticle | null>(null);
  const detailLoading = ref(false);
  const requests = createLatestRequestGuard();

  /** 点击立即显示加载，只有当前文章读取能进入弹窗或提示失败。 */
  async function openDetail(article: CreativeFinishedArticle): Promise<void> {
    const requestId = requests.begin();
    detailArticle.value = null;
    detailLoading.value = true;
    try {
      const detail = await readCreativeFinishedArticle(article.id);
      if (requests.isCurrent(requestId)) detailArticle.value = detail;
    } catch {
      if (requests.isCurrent(requestId)) message.error("加载文章详情失败");
    } finally {
      if (requests.isCurrent(requestId)) detailLoading.value = false;
    }
  }

  /** 编辑器已确认可关闭后清当前身份；在途GET不得重新打开弹窗。 */
  function closeDetail(): void {
    requests.invalidate();
    detailLoading.value = false;
    detailArticle.value = null;
  }

  /** 显式保存后刷新列表，再按原编号读取；切换、关闭、卸载及较新刷新会淘汰旧响应。 */
  async function onDetailSaved(): Promise<void> {
    const requestId = requests.begin();
    const articleId = detailArticle.value?.id;
    await loadItems();
    if (!articleId || !requests.isCurrent(requestId)) return;
    const latest = await readCreativeFinishedArticle(articleId);
    if (requests.isCurrent(requestId) && detailArticle.value?.id === articleId) detailArticle.value = latest;
  }

  onBeforeUnmount(() => requests.invalidate());
  return { detailArticle, detailLoading, openDetail, closeDetail, onDetailSaved };
}
