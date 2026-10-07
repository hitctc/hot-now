import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCreativeTableColumns } from "../../src/client/components/creative/useCreativeTableColumns.js";
import SourceItemsTable from "../../src/client/components/creative/source-items/SourceItemsTable.vue";
import type { CreativeSourceItem } from "../../src/client/services/creativeApi.js";

const originalWidth = window.innerWidth;
const desktopColumns = [
  { key: "idSeq", title: "ID / 序号", width: 72 },
  { key: "title", title: "标题", width: 300 },
  { key: "status", title: "状态", width: 100 },
];

/** 模拟手机及横竖屏变化，只触发真实窗口事件，不修改浏览器页面数据。 */
function resize(width: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

/** 挂载真实列宽生命周期，供测试检查计算结果和卸载清理。 */
function harness() {
  let state!: ReturnType<typeof useCreativeTableColumns>;
  const wrapper = mount(defineComponent({ setup() {
    state = useCreativeTableColumns(desktopColumns, 900);
    return () => null;
  } }));
  return { wrapper, state };
}

beforeEach(() => {
  // AntD的分页会订阅媒体查询；这里只补浏览器接口，列宽仍由真实resize事件驱动。
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  // jsdom不实现滚动条伪元素，保留普通元素的真实样式读取而忽略第二参数。
  const getComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(element => getComputedStyle(element));
});

afterEach(() => { resize(originalWidth); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("创作表格手机首屏", () => {
  it.each([320, 360, 375, 390, 430, 767])("%spx首屏正好容纳ID和标题，不改变其他列", (width) => {
    resize(width);
    const { wrapper, state } = harness();
    try {
      expect(state.columns.value[0]).toMatchObject({ title: "ID", width: 56 });
      expect(state.columns.value[1]!.width).toBe(width - 56);
      expect(state.columns.value[0]!.width + state.columns.value[1]!.width).toBe(width);
      expect(state.columns.value[2]).toBe(desktopColumns[2]);
      expect(state.scrollWidth.value).toBe(width + 100);
      expect(desktopColumns[0]).toMatchObject({ title: "ID / 序号", width: 72 });
    } finally { wrapper.unmount(); }
  });

  it("横竖屏即时更新，切回桌面完整恢复列定义和原滚动宽度", async () => {
    resize(390);
    const { wrapper, state } = harness();
    try {
      resize(430); await nextTick();
      expect(state.columns.value[1]!.width).toBe(374);
      resize(768); await nextTick();
      expect(state.isMobile.value).toBe(false);
      expect(state.columns.value).toBe(desktopColumns);
      expect(state.scrollWidth.value).toBe(900);
      resize(360); await nextTick();
      expect(state.columns.value[1]!.width).toBe(304);
    } finally { wrapper.unmount(); }
  });

  it("卸载清理监听，关闭的表格不继续响应窗口变化", () => {
    resize(390);
    const remove = vi.spyOn(window, "removeEventListener");
    const { wrapper, state } = harness();
    wrapper.unmount();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    resize(320);
    expect(state.columns.value[1]!.width).toBe(334);
  });

  it.each(["article", "short_content"] as const)("%s真实素材表手机没有额外展开列，标题仍可展开，桌面恢复序号和图标", async (mode) => {
    resize(320);
    const wrapper = mount(SourceItemsTable, { props: {
      mode, isLoading: false,
      items: [{ id: 123456, seqNumber: 7, title: "手机完整标题", sourceName: "测试来源", writingStatus: "pending", writeCount: 0, createdAt: "2026-10-07T00:00:00Z" } as CreativeSourceItem],
      pagination: { current: 1, pageSize: 30, total: 1, showSizeChanger: true, showTotal: (n: number) => String(n) },
      expandedRowKeys: [], writingIds: new Set<number>(), tracingIds: new Set<number>(), actionPendingId: null,
    }, global: { stubs: {
      "a-spin": { template: "<div><slot /></div>" }, "a-tooltip": { template: "<span><slot /></span>" },
      "a-tag": { template: "<span><slot /></span>" }, "a-button": true, OperationCapabilityBadge: true,
      "a-descriptions": true, "a-descriptions-item": true, "a-collapse": true, "a-collapse-panel": true,
    } } });
    try {
      await flushPromises();
      const cols = wrapper.findAll("colgroup col");
      expect(cols[0]!.attributes("style")).toContain("width: 56px");
      expect(cols[1]!.attributes("style")).toContain("width: 264px");
      expect(wrapper.find(".ant-table-row-expand-icon-cell").exists()).toBe(false);
      expect(wrapper.get(".table-day-anchor-cell").text()).toContain("ID");
      expect(wrapper.get("[data-table-sequence]").text()).toBe("#7");
      const titleCell = wrapper.get("[data-title-source]").element.parentElement!;
      await wrapper.findAll("span.cursor-pointer").find(span => titleCell.contains(span.element))!.trigger("click");
      expect(wrapper.emitted("toggle-expand")).toEqual([[123456]]);
      resize(1024); await flushPromises();
      expect(wrapper.find(".ant-table-row-expand-icon-cell").exists()).toBe(true);
      expect(wrapper.text()).toContain("ID / 序号");
      expect(wrapper.get("[data-table-sequence]").text()).toBe("#7");
    } finally { wrapper.unmount(); }
  });

  it("序号隐藏及ID紧凑样式只在手机断点、四张创作表格内生效", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/client/styles/tailwind.css"), "utf8");
    const mobile = styles.slice(styles.indexOf("@media (max-width: 767px)"), styles.indexOf("/* Tooltip"));
    expect(mobile).toMatch(/:is\(\[data-source-item-table\], \[data-article-table\]\) \[data-table-sequence\]\s*\{\s*display: none;/);
    expect(mobile).toMatch(/\.table-day-anchor-cell\s*\{\s*padding-inline: 6px !important;\s*font-size: 12px;\s*white-space: nowrap;/);
    expect(styles.slice(0, styles.indexOf("@media (max-width: 767px)"))).not.toContain("[data-table-sequence]");
  });
});
