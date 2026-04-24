import { onBeforeUnmount } from "vue";
import type { ComponentPublicInstance } from "vue";

type InfiniteLoadTarget = Element | ComponentPublicInstance | null;

export function useInfiniteLoadTrigger(onTrigger: () => void | Promise<void>) {
  let observer: IntersectionObserver | null = null;

  function disconnectObserver(): void {
    observer?.disconnect();
    observer = null;
  }

  function resolveElement(target: InfiniteLoadTarget): Element | null {
    if (target instanceof Element) {
      return target;
    }

    return target?.$el instanceof Element ? target.$el : null;
  }

  function setInfiniteLoadTrigger(element: InfiniteLoadTarget): void {
    disconnectObserver();
    const targetElement = resolveElement(element);

    if (!targetElement || typeof window === "undefined" || typeof window.IntersectionObserver === "undefined") {
      return;
    }

    // 提前一段距离触发加载，避免用户真正滑到底后才看到空白等待。
    observer = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void onTrigger();
        }
      },
      {
        rootMargin: "240px 0px 360px",
        threshold: 0
      }
    );
    observer.observe(targetElement);
  }

  onBeforeUnmount(disconnectObserver);

  return {
    setInfiniteLoadTrigger
  };
}
