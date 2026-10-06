import { onBeforeUnmount, ref } from "vue";
import { message } from "ant-design-vue";
import { readCreativeFinishedArticle, type CreativeFinishedArticle } from "../../../services/creativeListApi.js";
import { createLatestRequestGuard } from "../../../utils/latestRequestGuard.js";

/** 用列表刷新回调管理成品/素材页详情，返回读状态和开关/保存接口；关闭不取消后台任务或编辑器保存。 */
export function useFinishedArticleDetail(loadItems: () => Promise<void>) {
  const detailArticle = ref<CreativeFinishedArticle | null>(null);
  const detailLoading = ref(false);
  const requests = createLatestRequestGuard();

  /** 只需成品编号即可立即显示加载；仅当前读取能进入弹窗或提示失败，不执行写操作。 */
  async function openDetail(article: Pick<CreativeFinishedArticle, "id">): Promise<void> {
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

  /** 保存后刷新列表及当前详情；空身份的迟到通知只刷新列表，不淘汰正在打开的详情GET。 */
  async function onDetailSaved(): Promise<void> {
    const articleId = detailArticle.value?.id;
    // 打开详情时暂时没有文章，旧保存通知不能占用新读取的令牌导致永久加载。
    if (!articleId) { await loadItems(); return; }
    const requestId = requests.begin();
    await loadItems();
    if (!requests.isCurrent(requestId)) return;
    const latest = await readCreativeFinishedArticle(articleId);
    if (requests.isCurrent(requestId) && detailArticle.value?.id === articleId) detailArticle.value = latest;
  }

  onBeforeUnmount(() => requests.invalidate());
  return { detailArticle, detailLoading, openDetail, closeDetail, onDetailSaved };
}
