import { onBeforeUnmount, ref } from "vue";
import type { ComponentPublicInstance } from "vue";

type InfiniteLoadTarget = Element | ComponentPublicInstance | null;

export const VISIBLE_INFINITE_LOAD_DELAY_MS = 2000;

type InfiniteLoadTriggerOptions = {
  canTrigger?: () => boolean;
  delayMs?: number;
};

export function useInfiniteLoadTrigger(
  onTrigger: () => void | Promise<void>,
  options: InfiniteLoadTriggerOptions = {}
) {
  let observer: IntersectionObserver | null = null;
  let isHandlingTrigger = false;
  let isUnmounted = false;
  let pendingDelayTimer: number | null = null;
  const isInfiniteLoadTriggerPending = ref(false);

  function disconnectObserver(): void {
    observer?.disconnect();
    observer = null;
  }

  function clearPendingDelay(): void {
    if (pendingDelayTimer !== null) {
      window.clearTimeout(pendingDelayTimer);
      pendingDelayTimer = null;
    }

    isInfiniteLoadTriggerPending.value = false;
    isHandlingTrigger = false;
  }

  function waitForVisibleDelay(delayMs: number): Promise<void> {
    if (delayMs <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      pendingDelayTimer = window.setTimeout(() => {
        pendingDelayTimer = null;
        resolve();
      }, delayMs);
    });
  }

  function resolveElement(target: InfiniteLoadTarget): Element | null {
    if (target instanceof Element) {
      return target;
    }

    return target?.$el instanceof Element ? target.$el : null;
  }

  function canStartTrigger(): boolean {
    return options.canTrigger?.() ?? true;
  }

  async function handleIntersectingTrigger(): Promise<void> {
    if (isHandlingTrigger || isUnmounted || !canStartTrigger()) {
      return;
    }

    isHandlingTrigger = true;

    try {
      const delayMs = options.delayMs ?? 0;

      // 触底后先保留一个明确的等待状态，让用户感知到下一页加载已经被触发。
      if (delayMs > 0) {
        isInfiniteLoadTriggerPending.value = true;
        await waitForVisibleDelay(delayMs);
      }

      if (!isUnmounted && canStartTrigger()) {
        await onTrigger();
      }
    } finally {
      if (!isUnmounted) {
        isInfiniteLoadTriggerPending.value = false;
        isHandlingTrigger = false;
      }
    }
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
          void handleIntersectingTrigger();
        }
      },
      {
        rootMargin: "240px 0px 360px",
        threshold: 0
      }
    );
    observer.observe(targetElement);
  }

  onBeforeUnmount(() => {
    isUnmounted = true;
    disconnectObserver();
    clearPendingDelay();
  });

  return {
    isInfiniteLoadTriggerPending,
    setInfiniteLoadTrigger
  };
}
