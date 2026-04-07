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

  // 内容页翻页和手动回顶都复用同一条滚动入口，避免两个交互的滚动手感慢慢漂开。
  function scrollPageToTop(behavior: ScrollBehavior = "auto"): void {
    if (typeof window === "undefined") {
      return;
    }

    showBackToTopButton.value = false;
    window.scrollTo({ top: 0, behavior });
  }

  // 回顶按钮保留 smooth；分页切换继续用 auto，避免切页过程出现额外动画拖尾。
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
