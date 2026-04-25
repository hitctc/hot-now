import { DOMWrapper, flushPromises, type VueWrapper } from "@vue/test-utils";
import { message } from "ant-design-vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SourcesPage from "../../src/client/pages/settings/SourcesPage.vue";
import * as aiTimelineAdminApi from "../../src/client/services/aiTimelineAdminApi";
import * as settingsApi from "../../src/client/services/settingsApi";
import { mountWithApp } from "./helpers/mountWithApp";

function createMockMessageHandle(): ReturnType<typeof message.success> {
  return (() => undefined) as ReturnType<typeof message.success>;
}

vi.mock("../../src/client/services/settingsApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/settingsApi")>(
    "../../src/client/services/settingsApi"
  );

  return {
    ...actual,
    readSettingsSources: vi.fn(),
    createSource: vi.fn(),
    updateSource: vi.fn(),
    deleteSource: vi.fn(),
    toggleSource: vi.fn(),
    updateSourceDisplayMode: vi.fn(),
    createBilibiliQuery: vi.fn(),
    createHackerNewsQuery: vi.fn(),
    createTwitterAccount: vi.fn(),
    createTwitterSearchKeyword: vi.fn(),
    createWechatRssSources: vi.fn(),
    updateWechatRssSource: vi.fn(),
    updateHackerNewsQuery: vi.fn(),
    updateBilibiliQuery: vi.fn(),
    updateTwitterAccount: vi.fn(),
    updateTwitterSearchKeyword: vi.fn(),
    deleteHackerNewsQuery: vi.fn(),
    deleteBilibiliQuery: vi.fn(),
    deleteTwitterAccount: vi.fn(),
    deleteTwitterSearchKeyword: vi.fn(),
    deleteWechatRssSource: vi.fn(),
    toggleHackerNewsQuery: vi.fn(),
    toggleBilibiliQuery: vi.fn(),
    toggleTwitterAccount: vi.fn(),
    toggleTwitterSearchKeywordCollect: vi.fn(),
    toggleTwitterSearchKeywordVisible: vi.fn(),
    triggerManualCollect: vi.fn(),
    triggerManualBilibiliCollect: vi.fn(),
    triggerManualHackerNewsCollect: vi.fn(),
    triggerManualWeiboTrendingCollect: vi.fn(),
    triggerManualAiTimelineCollect: vi.fn(),
    triggerManualWechatRssCollect: vi.fn(),
    triggerManualTwitterCollect: vi.fn(),
    triggerManualTwitterKeywordCollect: vi.fn(),
    triggerManualSendLatestEmail: vi.fn()
  };
});

vi.mock("../../src/client/services/aiTimelineAdminApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/aiTimelineAdminApi")>(
    "../../src/client/services/aiTimelineAdminApi"
  );

  return {
    ...actual,
    readAiTimelineAdminWorkbench: vi.fn()
  };
});

const mountedWrappers: VueWrapper[] = [];

function mountSourcesPage() {
  const wrapper = mountWithApp(SourcesPage, {
    global: {
      stubs: {
        teleport: false,
        transition: true,
        "transition-group": true
      }
    }
  });

  mountedWrappers.push(wrapper);
  return wrapper;
}

// 来源弹窗现在使用真实 Teleport 浮层挂到 body，测试要从全局 DOM 里取节点。
function getModalNode(selector: string) {
  const node = document.body.querySelector(selector);

  if (!(node instanceof HTMLElement)) {
    throw new Error(`Expected modal node for selector "${selector}" to exist.`);
  }

  return new DOMWrapper(node);
}

// 某些断言只需要判断弹窗节点是否存在，用轻量查询避免误把页面主体当成 modal 内容。
function findModalNode(selector: string) {
  const node = document.body.querySelector(selector);
  return node instanceof HTMLElement ? new DOMWrapper(node) : null;
}

