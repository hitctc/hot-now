import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from "vue";

type SummaryDisclosure = {
  summaryElement: Ref<HTMLElement | null>;
  summaryExpanded: Ref<boolean>;
  summaryOverflowed: Ref<boolean>;
  summaryBodyClass: ComputedRef<string[]>;
  toggleSummaryExpanded: () => void;
};

function readFallbackOverflow(summary: string, charThreshold: number): boolean {
  const condensedSummary = summary.replace(/\s+/g, "");
  return condensedSummary.length > charThreshold || summary.includes("\n");
}

export function useSummaryDisclosure(
  summarySource: () => string,
  clampLineCount: 5 | 6,
  charThreshold: number
): SummaryDisclosure {
  const summaryElement = ref<HTMLElement | null>(null);
  const summaryExpanded = ref(false);
  const summaryOverflowed = ref(false);
  const collapsedClampClass =
    clampLineCount === 6
      ? "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:6]"
      : "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:5]";

  const summaryBodyClass = computed(() => (summaryExpanded.value ? [] : [collapsedClampClass]));

  // 先用字符长度兜底，再结合真实渲染高度，避免摘要过长时漏掉展开入口。
  function measureSummaryOverflow(): void {
    const fallbackOverflow = readFallbackOverflow(summarySource(), charThreshold);
    const element = summaryElement.value;

    if (!element) {
      summaryOverflowed.value = fallbackOverflow;
      return;
    }

    summaryOverflowed.value = fallbackOverflow || element.scrollHeight > element.clientHeight + 1;
  }

  // 卡片切换或挂载后延后一拍测量，确保 clamp 样式已经真正应用到 DOM。
  async function syncSummaryOverflow(): Promise<void> {
    await nextTick();
    measureSummaryOverflow();
  }

  // 展开按钮只在确实存在折叠内容时生效，避免短摘要也进入无意义的切换状态。
  function toggleSummaryExpanded(): void {
    if (!summaryOverflowed.value) {
      return;
    }

    summaryExpanded.value = !summaryExpanded.value;
  }

  watch(
    summarySource,
    () => {
      summaryExpanded.value = false;
      void syncSummaryOverflow();
    },
    { immediate: true }
  );

  onMounted(() => {
    void syncSummaryOverflow();
    window.addEventListener("resize", measureSummaryOverflow);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", measureSummaryOverflow);
  });

  return {
    summaryElement,
    summaryExpanded,
    summaryOverflowed,
    summaryBodyClass,
    toggleSummaryExpanded
  };
}
