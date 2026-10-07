import { computed, onBeforeUnmount, onMounted, ref } from "vue";

type CreativeTableColumn = { key: string; title: string; width: number };

/** 为创作表格分配手机首屏的ID/标题宽度；桌面沿用传入列及滚动宽度，监听窗口变化并在卸载时清理。 */
export function useCreativeTableColumns<T extends CreativeTableColumn>(desktopColumns: T[], desktopScrollWidth: number) {
  const viewportWidth = ref(window.innerWidth);
  const isMobile = computed(() => viewportWidth.value <= 767);
  const columns = computed(() => isMobile.value
    ? desktopColumns.map(column => column.key === "idSeq"
      ? { ...column, title: "ID", width: 56 }
      : column.key === "title"
        ? { ...column, width: viewportWidth.value - 56 }
        : column)
    : desktopColumns);
  // 表格总宽也必须使用实际列宽之和，否则固定布局会将多余空间重新分给前两列。
  const scrollWidth = computed(() => isMobile.value
    ? columns.value.reduce((total, column) => total + column.width, 0)
    : desktopScrollWidth);

  /** 横竖屏及窗口缩放后重新分配宽度，不修改桌面列定义或表格数据。 */
  function updateViewportWidth(): void {
    viewportWidth.value = window.innerWidth;
  }

  onMounted(() => {
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
  });
  onBeforeUnmount(() => window.removeEventListener("resize", updateViewportWidth));
  return { columns, scrollWidth, isMobile };
}
