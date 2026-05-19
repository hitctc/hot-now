import { ref, watch } from "vue";

const MAX_HISTORY = 15;

// 搜索历史 composable：持久化到 localStorage，支持添加、删除、清空
export function useSearchHistory(storageKey: string) {
  const history = ref<string[]>([]);

  // 从 localStorage 恢复
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) history.value = JSON.parse(raw);
  } catch { /* 忽略 */ }

  function persist(): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(history.value));
    } catch { /* quota 忽略 */ }
  }

  // 搜索时调用，将关键词插入历史顶部（去重）
  function addToHistory(term: string): void {
    const trimmed = term.trim();
    if (!trimmed) return;
    history.value = [trimmed, ...history.value.filter(t => t !== trimmed)].slice(0, MAX_HISTORY);
    persist();
  }

  function removeFromHistory(term: string): void {
    history.value = history.value.filter(t => t !== term);
    persist();
  }

  return { history, addToHistory, removeFromHistory };
}
