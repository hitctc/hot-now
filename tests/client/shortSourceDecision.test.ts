import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import SourceItemsTable from "../../src/client/components/creative/source-items/SourceItemsTable.vue";
import { useSourceItemsQuery } from "../../src/client/components/creative/source-items/useSourceItemsQuery.js";
import * as api from "../../src/client/services/creativeApi.js";

/** 仅渲染评分/状态单元格，隔离表格视觉和实际平台请求。 */
function table(mode: "article" | "short_content", score: number | null, reason: string | null = "选题分62＜75；缺少关键事实") {
  return mount(SourceItemsTable, { props: {
    mode, isLoading: false, items: [{ id: 1, title: "合成素材", score, trendScore: 99, writingStatus: "skipped", writingStopReason: reason, writingStopStepName: "短内容选题", writeCount: 0, createdAt: "2026-10-05T00:00:00Z" } as api.CreativeSourceItem],
    pagination: { current: 1, pageSize: 30, total: 1, showSizeChanger: true, showTotal: (n: number) => String(n) }, expandedRowKeys: [], writingIds: new Set<number>(), tracingIds: new Set<number>(), actionPendingId: null,
  }, global: { stubs: {
    "a-spin": { template: "<div><slot /></div>" }, "a-table": { props: ["columns", "dataSource"], template: '<table><thead><th v-for="col in columns">{{col.title}}</th></thead><tbody><tr v-for="record in dataSource"><td><slot name="bodyCell" :column="{key: \'score\'}" :record="record" /></td><td><slot name="bodyCell" :column="{key: \'writingStatus\'}" :record="record" /></td></tr></tbody></table>' },
    "a-tooltip": { template: "<div><slot /></div>" }, "a-tag": { template: "<span><slot /></span>" },
  } } });
}

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("短素材决策展示", () => {
  it.each([62, 0, null])("明确展示选题分%s，隐藏无关爆文分并显示停止理由", (score) => {
    const wrapper = table("short_content", score);
    expect(wrapper.text()).toContain("选题分");
    expect(wrapper.get("tbody").text()).toContain(score === null ? "未评分" : `选题分：${score}`);
    expect(wrapper.text()).not.toContain("99");
    expect(wrapper.get("[data-short-source-stop-reason]").text()).toContain("缺少关键事实");
    wrapper.unmount();
  });
  it("历史没有原因时不按当前门槛猜测，长素材仍展示两种评分", () => {
    const short = table("short_content", null, null);
    expect(short.get("[data-short-source-stop-reason]").text()).toContain("历史原因未记录");
    short.unmount();
    const long = table("article", 62);
    expect(long.get("tbody").text()).toContain("99");
    long.unmount();
  });
  it("清理旧短页爆文筛选，不向列表请求传递隐藏门槛", async () => {
    localStorage.setItem("creative-short-source-filters", JSON.stringify({ minTrendScore: 90, search: "保留搜索" }));
    const read = vi.spyOn(api, "readCreativeSourceItems").mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 30 });
    const wrapper = mount(defineComponent({
      // 仅挂载查询生命周期，组件卸载会清理原轮询及请求。
      setup() { useSourceItemsQuery({ direction: "short_content", storageKey: "creative-short-source-filters", writingIds: ref(new Set<number>()), setWritingIds: () => {}, startWritingPoll: () => {} }); return () => null; },
    }));
    try {
      await flushPromises();
      expect(read).toHaveBeenCalledWith(expect.objectContaining({ direction: "short_content", search: "保留搜索", minTrendScore: undefined }));
      expect(JSON.parse(localStorage.getItem("creative-short-source-filters")!).minTrendScore).toBeUndefined();
    } finally { wrapper.unmount(); }
  });
});
