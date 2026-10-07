import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShortFinishedArticlesPage from "../../src/client/pages/creative/ShortFinishedArticlesPage.vue";
import FinishedArticlesPage from "../../src/client/pages/creative/FinishedArticlesPage.vue";
import ArticlePushFloatWidget from "../../src/client/components/creative/ArticlePushFloatWidget.vue";
import ArticleDetailDrawer from "../../src/client/components/creative/LazyArticleDetailDrawer.vue";
import * as api from "../../src/client/services/creativeApi.js";
import * as listApi from "../../src/client/services/creativeListApi.js";

/** 合成短稿保留空规格及独立评分，组件测试不连接服务或真实文章。 */
function article(form: string | null = null): api.CreativeFinishedArticle {
  return { id: 42, direction: "short_content", originType: "pipeline", status: "ready_for_publish", form,
    titles: '["隔离短稿"]', humanMarkdown: "# 隔离短稿\n\n", contentMarkdown: "", sourceItemId: null,
    coverImage: [], coverImagePrompt: null, inlineImagePrompts: {}, imagesJson: [], codeImageCards: [],
    reversalScore: 0, trendScore: 95, trendBreakdown: null, similarityCheck: null, stepTrace: [],
    createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z", deletedAt: null,
    pinnedAt: null, sourceName: "合成来源", pushCount: 0,
    mode: null, thesis: null, intros: [], hooks: null, quotes: null, summary100: [], codeImageKeywords: [],
    images: [], coverImageIndex: 0, titleIndex: 0, introIndex: 0, summaryIndex: 0,
    anomalyReason: null, rawResponseText: null, wechatPublished: false, publishable: false,
    needsManualReview: false, manualReviewReason: null, manualReviewReasons: [], currentStep: null,
    stopStep: null, reasonCode: null, reasonText: null, wechatThemeId: null, wechatHtml: null,
    pipelineVersion: null, readerTask: null, readerRelevance: null, evidencePack: null,
    readerValuePlan: null, factSkeleton: null, oralDraft: null, titleCandidates: [], factSourceChecklist: [],
    titleSelectionConfirmed: true, sourceTitle: null, publishedAt: null,
    performanceDeliveredUsers: null, performanceReadUsers: null, performanceShareUsers: null,
    performanceNewFollowers: null, performanceRewriteLevel: null, performanceTitleSnapshot: null,
    performanceTitleGroupSnapshot: null, performanceReaderTaskSnapshot: null, performanceRecordedAt: null,
  };
}

