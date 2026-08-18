import { DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { message } from "ant-design-vue";
import { afterEach, beforeEach, vi } from "vitest";

import SourcesPage from "../../src/client/pages/settings/SourcesPage.vue";
import * as aiTimelineAdminApi from "../../src/client/services/aiTimelineAdminApi";
import * as settingsApi from "../../src/client/services/settingsApi";
import { mountWithApp } from "./helpers/mountWithApp";

export { aiTimelineAdminApi, message, settingsApi };

export function createMockMessageHandle(): ReturnType<typeof message.success> {
  return (() => undefined) as ReturnType<typeof message.success>;
}

const mountedWrappers: VueWrapper[] = [];

export function setupSourcesPageTestHooks() {
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
}

export function mountSourcesPage() {
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
export function getModalNode(selector: string) {
  const node = document.body.querySelector(selector);

  if (!(node instanceof HTMLElement)) {
    throw new Error(`Expected modal node for selector "${selector}" to exist.`);
  }

  return new DOMWrapper(node);
}

// 某些断言只需要判断弹窗节点是否存在，用轻量查询避免误把页面主体当成 modal 内容。
export function findModalNode(selector: string) {
  const node = document.body.querySelector(selector);
  return node instanceof HTMLElement ? new DOMWrapper(node) : null;
}

export function createSourcesModel() {
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

export function createAiTimelineAdminWorkbench() {
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
