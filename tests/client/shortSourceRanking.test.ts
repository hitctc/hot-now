import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ArticleDetailHeader from "../../src/client/components/creative/article-detail/ArticleDetailHeader.vue";
import SourceItemsTable from "../../src/client/components/creative/source-items/SourceItemsTable.vue";
import { sourceRankingLabel } from "../../src/client/components/creative/source-items/sourceItemPresentation.js";
import type { CreativeFinishedArticle, CreativeSourceItem } from "../../src/client/services/creativeApi.js";

const ranking = { board: "百度热搜榜", rank: 3, capturedAt: "2026-10-06T12:30:00+0800", kind: "ranking" as const };

describe("短内容来源与榜位展示", () => {
  it("标题顶部显示来源及采集时榜位，短稿不显示旧模式，仍能打开素材", async () => {
    const wrapper = mount(ArticleDetailHeader, { props: { article: { id: 1, direction: "short_content", titles: ["新短稿"], titleIndex: 0, mode: "A", sourceItemId: 9, sourceName: "百度热搜榜", sourceCollectorAgent: "hotsearch-baidu", sourceRanking: ranking, createdAt: "2026-10-06T00:00:00Z" } as unknown as CreativeFinishedArticle } });
    expect(wrapper.get("[data-short-article-source]").text()).toContain("百度热搜榜");
    expect(wrapper.text()).toContain("10-06 12:30 · 第3名");
    expect(wrapper.text()).not.toContain("模式");
    await wrapper.get("a").trigger("click");
    expect(wrapper.emitted("open-source")).toEqual([[9]]);
    await wrapper.setProps({ article: { ...wrapper.props().article, direction: "article" } });
    expect(wrapper.find("[data-short-article-source]").exists()).toBe(false);
    expect(wrapper.text()).toContain("模式A");
    wrapper.unmount();
  });
  it("短素材来源第二行显示同一快照，长素材不增加排名行", async () => {
    const wrapper = mount(SourceItemsTable, { props: { mode: "short_content", isLoading: false, items: [{ id: 1, sourceName: "百度热搜榜", collectorAgent: "hotsearch-baidu", sourceRanking: ranking } as CreativeSourceItem], pagination: { current: 1, pageSize: 30, total: 1, showSizeChanger: true, showTotal: (n: number) => String(n) }, expandedRowKeys: [], writingIds: new Set<number>(), tracingIds: new Set<number>(), actionPendingId: null }, global: { stubs: {
      "a-spin": { template: "<div><slot /></div>" }, "a-table": { props: ["dataSource"], template: '<div><slot v-for="record in dataSource" name="bodyCell" :record="record" :column="{key: \'sourceName\'}" /></div>' }, "a-tooltip": { template: "<div><slot /></div>" },
    } } });
    expect(wrapper.get("[data-short-source-ranking]").text()).toBe(sourceRankingLabel(ranking));
    await wrapper.setProps({ mode: "article" });
    expect(wrapper.find("[data-short-source-ranking]").exists()).toBe(false);
    wrapper.unmount();
  });
  it("旧热搜、RSS和非排行榜不得编造名次，热门列表明确显示位置", () => {
    expect(sourceRankingLabel(null, "hotsearch-baidu")).toBe("排名未记录");
    expect(sourceRankingLabel(null, "short-rss")).toBe("非榜单来源");
    expect(sourceRankingLabel({ ...ranking, kind: "selection", rank: null })).toContain("非排名榜单");
    expect(sourceRankingLabel({ ...ranking, kind: "listing" })).toContain("第3位");
  });
});