/** 只替换长短成品表格视觉和弹窗，保留页面请求、新建、单元格与推送刷新编排。 */
function mountPage(page = ShortFinishedArticlesPage) {
  return mount(page, { global: { stubs: {
    "a-table": { name: "ShortFinishedTableStub", props: ["columns", "dataSource", "pagination", "scroll"], template: '<table><thead><tr><th v-for="column in columns">{{ column.title }}</th></tr></thead><tbody><tr v-for="(record, index) in dataSource"><td v-for="column in columns" :data-column="column.key"><slot name="bodyCell" :column="column" :record="record" :index="index" /></td></tr></tbody></table>' },
    "a-spin": { template: "<div><slot /></div>" }, "a-tooltip": { template: "<div><slot /></div>" },
    "a-modal": { props: ["open"], emits: ["ok"], template: '<div v-if="open"><slot /><button data-test="create" @click="$emit(\'ok\')">创建</button></div>' },
    "a-button": { props: ["loading"], template: '<button :disabled="loading"><slot /></button>' },
    "a-checkbox": true, "a-input-search": true, "a-select": true,
    "a-tag": { props: ["color"], template: '<span :data-color="color"><slot /></span>' },
    "a-form": { template: "<div><slot /></div>" }, "a-form-item": { template: "<div><slot /></div>" },
    "a-input": { emits: ["update:value"], template: '<input data-test="title" @input="$emit(\'update:value\', $event.target.value)" />' },
    ArticleDetailDrawer: { props: ["open", "article"], emits: ["update:open", "openPush"], template: '<div v-if="open" data-test="editor"><button data-test="close" @click="$emit(\'update:open\', false)">关闭</button></div>' },
    SourceItemDetailModal: true, CreativeCoverThumbnail: true, ArticlePerformanceFeedbackModal: true,
    ArticlePushFloatWidget: { name: "ArticlePushFloatWidget", props: ["article", "visible"], emits: ["success"], template: "<div />", methods: {
      /** 替身只提供页面需要的重置入口，不启动真实推送。 */
      resetState() {},
      /** 页面首次点击仍调用该入口，测试不写公众号草稿。 */
      startPush() {},
    } },
  } } });
}

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe.each([["短内容", ShortFinishedArticlesPage], ["长文", FinishedArticlesPage]])("%s成品标题信息与推送次数", (_label, page) => {
  it("手机首屏只需ID和标题，桌面恢复原序号及列宽", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 360, configurable: true });
    vi.spyOn(listApi, "readCreativeFinishedArticles").mockResolvedValue({ items: [{ ...article(), id: 123456, seqNumber: 7 }], total: 1, page: 1, pageSize: 30, dayCounts: [], sourceDayCounts: [] });
    const wrapper = mountPage(page);
    try {
      await flushPromises();
      const table = wrapper.findComponent({ name: "ShortFinishedTableStub" });
      expect(table.props("columns").slice(0, 2)).toEqual([
        expect.objectContaining({ title: "ID", width: 56 }),
        expect.objectContaining({ title: "标题", width: 304 }),
      ]);
      expect(wrapper.get('[data-column="idSeq"]').text()).toContain("123456");
      expect(wrapper.get('[data-column="idSeq"] [data-table-sequence]').text()).toBe("#7");
      Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
      window.dispatchEvent(new Event("resize"));
      await flushPromises();
      expect(table.props("columns").slice(0, 2)).toEqual([
        expect.objectContaining({ title: "ID / 序号", width: 72 }),
        expect.objectContaining({ title: "标题", width: 300 }),
      ]);
      expect(table.props("scroll")).toEqual({ x: 900 });
    } finally {
      wrapper.unmount();
      Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true });
    }
  });

  it.each([0, 85, null])("标题列集中显示来源和真实质检分%s，缺失不能用素材趋势补齐", async (score) => {
    const item = { ...article(), sourceItemId: 8, sourceTitle: "完整关联素材标题", reversalScore: score };
    vi.spyOn(listApi, "readCreativeFinishedArticles").mockResolvedValue({ items: [item], total: 1, page: 1, pageSize: 30, dayCounts: [], sourceDayCounts: [] });
    const wrapper = mountPage(page);
    try {
      await flushPromises();
      const title = wrapper.get('[data-column="title"]');
      expect(title.get("[data-title-source]").text()).toBe(`来源：合成来源${page === ShortFinishedArticlesPage ? ' · 排名未记录' : ''}（${score == null ? '未评分' : `质检分：${score}`}）`);
      expect(title.text()).toContain("素材 #8 完整关联素材标题");
      expect(title.get("a").classes()).not.toContain("truncate");
      expect(wrapper.find('[data-column="sourceName"]').exists()).toBe(false);
      expect(wrapper.find('[data-column="quality"]').exists()).toBe(false);
      await title.get("a").trigger("click");
      expect(wrapper.findComponent(ArticleDetailDrawer).props("article")).toBeNull();
    } finally { wrapper.unmount(); }
  });

  it("成功推送后刷新已打开详情的次数，不替换未保存正文", async () => {
    const item = article();
    vi.spyOn(listApi, "readCreativeFinishedArticles").mockResolvedValue({ items: [item], total: 1, page: 1, pageSize: 30, dayCounts: [], sourceDayCounts: [] });
    const read = vi.spyOn(listApi, "readCreativeFinishedArticle").mockResolvedValue(item);
    const wrapper = mountPage(page);
    try {
      await flushPromises();
      await wrapper.get('[data-column="title"] span.cursor-pointer').trigger("click");
      await flushPromises();
      const editor = wrapper.findComponent(ArticleDetailDrawer);
      const current = editor.props("article")!;
      current.humanMarkdown = "推送期间正在编辑的正文";
      editor.vm.$emit("openPush", current, "bauhaus");
      await flushPromises();
      read.mockResolvedValue({ ...item, pushCount: 2, humanMarkdown: "服务器旧正文" });
      wrapper.findComponent(ArticlePushFloatWidget).vm.$emit("success");
      await flushPromises();
      expect(editor.props("article")?.pushCount).toBe(2);
      expect(editor.props("article")?.humanMarkdown).toBe("推送期间正在编辑的正文");
    } finally { wrapper.unmount(); }
  });
});