function createSourcesModel() {
  return {
    sources: [
      {
        kind: "openai",
        name: "OpenAI",
        siteUrl: "https://openai.com/news/",
        rssUrl: "https://openai.com/news/rss.xml",
        isEnabled: true,
        isBuiltIn: true,
        showAllWhenSelected: true,
        sourceType: "rss",
        bridgeKind: null,
        bridgeConfigSummary: null,
        bridgeInputMode: null,
        bridgeInputValue: null,
        lastCollectedAt: "2026-03-31T08:00:00.000Z",
        lastCollectionStatus: "completed",
        totalCount: 20,
        publishedTodayCount: 3,
        collectedTodayCount: 2,
        viewStats: {
          hot: { candidateCount: 5, visibleCount: 2, visibleShare: 0.4 },
          articles: { candidateCount: 4, visibleCount: 3, visibleShare: 0.3 },
          ai: { candidateCount: 6, visibleCount: 4, visibleShare: 0.5 }
        }
      }
    ],
    twitterAccounts: [
      {
        id: 1,
        username: "openai",
        userId: "123",
        displayName: "OpenAI",
        category: "official_vendor",
        priority: 90,
        includeReplies: false,
        isEnabled: true,
        notes: "official account",
        lastFetchedAt: "2026-04-23T08:00:00.000Z",
        lastSuccessAt: "2026-04-23T08:01:00.000Z",
        lastError: null,
        createdAt: "2026-04-23T07:00:00.000Z",
        updatedAt: "2026-04-23T08:01:00.000Z"
      }
    ],
    twitterSearchKeywords: [
      {
        id: 11,
        keyword: "OpenAI",
        category: "official_vendor",
        priority: 90,
        isCollectEnabled: true,
        isVisible: true,
        notes: "core keyword",
        lastFetchedAt: "2026-04-23T08:10:00.000Z",
        lastSuccessAt: "2026-04-23T08:11:00.000Z",
        lastResult: "本次搜索成功，获得 2 条可入库推文。",
        createdAt: "2026-04-23T07:00:00.000Z",
        updatedAt: "2026-04-23T08:11:00.000Z"
      }
    ],
    hackerNewsQueries: [
      {
        id: 21,
        query: "openai",
        priority: 70,
        isEnabled: true,
        notes: "core query",
        lastFetchedAt: "2026-04-23T08:20:00.000Z",
        lastSuccessAt: "2026-04-23T08:21:00.000Z",
        lastResult: "本次搜索成功，获得 2 条候选内容。",
        createdAt: "2026-04-23T07:00:00.000Z",
        updatedAt: "2026-04-23T08:21:00.000Z"
      }
    ],
    bilibiliQueries: [
      {
        id: 31,
        query: "openai",
        priority: 75,
        isEnabled: true,
        notes: "video query",
        lastFetchedAt: "2026-04-23T08:30:00.000Z",
        lastSuccessAt: "2026-04-23T08:31:00.000Z",
        lastResult: "本次搜索成功，获得 2 条候选视频。",
        createdAt: "2026-04-23T07:00:00.000Z",
        updatedAt: "2026-04-23T08:31:00.000Z"
      }
    ],
    wechatRssSources: [
      {
        id: 41,
        rssUrl: "https://rss.example.com/wechat.xml",
        displayName: "AI 公众号 RSS",
        isEnabled: true,
        lastFetchedAt: "2026-04-23T08:50:00.000Z",
        lastSuccessAt: "2026-04-23T08:51:00.000Z",
        lastResult: "本次抓取成功，获得 2 条候选内容。",
        createdAt: "2026-04-23T07:00:00.000Z",
        updatedAt: "2026-04-23T08:51:00.000Z"
      }
    ],
    weiboTrending: {
      fixedKeywords: ["OpenAI", "AI", "大模型"],
      lastFetchedAt: "2026-04-23T08:40:00.000Z",
      lastSuccessAt: "2026-04-23T08:41:00.000Z",
      lastResult: "本次匹配成功，命中 1 个微博热搜话题。"
    },
    operations: {
      lastCollectionRunAt: "2026-03-31T08:10:00.000Z",
      lastSendLatestEmailAt: "2026-03-31T08:30:00.000Z",
      nextCollectionRunAt: "2026-03-31T10:40:00.000Z",
      canTriggerManualCollect: true,
      canTriggerManualTwitterCollect: true,
      canTriggerManualTwitterKeywordCollect: true,
      canTriggerManualHackerNewsCollect: true,
      canTriggerManualBilibiliCollect: true,
      canTriggerManualWeiboTrendingCollect: true,
      canTriggerManualWechatRssCollect: true,
      canTriggerManualSendLatestEmail: true,
      isRunning: false
    },
    capability: {
      wechatArticleUrlEnabled: true,
      wechatArticleUrlMessage: "公众号来源已开启，可直接填写公众号名称，或补一篇文章链接帮助系统更快定位来源。",
      twitterAccountCollectionEnabled: true,
      twitterAccountCollectionMessage: "Twitter 账号采集已配置 API key，可采集已启用账号。",
      twitterKeywordSearchEnabled: true,
      twitterKeywordSearchMessage: "Twitter 关键词搜索已配置 API key，仅支持手动采集。",
      hackerNewsSearchEnabled: true,
      hackerNewsSearchMessage: "Hacker News 搜索已就绪，可维护 query 并手动采集。",
      bilibiliSearchEnabled: true,
      bilibiliSearchMessage: "B 站搜索已就绪，可维护 query 并手动采集。",
      wechatRssEnabled: true,
      wechatRssMessage: "微信公众号 RSS 已就绪，可批量维护 RSS 链接并手动采集。",
      weiboTrendingEnabled: true,
      weiboTrendingMessage: "微博热搜榜匹配已就绪，固定 AI 关键词只进入 AI 热点。"
    }
  } satisfies settingsApi.SettingsSourcesResponse;
}

function createAiTimelineAdminWorkbench() {
  return {
    overview: {
      visibleImportantCount7d: 3,
      latestVisiblePublishedAt: "2026-04-24T10:00:00.000Z",
      latestCollectStartedAt: "2026-04-25T01:00:00.000Z",
      failedSourceCount: 1,
      staleSourceCount: 2
    },
    sources: [
      {
        sourceId: "openai-news",
        companyKey: "openai",
        companyName: "OpenAI",
        sourceLabel: "OpenAI News",
        sourceKind: "rss",
        sourceUrl: "https://openai.com/news/rss.xml",
        latestStatus: "success",
        latestStartedAt: "2026-04-25T01:00:00.000Z",
        latestFinishedAt: "2026-04-25T01:00:02.000Z",
        fetchedItemCount: 12,
        candidateEventCount: 4,
        importantEventCount: 2,
        latestOfficialPublishedAt: "2026-04-24T10:00:00.000Z",
        errorMessage: null
      }
    ],
    options: {
      eventTypes: ["要闻", "模型发布", "开发生态", "产品应用", "行业动态", "官方前瞻"],
      importanceLevels: ["S", "A", "B", "C"],
      visibilityStatuses: ["auto_visible", "hidden", "manual_visible"],
      reliabilityStatuses: ["single_source", "multi_source", "source_degraded", "manual_verified"]
    },
    events: {
      page: 1,
      pageSize: 50,
      totalResults: 4,
      totalPages: 1,
      filters: {
        eventTypes: ["模型发布"],
        companies: [{ key: "openai", name: "OpenAI", eventCount: 4 }]
      },
      events: []
    }
  } satisfies Awaited<ReturnType<typeof aiTimelineAdminApi.readAiTimelineAdminWorkbench>>;
}

