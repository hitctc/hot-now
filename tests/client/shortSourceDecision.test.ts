import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import SourceItemsTable from "../../src/client/components/creative/source-items/SourceItemsTable.vue";
import { useSourceItemsQuery } from "../../src/client/components/creative/source-items/useSourceItemsQuery.js";
import * as api from "../../src/client/services/creativeApi.js";

/** 渲染标题、评分及状态单元格，隔离表格视觉和实际平台请求。 */
function table(mode: "article" | "short_content", score: number | null, reason: string | null = "选题分62＜75；缺少关键事实", status = "skipped", shortWriteSchedule?: api.CreativeSourceItem["shortWriteSchedule"]) {
  return mount(SourceItemsTable, { props: {
    mode, isLoading: false, items: [{ id: 1, title: "合成素材", sourceName: "微信公众号原始来源", linkedArticleId: 9, score, trendScore: 99, writingStatus: status, shortWriteSchedule, writingStopReason: reason, writingStopStepName: "短内容选题", writeCount: 0, createdAt: "2026-10-05T00:00:00Z" } as api.CreativeSourceItem],
    pagination: { current: 1, pageSize: 30, total: 1, showSizeChanger: true, showTotal: (n: number) => String(n) }, expandedRowKeys: [], writingIds: new Set<number>(), tracingIds: new Set<number>(), actionPendingId: null,
  }, global: { stubs: {
    "a-spin": { template: "<div><slot /></div>" }, "a-table": { props: ["columns", "dataSource"], template: '<table><thead><th v-for="col in columns">{{col.title}}</th></thead><tbody><tr v-for="record in dataSource"><td data-title-cell><slot name="bodyCell" :column="{key: \'title\'}" :record="record" /></td><td><slot name="bodyCell" :column="{key: \'score\'}" :record="record" /></td><td><slot name="bodyCell" :column="{key: \'writingStatus\'}" :record="record" /></td></tr></tbody></table>' },
    "a-tooltip": { template: "<div><slot /></div>" }, "a-tag": { template: "<span><slot /></span>" },
  } } });
}

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("短素材决策展示", () => {
  it.each(["article", "short_content"] as const)("%s来源并入标题列，原素材分不冒充质检且关联事件不变", async (mode) => {
    const wrapper = table(mode, 62);
    try {
      const title = wrapper.get("[data-title-cell]");
      expect(title.text()).toContain("合成素材");
      expect(title.text()).toContain("成品 #9");
      expect(title.get("[data-title-source]").text()).toContain(mode === "article" ? "WX原始来源" : "微信公众号原始来源");
      expect(wrapper.findAll("th").map(cell => cell.text())).not.toContain("来源");
      expect(title.text()).not.toContain("质检");
      await title.get("span.cursor-pointer").trigger("click");
      await title.get("a").trigger("click");
      expect(wrapper.emitted("toggle-expand")).toEqual([[1]]);
      expect(wrapper.emitted("open-article")).toEqual([[9]]);
    } finally { wrapper.unmount(); }
  });
  it.each([62, 0, null])("明确展示选题分%s，隐藏无关爆文分并显示停止理由", (score) => {
    const wrapper = table("short_content", score);
    expect(wrapper.text()).toContain("选题分");
    expect(wrapper.get("tbody").text()).toContain(score === null ? "未评分" : `选题分：${score}`);
    expect(wrapper.text()).not.toContain("99");
    expect(wrapper.get("[data-short-source-stop-reason]").text()).toContain("缺少关键事实");
    wrapper.unmount();
  });
  it.each([
    [{ kind: "candidate", position: 3 }, "后续自动候选 · 第 3 位"],
    [{ kind: "pending", position: 1 }, "自动投递状态确认中 · 后续候选第 1 位"],
    [{ kind: "preparing" }, "当前批次候选仍在整理中"],
    [{ kind: "replaced", replacedAt: "2026-10-05T10:00:00+08:00" }, "已被新批次替换 · 当前不再自动投递"],
    [{ kind: "not-scheduled" }, "当前未排入候选或实际写作队列"],
    [{ kind: "task", taskKind: "short_content_auto", status: "queued", queuePosition: 2 }, "自动短写已排队 · 队列第 2 位"],
    [{ kind: "task", taskKind: "short_content_auto", status: "writing", phaseName: "短内容写作" }, "自动短写写作中 · 短内容写作"],
    [{ kind: "task", taskKind: "short_content_auto", status: "done", finishedArticleId: 3725 }, "短写任务已完成 · 成品 #3725"],
    [{ kind: "task", taskKind: "short_content_auto", status: "failed", stopStepName: "自动短内容质检", reasonText: "质检未通过" }, "短写任务失败 · 自动短内容质检 · 质检未通过"],
    [undefined, "调度状态暂不可用"],
  ] as const)("明确展示自动短写状态：%s", (schedule, label) => {
    const wrapper = table("short_content", 80, null, "ready", schedule);
    const tagLabel = schedule?.kind === "task"
      ? schedule.status === "queued" ? "排队中" : schedule.status === "writing" ? "写作中" : schedule.status === "done" ? "已写作" : schedule.status === "failed" ? "技术失败" : "已投递"
      : schedule?.kind === "candidate" ? "自动候选" : schedule?.kind === "pending" ? "投递确认中" : "待调度";
    expect(wrapper.get("tbody").text()).toContain(tagLabel);
    expect(wrapper.get("tbody").text()).toContain(label);
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
  it("用外部素材编号关联已完成任务，并覆盖 HotNow 滞后的 ready 状态", async () => {
    vi.spyOn(api, "readCreativeSourceItems").mockResolvedValue({ items: [{ id: 25182, externalId: "hotsearch-thepaper-34213133", writingStatus: "ready" } as api.CreativeSourceItem], total: 1, page: 1, pageSize: 30 });
    vi.spyOn(api, "readShortWriteSchedule").mockResolvedValue({
      batch_started_at: "2026-10-05T00:00:00+08:00", prepared: true, pending_item_id: null, candidates: [], replaced: [],
      short_write_tasks: [{ source_external_id: "hotsearch-thepaper-34213133", task_kind: "short_content_auto", status: "done", finished_article_id: 3725 }],
    });
    const wrapper = mount(defineComponent({
      setup() {
        const query = useSourceItemsQuery({ direction: "short_content", storageKey: "creative-short-source-filters", writingIds: ref(new Set<number>()), setWritingIds: () => {}, startWritingPoll: () => {} });
        return () => {
          const schedule = query.items.value[0]?.shortWriteSchedule;
          return h("output", schedule?.kind === "task" ? `${schedule.kind}:${schedule.status}:${schedule.finishedArticleId ?? ""}` : schedule?.kind ?? "none");
        };
      },
    }));
    try {
      await flushPromises();
      expect(wrapper.text()).toBe("task:done:3725");
    } finally { wrapper.unmount(); }
  });

  it("按外部素材编号关联候选、待确认和替换状态，不依赖两个数据库的本地 ID 相同", async () => {
    vi.spyOn(api, "readCreativeSourceItems").mockResolvedValue({ items: [
      { id: 25182, externalId: "feed-candidate", writingStatus: "ready" } as api.CreativeSourceItem,
      { id: 25183, externalId: "feed-pending", writingStatus: "ready" } as api.CreativeSourceItem,
      { id: 25184, externalId: "feed-replaced", writingStatus: "ready" } as api.CreativeSourceItem,
    ], total: 3, page: 1, pageSize: 30 });
    vi.spyOn(api, "readShortWriteSchedule").mockResolvedValue({
      batch_started_at: "2026-10-05T00:00:00+08:00", prepared: true, pending_item_id: 16563,
      candidates: [
        { item_id: 16562, source_external_id: "feed-candidate", position: 2 },
        { item_id: 16563, source_external_id: "feed-pending", position: 1 },
      ],
      pending_source_external_id: "feed-pending",
      replaced: [{ item_id: 16564, source_external_id: "feed-replaced", replaced_at: "2026-10-05T10:00:00+08:00" }],
    } as Awaited<ReturnType<typeof api.readShortWriteSchedule>>);
    const wrapper = mount(defineComponent({
      setup() {
        const query = useSourceItemsQuery({ direction: "short_content", storageKey: "creative-short-source-filters", writingIds: ref(new Set<number>()), setWritingIds: () => {}, startWritingPoll: () => {} });
        return () => h("output", query.items.value.map((item) => {
          const state = item.shortWriteSchedule;
          return state?.kind === "candidate" ? `candidate:${state.position}`
            : state?.kind === "pending" ? `pending:${state.position}`
              : state?.kind ?? "none";
        }).join("|"));
      },
    }));
    try {
      await flushPromises();
      expect(wrapper.text()).toBe("candidate:2|pending:1|replaced");
    } finally { wrapper.unmount(); }
  });

  it("清理旧短页爆文筛选，不向列表请求传递隐藏门槛", async () => {
    localStorage.setItem("creative-short-source-filters", JSON.stringify({ minTrendScore: 90, search: "保留搜索" }));
    const read = vi.spyOn(api, "readCreativeSourceItems").mockResolvedValue({ items: [{ id: 7, writingStatus: "ready" } as api.CreativeSourceItem], total: 1, page: 1, pageSize: 30 });
    vi.spyOn(api, "readShortWriteSchedule").mockResolvedValue({ batch_started_at: "2026-10-05T00:00:00+08:00", prepared: true, pending_item_id: null, candidates: [{ item_id: 7, position: 2 }], replaced: [] });
    const wrapper = mount(defineComponent({
      // 仅挂载查询生命周期，组件卸载会清理原轮询及请求。
      setup() { useSourceItemsQuery({ direction: "short_content", storageKey: "creative-short-source-filters", writingIds: ref(new Set<number>()), setWritingIds: () => {}, startWritingPoll: () => {} }); return () => null; },
    }));
    try {
      await flushPromises();
      expect(read).toHaveBeenCalledWith(expect.objectContaining({ direction: "short_content", search: "保留搜索", minTrendScore: undefined }));
      expect(api.readShortWriteSchedule).toHaveBeenCalledOnce();
      expect(JSON.parse(localStorage.getItem("creative-short-source-filters")!).minTrendScore).toBeUndefined();
    } finally { wrapper.unmount(); }
  });
});
