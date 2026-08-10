import { computed, nextTick, ref, watch } from "vue";

const SYNC_SCROLL_KEY = "md-editor-sync-scroll";

/** 读取用户的滚动同步偏好；存储不可用时保持默认开启。 */
function loadSyncScroll(): boolean {
  try {
    const saved = localStorage.getItem(SYNC_SCROLL_KEY);
    return saved === null ? true : saved === "1";
  } catch {
    return true;
  }
}

/**
 * 管理详情抽屉中编辑器的可视区域行为。
 * 该组合式逻辑只处理 DOM、尺寸和交互状态，不涉及正文保存或文章数据请求。
 */
export function useArticleEditorViewport() {
  const editorFullscreen = ref(false);
  const focusMode = ref(false);
  const syncScrollEnabled = ref(loadSyncScroll());
  const editorSectionRef = ref<HTMLElement | null>(null);
  const dynamicEditorHeight = ref(400);
  let focusModeTimer: ReturnType<typeof setTimeout> | null = null;
  let editorResizeObserver: ResizeObserver | null = null;
  let savedFocusModalScrollTop = 0;
  let savedModalScrollTop = 0;

  const articleDetailWrapClass = computed(() => `article-detail-modal${focusMode.value ? " article-detail-modal--focus" : ""}`);
  const articleDetailMaskStyle = computed(() => focusMode.value
    ? { backgroundColor: "#ffffff", opacity: 1, transition: "background-color 0.8s ease, opacity 0.8s ease" }
    : { backgroundColor: "rgba(0, 0, 0, 0.45)", transition: "background-color 0.8s ease, opacity 0.8s ease" });

  /** 切换编辑器与预览区的单向滚动同步，并持久化用户选择。 */
  function toggleSyncScroll(): void {
    syncScrollEnabled.value = !syncScrollEnabled.value;
    try {
      localStorage.setItem(SYNC_SCROLL_KEY, syncScrollEnabled.value ? "1" : "0");
    } catch { /* quota 忽略 */ }
  }

  /** 根据弹窗 body 的实时空间测量编辑器高度，专注态不再预留正文标题区域。 */
  function measureEditorHeight(): void {
    const section = editorSectionRef.value;
    if (!section) return;
    const scrollParent = section.closest(".ant-modal-body") as HTMLElement | null;
    if (!scrollParent) return;
    const bodyStyle = window.getComputedStyle(scrollParent);
    const bodyPadding = Number.parseFloat(bodyStyle.paddingTop) + Number.parseFloat(bodyStyle.paddingBottom);
    const titleBar = section.querySelector("[data-editor-title]") as HTMLElement | null;
    const titleBarHeight = focusMode.value ? 0 : (titleBar?.offsetHeight ?? 40);
    dynamicEditorHeight.value = Math.max(200, scrollParent.clientHeight - bodyPadding - titleBarHeight);
  }

  /** 编辑器挂载后绑定尺寸、滚轮与聚焦事件。 */
  function setupEditorResize(): void {
    const section = editorSectionRef.value;
    if (!section) return;
    const scrollParent = section.closest(".ant-modal-body") as HTMLElement | null;
    if (!scrollParent) return;
    measureEditorHeight();
    editorResizeObserver = new ResizeObserver(() => measureEditorHeight());
    editorResizeObserver.observe(scrollParent);
    scrollParent.addEventListener("wheel", onModalBodyWheel, { passive: false });
    scrollParent.addEventListener("focusin", onEditorFocusIn);
    scrollParent.addEventListener("focusout", onEditorFocusOut);
  }

  /** 关闭弹窗或卸载时释放观察器与事件，并清空本次专注锁定。 */
  function teardownEditorResize(): void {
    if (editorResizeObserver) { editorResizeObserver.disconnect(); editorResizeObserver = null; }
    const scrollParent = editorSectionRef.value?.closest(".ant-modal-body") as HTMLElement | null;
    scrollParent?.removeEventListener("wheel", onModalBodyWheel);
    scrollParent?.removeEventListener("focusin", onEditorFocusIn);
    scrollParent?.removeEventListener("focusout", onEditorFocusOut);
    if (focusModeTimer) { clearTimeout(focusModeTimer); focusModeTimer = null; }
    focusMode.value = false;
  }

  /** 编辑器聚焦时禁止滚轮冒泡到抽屉正文区，编辑区本身仍可滚动。 */
  function onModalBodyWheel(event: WheelEvent): void {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !active.classList.contains("md-editor__textarea")) return;
    const target = event.target as HTMLElement;
    if (target.closest(".md-editor__textarea-wrap, .md-editor__preview")) return;
    event.preventDefault();
  }

  /** 连续聚焦 1.2 秒后进入专注模式，避免鼠标短暂停留造成页面闪动。 */
  function onEditorFocusIn(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    if (!target.classList?.contains("md-editor__textarea")) return;
    if (focusModeTimer) clearTimeout(focusModeTimer);
    focusModeTimer = setTimeout(() => { focusModeTimer = null; focusMode.value = true; }, 1200);
  }

  /** 进入专注模式后忽略焦点移出；未触发时仍及时取消延迟计时。 */
  function onEditorFocusOut(event: FocusEvent): void {
    const target = event.target as HTMLElement;
    if (!target.classList?.contains("md-editor__textarea")) return;
    const related = event.relatedTarget as HTMLElement | null;
    if (related?.classList.contains("md-editor__textarea")) return;
    if (focusModeTimer) { clearTimeout(focusModeTimer); focusModeTimer = null; }
    if (focusMode.value) return;
    focusMode.value = false;
  }

  /** 用户点击锁定提示时立即退出专注模式，不触发保存或其他业务动作。 */
  function unlockFocusMode(): void {
    if (focusModeTimer) { clearTimeout(focusModeTimer); focusModeTimer = null; }
    focusMode.value = false;
  }

  watch(focusMode, (focused) => {
    const body = editorSectionRef.value?.closest(".ant-modal-body") as HTMLElement | null;
    if (!body) return;
    if (focused) savedFocusModalScrollTop = body.scrollTop;
    nextTick(() => {
      measureEditorHeight();
      if (!focused) body.scrollTop = savedFocusModalScrollTop;
    });
  });

  /** 进入或退出全屏时保存正文滚动位置，避免 DOM 重排把用户拉回顶部。 */
  function toggleEditorFullscreen(): void {
    if (!editorFullscreen.value) {
      const body = editorSectionRef.value?.closest(".ant-modal-body") as HTMLElement | null;
      savedModalScrollTop = body?.scrollTop ?? 0;
      editorFullscreen.value = true;
      document.body.style.overflow = "hidden";
      return;
    }

    editorFullscreen.value = false;
    document.body.style.overflow = "";
    nextTick(() => {
      const body = editorSectionRef.value?.closest(".ant-modal-body") as HTMLElement | null;
      if (body) body.scrollTop = savedModalScrollTop;
    });
  }

  /** 显式退出全屏，供抽屉关闭和打开新文章时复位。 */
  function resetEditorFullscreen(): void {
    editorFullscreen.value = false;
    document.body.style.overflow = "";
  }

  /** 全屏编辑状态下仅处理 Escape，不干扰其他抽屉快捷键。 */
  function handleFullscreenEsc(event: KeyboardEvent): void {
    if (event.key === "Escape" && editorFullscreen.value) toggleEditorFullscreen();
  }

  return {
    articleDetailMaskStyle,
    articleDetailWrapClass,
    dynamicEditorHeight,
    editorFullscreen,
    editorSectionRef,
    focusMode,
    handleFullscreenEsc,
    resetEditorFullscreen,
    setupEditorResize,
    syncScrollEnabled,
    teardownEditorResize,
    toggleEditorFullscreen,
    toggleSyncScroll,
    unlockFocusMode,
  };
}