describe("统一短内容成品流程", () => {
  it.each([
    ["ranking", 3, "第3名"], ["listing", 3, "第3位"], ["selection", null, "非排名榜单"],
  ] as const)("来源后质检分前显示%s的首次时间与真实榜位", async (kind, rank, label) => {
    const item = { ...article(), sourceName: "微博热搜", reversalScore: 85,
      sourceRanking: { board: "微博热搜榜", capturedAt: "2026-10-06T12:30:00+0800", kind, rank } };
    vi.spyOn(listApi, "readCreativeFinishedArticles").mockResolvedValue({ items: [item], total: 1, page: 1, pageSize: 30, dayCounts: [], sourceDayCounts: [] });
    const wrapper = mountPage();
    try {
      await flushPromises();
      const source = wrapper.get('[data-column="title"] [data-title-source]');
      expect(source.text()).toBe(`来源：微博热搜 · 微博热搜榜 · 10-06 12:30 · ${label}（质检分：85）`);
      expect(source.get("[data-short-finished-ranking]").text()).toContain(label);
      expect(source.classes()).toEqual(expect.arrayContaining(["whitespace-normal", "break-words"]));
    } finally { wrapper.unmount(); }
  });

  it.each([["hotsearch-weibo", "排名未记录"], ["short-rss", "非榜单来源"]])("缺少快照时%s不伪造时间或排名，手动稿不附加榜位", async (agent, label) => {
    const item = { ...article(), sourceCollectorAgent: agent, sourceRanking: null };
    const read = vi.spyOn(listApi, "readCreativeFinishedArticles").mockResolvedValue({ items: [item], total: 1, page: 1, pageSize: 30, dayCounts: [], sourceDayCounts: [] });
    const wrapper = mountPage();
    try {
      await flushPromises();
      expect(wrapper.get("[data-title-source]").text()).toBe(`来源：合成来源 · ${label}（质检分：0）`);
      read.mockResolvedValue({ items: [{ ...item, originType: "manual" }], total: 1, page: 1, pageSize: 30, dayCounts: [], sourceDayCounts: [] });
      await wrapper.get('[data-short-finished-action="refresh"]').trigger("click");
      await flushPromises();
      expect(wrapper.find("[data-short-finished-ranking]").exists()).toBe(false);
      expect(wrapper.get("[data-title-source]").text()).toBe("来源：合成来源（质检分：0）");
    } finally { wrapper.unmount(); }
  });
  it("搜索区域在窄屏可收缩且刷新按钮位于搜索之后", async () => {
    vi.spyOn(listApi, "readCreativeFinishedArticles").mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 30, dayCounts: [], sourceDayCounts: [] });
    const wrapper = mountPage();
    try {
      await flushPromises();
      const controls = wrapper.get("[data-short-finished-search-controls]");
      expect(controls.classes()).toEqual(expect.arrayContaining(["w-full", "min-w-0", "sm:w-auto"]));
      const input = controls.get("a-input-search-stub");
      expect(input.classes()).toContain("!w-full");
      expect(input.classes()).not.toContain("!w-[360px]");
      expect(input.element.parentElement?.classList.contains("min-w-0")).toBe(true);
      const refresh = controls.get('[data-short-finished-action="refresh"]');
      expect(refresh.classes()).toContain("shrink-0");
      expect(controls.element.lastElementChild).toBe(refresh.element);
    } finally { wrapper.unmount(); }
  });

  it("刷新保留搜索筛选和分页，加载中反馈忙碌，成功后更新当前表格", async () => {
    localStorage.setItem("creative-short-finished-filters", JSON.stringify({ search: "当前标题", status: "ready_for_publish", publishableOnly: true, showDeleted: true }));
    const result = { items: [article()], total: 40, page: 1, pageSize: 30, dayCounts: [], sourceDayCounts: [] };
    const read = vi.spyOn(listApi, "readCreativeFinishedArticles").mockResolvedValue(result);
    const wrapper = mountPage();
    try {
      await flushPromises();
      wrapper.findComponent({ name: "ShortFinishedTableStub" }).vm.$emit("change", { current: 3, pageSize: 10 });
      await flushPromises();
      let finish!: (value: typeof result) => void;
      read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const before = read.mock.calls.length;
      const refresh = wrapper.get('[data-short-finished-action="refresh"]');
      await refresh.trigger("click");
      expect(read).toHaveBeenCalledTimes(before + 1);
      expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "short_content", page: 3, pageSize: 10, search: "当前标题", status: "ready_for_publish", publishable: "1", includeDeleted: "1" }));
      expect(refresh.attributes("disabled")).toBeDefined();
      finish({ ...result, page: 3, pageSize: 10, items: [{ ...article(), titles: '["刷新后的短稿"]' }] });
      await flushPromises();
      expect(refresh.attributes("disabled")).toBeUndefined();
      expect(wrapper.get("tbody").text()).toContain("刷新后的短稿");
      expect(wrapper.findComponent({ name: "ShortFinishedTableStub" }).props("pagination")).toMatchObject({ current: 3, pageSize: 10, total: 40 });
    } finally { wrapper.unmount(); }
  });
  it.each([["ai", "purple", "AI"], ["tech_digital", "blue", "科技数码"]])("新稿领域%s显示文字色标且不改变状态", async (domain, color, label) => {
    const item = article();
    item.stepTrace = [{ step: 1, stepName: "短内容写作", status: "success",
      meta: { editorialFocus: "tech-ai-v1", contentDomain: domain } }];
    vi.spyOn(listApi, "readCreativeFinishedArticles").mockResolvedValue({ items: [item], total: 1, page: 1, pageSize: 30, dayCounts: [], sourceDayCounts: [] });
    const wrapper = mountPage();
    await flushPromises();
    const marker = wrapper.get("[data-short-content-domain]");
    expect(marker.attributes("data-color")).toBe(color);
    expect(marker.text()).toBe(label);
    expect(wrapper.text()).toContain("可推送");
    wrapper.unmount();
  });

  it.each(["tuwen", "duanwen", null, "", "unknown"])("不将历史form=%s归类，保留0分质检且不展示素材趋势", async (form) => {
    vi.spyOn(listApi, "readCreativeFinishedArticles").mockResolvedValue({ items: [article(form)], total: 1, page: 1, pageSize: 30, dayCounts: [], sourceDayCounts: [] });
    const wrapper = mountPage();
    await flushPromises();
    const headers = wrapper.findAll("th").map((cell) => cell.text());
    const titleCell = wrapper.findAll("tbody td")[headers.indexOf("标题")]!;
    expect(headers).not.toContain("形态");
    expect(wrapper.text()).not.toContain("反转文");
    expect(wrapper.text()).not.toContain("贴图");
    expect(wrapper.find("[data-short-content-domain]").exists()).toBe(false);
    expect(titleCell.get("[data-title-source]").text()).toBe("来源：合成来源 · 排名未记录（质检分：0）");
    expect(headers).not.toContain("来源");
    expect(headers).not.toContain("质检评分");
    expect(headers).not.toContain("素材趋势");
    wrapper.unmount();
  });

  it("空白人工稿不发送生成规格，创建后打开编辑器且关闭时清除当前稿", async () => {
    vi.spyOn(listApi, "readCreativeFinishedArticles").mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 30, dayCounts: [], sourceDayCounts: [] });
    const create = vi.spyOn(api, "createManualFinishedArticle").mockResolvedValue({ ...article(), originType: "manual", status: "manual_draft" });
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text().includes("新建短内容"))!.trigger("click");
    await wrapper.get('[data-test="title"]').setValue("人工短稿");
    await wrapper.get('[data-test="create"]').trigger("click");
    await flushPromises();
    expect(create).toHaveBeenCalledWith({ title: "人工短稿", direction: "short_content" });
    expect(wrapper.findComponent(ArticleDetailDrawer).props("article")?.form).toBeNull();
    expect(wrapper.find('[data-test="editor"]').exists()).toBe(true);
    await wrapper.get('[data-test="close"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-test="editor"]').exists()).toBe(false);
    expect(wrapper.findComponent(ArticleDetailDrawer).props("article")).toBeNull();
    wrapper.unmount();
  });
});