describe("SourcesPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(aiTimelineAdminApi.readAiTimelineAdminWorkbench).mockResolvedValue(createAiTimelineAdminWorkbench());
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });
    Object.defineProperty(window, "getComputedStyle", {
      writable: true,
      value: vi.fn().mockReturnValue({
        width: "0px",
        height: "0px",
        transitionDelay: "0s",
        transitionDuration: "0s",
        animationDelay: "0s",
        animationDuration: "0s",
        getPropertyValue: vi.fn().mockReturnValue("0px")
      })
    });
  });

  afterEach(() => {
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders operation cards and source tables from the api model", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T10:34:00.000Z"));

    const wrapper = mountSourcesPage();

    await flushPromises();

    expect(wrapper.find("[data-settings-intro='sources']").exists()).toBe(true);
    expect(wrapper.get("[data-settings-intro='sources']").find("[data-action='add-source']").exists()).toBe(false);
    expect(wrapper.get("[data-settings-intro='sources']").find("[data-action='add-twitter-account']").exists()).toBe(false);
    expect(wrapper.get("[data-sources-section='overview']").findAll("article")).toHaveLength(5);
    expect(wrapper.get("[data-sources-section='overview']").text()).toContain("接入来源");
    expect(wrapper.get("[data-sources-section='overview']").text()).toContain("已启用来源");
    expect(wrapper.get("[data-sources-section='overview']").text()).toContain("下一次采集");
    expect(wrapper.get("[data-sources-section='overview']").text()).toContain("18:40（还有 6 分钟）");
    expect(wrapper.find("[data-sources-section='analytics']").exists()).toBe(false);
    expect(wrapper.get("[data-sources-section='manual-send-latest-email']").text()).toContain("发送最新报告");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("AI 时间线官方源摘要");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("进入 AI 时间线管理");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("失败源 1");
    expect(wrapper.get("[data-sources-section='ai-timeline']").find("[data-ai-timeline-admin-events]").exists()).toBe(false);
    expect(wrapper.get("[data-action='open-ai-timeline-admin']").attributes("href")).toBe("/settings/ai-timeline");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("Twitter 账号");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("新增 Twitter 账号");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("OpenAI");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("@openai");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("官方厂商");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("Twitter 账号采集已配置 API key");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("手动采集 Twitter 账号");
    expect(wrapper.get("[data-sources-section='twitter-keywords']").text()).toContain("Twitter 关键词搜索");
    expect(wrapper.get("[data-sources-section='twitter-keywords']").text()).toContain("新增 Twitter 关键词");
    expect(wrapper.get("[data-sources-section='twitter-keywords']").text()).toContain("OpenAI");
    expect(wrapper.get("[data-sources-section='twitter-keywords']").text()).toContain("官方厂商");
    expect(wrapper.get("[data-sources-section='twitter-keywords']").text()).toContain("Twitter 关键词搜索已配置 API key");
    expect(wrapper.get("[data-sources-section='twitter-keywords']").text()).toContain("手动采集 Twitter 关键词");
    expect(wrapper.get("[data-sources-section='hackernews']").text()).toContain("Hacker News 搜索");
    expect(wrapper.get("[data-sources-section='hackernews']").text()).toContain("新增 Hacker News query");
    expect(wrapper.get("[data-sources-section='hackernews']").text()).toContain("openai");
    expect(wrapper.get("[data-sources-section='hackernews']").text()).toContain("Hacker News 搜索已就绪");
    expect(wrapper.get("[data-sources-section='hackernews']").text()).toContain("手动采集 Hacker News");
    expect(wrapper.get("[data-sources-section='bilibili']").text()).toContain("B 站搜索");
    expect(wrapper.get("[data-sources-section='bilibili']").text()).toContain("新增 B 站 query");
    expect(wrapper.get("[data-sources-section='bilibili']").text()).toContain("openai");
    expect(wrapper.get("[data-sources-section='bilibili']").text()).toContain("B 站搜索已就绪");
    expect(wrapper.get("[data-sources-section='bilibili']").text()).toContain("手动采集 B 站搜索");
    expect(wrapper.get("[data-sources-section='wechat-rss']").text()).toContain("微信公众号 RSS");
    expect(wrapper.get("[data-sources-section='wechat-rss']").text()).toContain("批量新增公众号 RSS");
    expect(wrapper.get("[data-sources-section='wechat-rss']").text()).toContain("AI 公众号 RSS");
    expect(wrapper.get("[data-sources-section='wechat-rss']").text()).toContain("https://rss.example.com/wechat.xml");
    expect(wrapper.get("[data-wechat-rss-name='41']").text()).toContain("AI 公众号 RSS");
    expect(wrapper.get("[data-wechat-rss-url='41']").text()).toContain("https://rss.example.com/wechat.xml");
    expect(wrapper.get("[data-sources-section='wechat-rss']").text()).toContain("微信公众号 RSS 已就绪");
    expect(wrapper.get("[data-sources-section='wechat-rss']").text()).toContain("手动采集公众号 RSS");
    expect(wrapper.get("[data-sources-section='weibo-trending']").text()).toContain("微博热搜榜匹配");
    expect(wrapper.get("[data-sources-section='weibo-trending']").text()).toContain("固定只进入 AI 热点");
    expect(wrapper.get("[data-sources-section='weibo-trending']").text()).toContain("微博热搜榜匹配已就绪");
    expect(wrapper.findAll("[data-weibo-keyword]")).toHaveLength(3);
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("候选事件、证据链和人工修正已经拆到独立管理页");
    expect(wrapper.findAll("[data-ai-timeline-source-summary]")).toHaveLength(6);
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("OpenAI");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("OpenAI News");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("Google AI");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("Gemini API Release Notes");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("Anthropic");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("Claude Code Changelog");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("Claude Platform Release Notes");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("Anthropic News");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("手动采集官方事件");
    expect(wrapper.get("[data-sources-section='inventory']").classes()).toContain("editorial-glass-panel");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("来源库存与统计");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("选中时全量");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("总条数");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("今天发布");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("今天抓取");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("20");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("3");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("2");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("新增来源");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("手动执行采集");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("下一次自动采集：18:40（还有 6 分钟）");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("已完成");
    expect(wrapper.get("[data-sources-section='inventory']").text()).not.toContain("AI 新讯今日候选 / 今日展示");
    expect(wrapper.get("[data-sources-section='inventory']").text()).not.toContain("AI 热点今日候选 / 今日展示");
    await wrapper.get(".ant-table-row-expand-icon").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-source-detail='openai']").text()).toContain("AI 新讯");
    expect(wrapper.get("[data-source-detail='openai']").text()).toContain("AI 热点");
    expect(wrapper.get("[data-source-detail='openai']").text()).toContain("6 / 4");
    expect(wrapper.get("[data-source-detail='openai']").text()).toContain("独立展示占比：50.0%");
    expect(wrapper.get("[data-source-rss-link='openai']").attributes("href")).toBe("https://openai.com/news/rss.xml");
    expect(wrapper.get("[data-source-rss-link='openai']").attributes("title")).toBe("https://openai.com/news/rss.xml");
    expect(wrapper.get("[data-source-rss-link='openai']").classes()).toContain("break-all");

    const inventoryHeaderCells = wrapper.get("[data-sources-section='inventory']").findAll("thead th");
    const labeledInventoryHeaderCells = inventoryHeaderCells.filter((cell) => cell.text().trim().length > 0);

    expect(labeledInventoryHeaderCells.every((cell) => (cell.attributes("style") || "").includes("text-align: center"))).toBe(true);
  });

  it("shows disabled schedule copy when the next collection time is unavailable", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue({
      ...createSourcesModel(),
      operations: {
        ...createSourcesModel().operations,
        nextCollectionRunAt: null
      }
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    expect(wrapper.get("[data-sources-section='overview']").text()).toContain("未启用定时采集");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("未启用定时采集");
  });

  it("toggles a source and reloads the latest sources model", async () => {
    const successSpy = vi.spyOn(message, "success").mockImplementation(() => createMockMessageHandle());
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce({
        ...createSourcesModel(),
        sources: [{ ...createSourcesModel().sources[0], isEnabled: false }]
      });
    vi.mocked(settingsApi.toggleSource).mockResolvedValue({
      ok: true,
      kind: "openai",
      enable: false
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-source-toggle='openai']").trigger("click");
    await flushPromises();

    expect(settingsApi.toggleSource).toHaveBeenCalledWith("openai", false);
    expect(settingsApi.readSettingsSources).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("已停用 source");
    expect(successSpy).toHaveBeenCalledWith("已停用 source。");
  });

  it("starts manual collection and refreshes the page model", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce(createSourcesModel());
    vi.mocked(settingsApi.triggerManualCollect).mockResolvedValue({
      accepted: true,
      action: "collect"
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-action='manual-collect']").trigger("click");
    await flushPromises();

    expect(settingsApi.triggerManualCollect).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("已开始执行采集");
  });

  it("starts twitter account collection and shows the persisted count summary", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce(createSourcesModel());
    vi.mocked(settingsApi.triggerManualTwitterCollect).mockResolvedValue({
      accepted: true,
      action: "collect-twitter-accounts",
      enabledAccountCount: 1,
      fetchedTweetCount: 1,
      persistedContentItemCount: 1,
      failureCount: 0
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-action='manual-twitter-collect']").trigger("click");
    await flushPromises();

    expect(settingsApi.triggerManualTwitterCollect).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Twitter 账号采集已完成：启用 1 个账号，入库 1 条内容，失败 0 个。");
  });

  it("starts twitter keyword collection and shows the persisted count summary", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce(createSourcesModel());
    vi.mocked(settingsApi.triggerManualTwitterKeywordCollect).mockResolvedValue({
      accepted: true,
      action: "collect-twitter-keywords",
      enabledKeywordCount: 1,
      processedKeywordCount: 1,
      fetchedTweetCount: 2,
      persistedContentItemCount: 1,
      reusedContentItemCount: 1,
      failureCount: 0
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-action='manual-twitter-keyword-collect']").trigger("click");
    await flushPromises();

    expect(settingsApi.triggerManualTwitterKeywordCollect).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Twitter 关键词采集已完成：处理 1 个关键词，新入库 1 条，复用 1 条，失败 0 个。");
  });

  it("starts hacker news collection and shows the persisted count summary", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce(createSourcesModel());
    vi.mocked(settingsApi.triggerManualHackerNewsCollect).mockResolvedValue({
      accepted: true,
      action: "collect-hackernews",
      enabledQueryCount: 1,
      processedQueryCount: 1,
      fetchedHitCount: 2,
      persistedContentItemCount: 1,
      reusedContentItemCount: 1,
      failureCount: 0
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-action='manual-hackernews-collect']").trigger("click");
    await flushPromises();

    expect(settingsApi.triggerManualHackerNewsCollect).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Hacker News 搜索已完成：处理 1 个 query，新入库 1 条，复用 1 条，失败 0 个。");
  });

  it("starts bilibili collection and shows the persisted count summary", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce(createSourcesModel());
    vi.mocked(settingsApi.triggerManualBilibiliCollect).mockResolvedValue({
      accepted: true,
      action: "collect-bilibili",
      enabledQueryCount: 1,
      processedQueryCount: 1,
      fetchedVideoCount: 2,
      persistedContentItemCount: 1,
      reusedContentItemCount: 1,
      failureCount: 0
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-action='manual-bilibili-collect']").trigger("click");
    await flushPromises();

    expect(settingsApi.triggerManualBilibiliCollect).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("B 站搜索已完成：处理 1 个 query，新入库 1 条，复用 1 条，失败 0 个。");
  });

  it("runs the manual weibo trending collect action and shows the summarized toast", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce(createSourcesModel());
    vi.mocked(settingsApi.triggerManualWeiboTrendingCollect).mockResolvedValue({
      accepted: true,
      action: "collect-weibo-trending",
      fetchedTopicCount: 5,
      matchedTopicCount: 2,
      persistedContentItemCount: 1,
      reusedContentItemCount: 1,
      failureCount: 0
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-action='manual-weibo-trending-collect']").trigger("click");
    await flushPromises();

    expect(settingsApi.triggerManualWeiboTrendingCollect).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("微博热搜榜匹配已完成：命中 2 个话题，新入库 1 条，复用 1 条，失败 0 次。");
  });

  it("runs the manual AI timeline collection action and shows the official event summary", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce(createSourcesModel());
    vi.mocked(settingsApi.triggerManualAiTimelineCollect).mockResolvedValue({
      accepted: true,
      action: "collect-ai-timeline",
      sourceCount: 2,
      fetchedItemCount: 3,
      persistedEventCount: 2,
      insertedEventCount: 1,
      updatedEventCount: 1,
      skippedItemCount: 0,
      failureCount: 0
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-action='manual-ai-timeline-collect']").trigger("click");
    await flushPromises();

    expect(settingsApi.triggerManualAiTimelineCollect).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("AI 时间线官方源采集已完成：官方源 2 个，新事件 1 条，更新 1 条，跳过 0 条，失败 0 个。");
  });

  it("starts WeChat RSS collection and shows the persisted count summary", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce(createSourcesModel());
    vi.mocked(settingsApi.triggerManualWechatRssCollect).mockResolvedValue({
      accepted: true,
      action: "collect-wechat-rss",
      enabledSourceCount: 1,
      fetchedItemCount: 2,
      persistedContentItemCount: 1,
      failureCount: 0
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-action='manual-wechat-rss-collect']").trigger("click");
    await flushPromises();

    expect(settingsApi.triggerManualWechatRssCollect).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("微信公众号 RSS 采集已完成：启用 1 个 RSS，抓取 2 条，写入/更新 1 条，失败 0 个。");
  });

  it("updates source display mode and reloads the latest sources model", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce({
        ...createSourcesModel(),
        sources: [{ ...createSourcesModel().sources[0], showAllWhenSelected: false }]
      });
    vi.mocked(settingsApi.updateSourceDisplayMode).mockResolvedValue({
      ok: true,
      kind: "openai",
      showAllWhenSelected: false
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-source-display-mode='openai']").trigger("click");
    await flushPromises();

    expect(settingsApi.updateSourceDisplayMode).toHaveBeenCalledWith("openai", false);
    expect(settingsApi.readSettingsSources).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("已关闭选中时全量展示");
  });

  it("toggles a twitter account and reloads the latest sources model", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce({
        ...createSourcesModel(),
        twitterAccounts: [{ ...createSourcesModel().twitterAccounts[0], isEnabled: false }]
      });
    vi.mocked(settingsApi.toggleTwitterAccount).mockResolvedValue({
      ok: true,
      id: 1,
      enable: false
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-twitter-account-toggle='1']").trigger("click");
    await flushPromises();

    expect(settingsApi.toggleTwitterAccount).toHaveBeenCalledWith(1, false);
    expect(settingsApi.readSettingsSources).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("已停用 Twitter 账号");
  });

  it("toggles a hacker news query and reloads the latest sources model", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce({
        ...createSourcesModel(),
        hackerNewsQueries: [{ ...createSourcesModel().hackerNewsQueries![0], isEnabled: false }]
      });
    vi.mocked(settingsApi.toggleHackerNewsQuery).mockResolvedValue({
      ok: true,
      id: 21,
      enable: false
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-hackernews-query-toggle='21']").trigger("click");
    await flushPromises();

    expect(settingsApi.toggleHackerNewsQuery).toHaveBeenCalledWith(21, false);
    expect(settingsApi.readSettingsSources).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("已停用 Hacker News query");
  });

  it("toggles a bilibili query and reloads the latest sources model", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce({
        ...createSourcesModel(),
        bilibiliQueries: [{ ...createSourcesModel().bilibiliQueries![0], isEnabled: false }]
      });
    vi.mocked(settingsApi.toggleBilibiliQuery).mockResolvedValue({
      ok: true,
      id: 31,
      enable: false
    });

    const wrapper = mountSourcesPage();

    await flushPromises();
    await wrapper.get("[data-bilibili-query-toggle='31']").trigger("click");
    await flushPromises();

    expect(settingsApi.toggleBilibiliQuery).toHaveBeenCalledWith(31, false);
    expect(settingsApi.readSettingsSources).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("已停用 B 站 query");
  });

  it("submits a twitter account from the create modal", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.createTwitterAccount).mockResolvedValue({
      ok: true,
      account: createSourcesModel().twitterAccounts[0]
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-action='add-twitter-account']").trigger("click");
    await flushPromises();

    expect(document.body.querySelector(".ant-modal-root")).not.toBeNull();
    expect(document.body.querySelector(".editorial-form-modal")).not.toBeNull();
    expect(document.body.querySelector(".editorial-form-modal-wrap")).not.toBeNull();
    expect(getModalNode("[data-twitter-account-capability]").text()).toContain("Twitter 账号采集已配置 API key");

    await getModalNode("[data-twitter-account-form='username']").setValue("@OpenAI");
    await getModalNode("[data-twitter-account-form='display-name']").setValue("OpenAI");
    await getModalNode("[data-twitter-account-form='category']").setValue("official_vendor");
    await getModalNode("[data-twitter-account-form='priority']").setValue("90");
    await getModalNode("[data-twitter-account-form='notes']").setValue("official account");
    await getModalNode("[data-twitter-account-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.createTwitterAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "@OpenAI",
        displayName: "OpenAI",
        category: "official_vendor",
        priority: 90,
        includeReplies: false,
        notes: "official account"
      })
    );
  });

  it("submits a twitter keyword from the create modal", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.createTwitterSearchKeyword).mockResolvedValue({
      ok: true,
      keyword: createSourcesModel().twitterSearchKeywords[0]
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-action='add-twitter-keyword']").trigger("click");
    await flushPromises();
    expect(getModalNode("[data-twitter-keyword-capability]").text()).toContain("Twitter 关键词搜索已配置 API key");

    await getModalNode("[data-twitter-keyword-form='keyword']").setValue("ChatGPT Image2");
    await getModalNode("[data-twitter-keyword-form='category']").setValue("product");
    await getModalNode("[data-twitter-keyword-form='priority']").setValue("60");
    await getModalNode("[data-twitter-keyword-form='notes']").setValue("image keyword");
    await getModalNode("[data-twitter-keyword-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.createTwitterSearchKeyword).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "ChatGPT Image2",
        category: "product",
        priority: 60,
        isCollectEnabled: true,
        isVisible: true,
        notes: "image keyword"
      })
    );
  });

  it("updates a twitter account from the edit modal", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.updateTwitterAccount).mockResolvedValue({
      ok: true,
      account: {
        ...createSourcesModel().twitterAccounts[0],
        displayName: "OpenAI News",
        includeReplies: true
      }
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-twitter-account-edit='1']").trigger("click");
    await flushPromises();

    await getModalNode("[data-twitter-account-form='display-name']").setValue("OpenAI News");
    await getModalNode("[data-twitter-account-form='include-replies']").setValue(true);
    await getModalNode("[data-twitter-account-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.updateTwitterAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        username: "openai",
        displayName: "OpenAI News",
        category: "official_vendor",
        priority: 90,
        includeReplies: true,
        notes: "official account"
      })
    );
  });

  it("submits a hacker news query from the create modal", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.createHackerNewsQuery).mockResolvedValue({
      ok: true,
      query: createSourcesModel().hackerNewsQueries![0]
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-action='add-hackernews-query']").trigger("click");
    await flushPromises();
    expect(getModalNode("[data-hackernews-query-capability]").text()).toContain("Hacker News 搜索已就绪");

    await getModalNode("[data-hackernews-query-form='query']").setValue("anthropic");
    await getModalNode("[data-hackernews-query-form='priority']").setValue("75");
    await getModalNode("[data-hackernews-query-form='notes']").setValue("model vendor");
    await getModalNode("[data-hackernews-query-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.createHackerNewsQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "anthropic",
        priority: 75,
        isEnabled: true,
        notes: "model vendor"
      })
    );
  });

  it("updates a hacker news query from the edit modal", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.updateHackerNewsQuery).mockResolvedValue({
      ok: true,
      query: {
        ...createSourcesModel().hackerNewsQueries![0],
        query: "openai api"
      }
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-hackernews-query-edit='21']").trigger("click");
    await flushPromises();

    await getModalNode("[data-hackernews-query-form='query']").setValue("openai api");
    await getModalNode("[data-hackernews-query-form='is-enabled']").setValue(false);
    await getModalNode("[data-hackernews-query-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.updateHackerNewsQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 21,
        query: "openai api",
        priority: 70,
        isEnabled: false,
        notes: "core query"
      })
    );
  });

  it("submits a bilibili query from the create modal", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.createBilibiliQuery).mockResolvedValue({
      ok: true,
      query: createSourcesModel().bilibiliQueries![0]
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-action='add-bilibili-query']").trigger("click");
    await flushPromises();
    expect(getModalNode("[data-bilibili-query-capability]").text()).toContain("B 站搜索已就绪");

    await getModalNode("[data-bilibili-query-form='query']").setValue("anthropic");
    await getModalNode("[data-bilibili-query-form='priority']").setValue("75");
    await getModalNode("[data-bilibili-query-form='notes']").setValue("video query");
    await getModalNode("[data-bilibili-query-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.createBilibiliQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "anthropic",
        priority: 75,
        isEnabled: true,
        notes: "video query"
      })
    );
  });

  it("updates a bilibili query from the edit modal", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.updateBilibiliQuery).mockResolvedValue({
      ok: true,
      query: {
        ...createSourcesModel().bilibiliQueries![0],
        query: "openai api"
      }
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-bilibili-query-edit='31']").trigger("click");
    await flushPromises();

    await getModalNode("[data-bilibili-query-form='query']").setValue("openai api");
    await getModalNode("[data-bilibili-query-form='is-enabled']").setValue(false);
    await getModalNode("[data-bilibili-query-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.updateBilibiliQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 31,
        query: "openai api",
        priority: 75,
        isEnabled: false,
        notes: "video query"
      })
    );
  });

  it("submits an rss source from the create modal", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.createSource).mockResolvedValue({ ok: true, kind: "rss_demo" });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-action='add-source']").trigger("click");
    await flushPromises();
    expect(getModalNode("[data-source-modal-intro]").text()).toContain("这里只新增 RSS 来源");
    expect(findModalNode("[data-source-type='wechat_bridge']")).toBeNull();
    expect(findModalNode("[data-source-form='wechat-name']")).toBeNull();
    expect(findModalNode("[data-source-form='article-url']")).toBeNull();

    await getModalNode("[data-source-form='rss-url']").setValue("https://example.com/feed.xml");
    await getModalNode("[data-source-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "rss",
        rssUrl: "https://example.com/feed.xml"
      })
    );
  });

  it("submits WeChat RSS links from the batch create modal", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.createWechatRssSources).mockResolvedValue({
      ok: true,
      created: [createSourcesModel().wechatRssSources![0]],
      skippedDuplicateUrls: []
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-action='add-wechat-rss-source']").trigger("click");
    await flushPromises();
    expect(getModalNode("[data-wechat-rss-capability]").text()).toContain("微信公众号 RSS 已就绪");

    await getModalNode("[data-wechat-rss-form='rss-urls']").setValue(
      "https://rss.example.com/a.xml\nhttps://rss.example.com/b.xml"
    );
    await getModalNode("[data-wechat-rss-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.createWechatRssSources).toHaveBeenCalledWith({
      rssUrls: "https://rss.example.com/a.xml\nhttps://rss.example.com/b.xml"
    });
  });

  it("updates a WeChat RSS source from the edit modal", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce({
        ...createSourcesModel(),
        wechatRssSources: [
          {
            ...createSourcesModel().wechatRssSources![0],
            displayName: "新公众号 RSS",
            rssUrl: "https://rss.example.com/new.xml"
          }
        ]
      });
    vi.mocked(settingsApi.updateWechatRssSource).mockResolvedValue({
      ok: true,
      source: {
        ...createSourcesModel().wechatRssSources![0],
        displayName: "新公众号 RSS",
        rssUrl: "https://rss.example.com/new.xml"
      }
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-wechat-rss-edit='41']").trigger("click");
    await flushPromises();

    expect((getModalNode("[data-wechat-rss-form='display-name']").element as HTMLInputElement).value).toBe("AI 公众号 RSS");
    expect((getModalNode("[data-wechat-rss-form='rss-url']").element as HTMLInputElement).value).toBe("https://rss.example.com/wechat.xml");

    await getModalNode("[data-wechat-rss-form='display-name']").setValue("新公众号 RSS");
    await getModalNode("[data-wechat-rss-form='rss-url']").setValue("https://rss.example.com/new.xml");
    await getModalNode("[data-wechat-rss-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.updateWechatRssSource).toHaveBeenCalledWith({
      id: 41,
      displayName: "新公众号 RSS",
      rssUrl: "https://rss.example.com/new.xml"
    });
  });

  it("updates a custom rss source with the existing modal", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue({
      ...createSourcesModel(),
      sources: [
        ...createSourcesModel().sources,
        {
          kind: "rss_demo",
          name: "RSS Demo",
          siteUrl: "https://example.com/",
          rssUrl: "https://example.com/old.xml",
          isEnabled: true,
          isBuiltIn: false,
          showAllWhenSelected: false,
          sourceType: "rss",
          bridgeKind: null,
          bridgeConfigSummary: null,
          bridgeInputMode: null,
          bridgeInputValue: null,
          lastCollectedAt: null,
          lastCollectionStatus: null
        }
      ]
    });
    vi.mocked(settingsApi.updateSource).mockResolvedValue({ ok: true, kind: "rss_demo" });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-source-edit='rss_demo']").trigger("click");
    await flushPromises();

    expect((getModalNode("[data-source-form='rss-url']").element as HTMLInputElement).value).toBe("https://example.com/old.xml");
    await getModalNode("[data-source-form='rss-url']").setValue("https://example.com/new.xml");
    await getModalNode("[data-source-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.updateSource).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "rss_demo",
        sourceType: "rss",
        rssUrl: "https://example.com/new.xml"
      })
    );
  });

  it("renders custom source actions in the last inventory column", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue({
      ...createSourcesModel(),
      sources: [
        ...createSourcesModel().sources,
        {
          kind: "wechat_demo",
          name: "微信 Demo",
          siteUrl: "https://mp.weixin.qq.com/",
          rssUrl: "https://bridge.example.test/feed/demo.xml",
          isEnabled: true,
          isBuiltIn: false,
          showAllWhenSelected: false,
          sourceType: "wechat_bridge",
          bridgeKind: "resolver",
          bridgeConfigSummary: "公众号文章链接",
          bridgeInputMode: "article_url" as const,
          bridgeInputValue: "https://mp.weixin.qq.com/s?__biz=abc",
          lastCollectedAt: null,
          lastCollectionStatus: null
        }
      ]
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    const sourceCell = wrapper.get("[data-source-cell='wechat_demo']");
    const actionsRow = wrapper.get("[data-source-actions='wechat_demo']");
    const inventoryHeaderCells = wrapper.get("[data-sources-section='inventory']").findAll("thead th");

    expect(sourceCell.get("[data-source-meta='wechat_demo']").text()).toContain("微信 Demo");
    expect(wrapper.get("[data-source-badges='wechat_demo']").text()).toContain("公众号");
    expect(sourceCell.text()).not.toContain("编辑");
    expect(sourceCell.text()).not.toContain("删除");
    expect(actionsRow.text()).not.toContain("编辑");
    expect(wrapper.find("[data-source-edit='wechat_demo']").exists()).toBe(false);
    expect(actionsRow.text()).toContain("删除");
    expect(inventoryHeaderCells.at(-1)?.text()).toContain("操作");
  });

  it("requires popconfirm before deleting a custom source", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce({
        ...createSourcesModel(),
        sources: [
          ...createSourcesModel().sources,
          {
            kind: "wechat_demo",
            name: "微信 Demo",
            siteUrl: "https://mp.weixin.qq.com/",
            rssUrl: "https://bridge.example.test/feed/demo.xml",
            isEnabled: true,
            isBuiltIn: false,
            showAllWhenSelected: false,
            sourceType: "wechat_bridge",
            bridgeKind: "resolver",
            bridgeConfigSummary: "公众号文章链接",
            bridgeInputMode: "article_url" as const,
            bridgeInputValue: "https://mp.weixin.qq.com/s?__biz=abc",
            lastCollectedAt: null,
            lastCollectionStatus: null
          }
        ]
      })
      .mockResolvedValueOnce(createSourcesModel());
    vi.mocked(settingsApi.deleteSource).mockResolvedValue({ ok: true, kind: "wechat_demo" });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-source-delete='wechat_demo']").trigger("click");
    expect(settingsApi.deleteSource).not.toHaveBeenCalled();

    const sourceDeleteConfirm = wrapper
      .findAllComponents({ name: "APopconfirm" })
      .find((component) => component.find('[data-source-delete="wechat_demo"]').exists());

    expect(sourceDeleteConfirm).toBeTruthy();

    sourceDeleteConfirm!.vm.$emit("confirm");
    await flushPromises();

    expect(settingsApi.deleteSource).toHaveBeenCalledWith("wechat_demo");
    expect(settingsApi.readSettingsSources).toHaveBeenCalledTimes(2);
  });

  it("requires popconfirm before deleting a twitter account", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce({
        ...createSourcesModel(),
        twitterAccounts: []
      });
    vi.mocked(settingsApi.deleteTwitterAccount).mockResolvedValue({ ok: true, id: 1 });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-twitter-account-delete='1']").trigger("click");
    expect(settingsApi.deleteTwitterAccount).not.toHaveBeenCalled();

    const accountDeleteConfirm = wrapper
      .findAllComponents({ name: "APopconfirm" })
      .find((component) => component.find('[data-twitter-account-delete="1"]').exists());

    expect(accountDeleteConfirm).toBeTruthy();

    accountDeleteConfirm!.vm.$emit("confirm");
    await flushPromises();

    expect(settingsApi.deleteTwitterAccount).toHaveBeenCalledWith(1);
    expect(settingsApi.readSettingsSources).toHaveBeenCalledTimes(2);
  });

  it("requires popconfirm before deleting a WeChat RSS source", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce({
        ...createSourcesModel(),
        wechatRssSources: []
      });
    vi.mocked(settingsApi.deleteWechatRssSource).mockResolvedValue({ ok: true, id: 41 });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-wechat-rss-delete='41']").trigger("click");
    expect(settingsApi.deleteWechatRssSource).not.toHaveBeenCalled();

    const wechatRssDeleteConfirm = wrapper
      .findAllComponents({ name: "APopconfirm" })
      .find((component) => component.find('[data-wechat-rss-delete="41"]').exists());

    expect(wechatRssDeleteConfirm).toBeTruthy();

    wechatRssDeleteConfirm!.vm.$emit("confirm");
    await flushPromises();

    expect(settingsApi.deleteWechatRssSource).toHaveBeenCalledWith(41);
    expect(settingsApi.readSettingsSources).toHaveBeenCalledTimes(2);
  });
});
