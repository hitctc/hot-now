import { onBeforeUnmount, onMounted, ref } from "vue";

const contentBackToTopThreshold = 640;

function readWindowScrollTop(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  if (typeof window.scrollY === "number") {
    return window.scrollY;
  }

  return typeof window.pageYOffset === "number" ? window.pageYOffset : 0;
}

export function useContentPageScroll() {
  const showBackToTopButton = ref(false);

  function syncBackToTopVisibility(): void {
    showBackToTopButton.value = readWindowScrollTop() >= contentBackToTopThreshold;
  }

  // 筛选、排序、搜索重置和手动回顶都复用同一条滚动入口，避免滚动手感慢慢漂开。
  function scrollPageToTop(behavior: ScrollBehavior = "auto"): void {
    if (typeof window === "undefined") {
      return;
    }

    showBackToTopButton.value = false;
    window.scrollTo({ top: 0, behavior });
  }

  // 回顶按钮保留 smooth；筛选重置继续用 auto，避免刷新列表时出现额外动画拖尾。
  function handleBackToTopClick(): void {
    scrollPageToTop("smooth");
  }

  onMounted(() => {
    syncBackToTopVisibility();
    window.addEventListener("scroll", syncBackToTopVisibility, { passive: true });
  });

  onBeforeUnmount(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", syncBackToTopVisibility);
    }
  });

  return {
    showBackToTopButton,
    scrollPageToTop,
    handleBackToTopClick
  };
}
