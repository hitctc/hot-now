import { ref, watch, type WatchSource } from "vue";

/** 按内容类型和区块读取、持久化折叠状态；存储不可用时继续使用内存状态。 */
export function useArticleDetailSectionCollapse(section: string, direction: WatchSource<string | undefined>) {
  const collapsed = ref(false);
  let storageKey = "";

  watch(direction, (value) => {
    storageKey = `creative-article-detail:${value ?? "article"}:${section}:collapsed`;
    try {
      collapsed.value = localStorage.getItem(storageKey) === "1";
    } catch {
      collapsed.value = false;
    }
  }, { immediate: true });

  watch(collapsed, (value) => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, value ? "1" : "0");
    } catch {
      // 隐私模式或存储额度受限时，当前组件内的折叠交互仍可用。
    }
  });

  return { collapsed };
}
