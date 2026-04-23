import { DOMWrapper, flushPromises, type VueWrapper } from "@vue/test-utils";
import { message } from "ant-design-vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SourcesPage from "../../src/client/pages/settings/SourcesPage.vue";
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
    updateHackerNewsQuery: vi.fn(),
    updateBilibiliQuery: vi.fn(),
    updateTwitterAccount: vi.fn(),
    updateTwitterSearchKeyword: vi.fn(),
    deleteHackerNewsQuery: vi.fn(),
    deleteBilibiliQuery: vi.fn(),
    deleteTwitterAccount: vi.fn(),
    deleteTwitterSearchKeyword: vi.fn(),
    toggleHackerNewsQuery: vi.fn(),
    toggleBilibiliQuery: vi.fn(),
    toggleTwitterAccount: vi.fn(),
    toggleTwitterSearchKeywordCollect: vi.fn(),
    toggleTwitterSearchKeywordVisible: vi.fn(),
    triggerManualCollect: vi.fn(),
    triggerManualBilibiliCollect: vi.fn(),
    triggerManualHackerNewsCollect: vi.fn(),
    triggerManualTwitterCollect: vi.fn(),
    triggerManualTwitterKeywordCollect: vi.fn(),
    triggerManualSendLatestEmail: vi.fn()
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
    operations: {
      lastCollectionRunAt: "2026-03-31T08:10:00.000Z",
      lastSendLatestEmailAt: "2026-03-31T08:30:00.000Z",
      nextCollectionRunAt: "2026-03-31T10:40:00.000Z",
      canTriggerManualCollect: true,
      canTriggerManualTwitterCollect: true,
      canTriggerManualTwitterKeywordCollect: true,
      canTriggerManualHackerNewsCollect: true,
      canTriggerManualBilibiliCollect: true,
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
      bilibiliSearchMessage: "B 站搜索已就绪，可维护 query 并手动采集。"
    }
  } satisfies settingsApi.SettingsSourcesResponse;
}

describe("SourcesPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
    expect(wrapper.get("[data-sources-section='overview']").findAll("article")).toHaveLength(5);
    expect(wrapper.get("[data-sources-section='overview']").text()).toContain("接入来源");
    expect(wrapper.get("[data-sources-section='overview']").text()).toContain("已启用来源");
    expect(wrapper.get("[data-sources-section='overview']").text()).toContain("下一次采集");
    expect(wrapper.get("[data-sources-section='overview']").text()).toContain("18:40（还有 6 分钟）");
    expect(wrapper.get("[data-sources-section='manual-collect']").text()).toContain("手动执行采集");
    expect(wrapper.get("[data-sources-section='manual-collect']").text()).toContain("下一次自动采集：18:40（还有 6 分钟）");
    expect(wrapper.get("[data-sources-section='analytics']").text()).toContain("AI 新讯24小时候选 / 24小时展示");
    expect(wrapper.get("[data-sources-section='analytics']").text()).toContain("AI 新讯独立展示占比");
    expect(wrapper.get("[data-sources-section='analytics']").text()).toContain("AI 热点独立展示占比");
    expect(wrapper.get("[data-sources-section='analytics']").text()).toContain("选中时全量");
    expect(wrapper.get("[data-sources-section='analytics']").text().indexOf("AI 新讯24小时候选 / 24小时展示")).toBeLessThan(
      wrapper.get("[data-sources-section='analytics']").text().indexOf("AI 热点候选 / 展示")
    );
    expect(wrapper.get("[data-sources-section='analytics']").text()).not.toContain("AI 新讯今日候选 / 今日展示");
    expect(wrapper.get("[data-sources-section='analytics']").text()).not.toContain("AI 热点今日候选 / 今日展示");
    expect(wrapper.get("[data-sources-section='analytics']").text()).toContain("OpenAI");
    expect(wrapper.get("[data-sources-section='manual-send-latest-email']").text()).toContain("发送最新报告");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("Twitter 账号");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("OpenAI");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("@openai");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("官方厂商");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("Twitter 账号采集已配置 API key");
    expect(wrapper.get("[data-sources-section='twitter-accounts']").text()).toContain("手动采集 Twitter 账号");
    expect(wrapper.get("[data-sources-section='twitter-keywords']").text()).toContain("Twitter 关键词搜索");
    expect(wrapper.get("[data-sources-section='twitter-keywords']").text()).toContain("OpenAI");
    expect(wrapper.get("[data-sources-section='twitter-keywords']").text()).toContain("官方厂商");
    expect(wrapper.get("[data-sources-section='twitter-keywords']").text()).toContain("Twitter 关键词搜索已配置 API key");
    expect(wrapper.get("[data-sources-section='twitter-keywords']").text()).toContain("手动采集 Twitter 关键词");
    expect(wrapper.get("[data-sources-section='hackernews']").text()).toContain("Hacker News 搜索");
    expect(wrapper.get("[data-sources-section='hackernews']").text()).toContain("openai");
    expect(wrapper.get("[data-sources-section='hackernews']").text()).toContain("Hacker News 搜索已就绪");
    expect(wrapper.get("[data-sources-section='hackernews']").text()).toContain("手动采集 Hacker News");
    expect(wrapper.get("[data-sources-section='bilibili']").text()).toContain("B 站搜索");
    expect(wrapper.get("[data-sources-section='bilibili']").text()).toContain("openai");
    expect(wrapper.get("[data-sources-section='bilibili']").text()).toContain("B 站搜索已就绪");
    expect(wrapper.get("[data-sources-section='bilibili']").text()).toContain("手动采集 B 站搜索");
    expect(wrapper.get("[data-sources-section='inventory']").classes()).toContain("editorial-glass-panel");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("已完成");
    expect(wrapper.get("[data-sources-section='inventory']").text()).not.toContain("选中时全量");
    expect(wrapper.get("[data-source-rss-link='openai']").attributes("href")).toBe("https://openai.com/news/rss.xml");
    expect(wrapper.get("[data-source-rss-link='openai']").attributes("title")).toBe("https://openai.com/news/rss.xml");
    expect(wrapper.get("[data-source-rss-link='openai']").classes()).toEqual(
      expect.arrayContaining(["inline-block", "truncate", "text-left"])
    );

    const analyticsHeaderCells = wrapper.get("[data-sources-section='analytics']").findAll("thead th");
    const inventoryHeaderCells = wrapper.get("[data-sources-section='inventory']").findAll("thead th");

    expect(analyticsHeaderCells.every((cell) => (cell.attributes("style") || "").includes("text-align: center"))).toBe(true);
    expect(inventoryHeaderCells.every((cell) => (cell.attributes("style") || "").includes("text-align: center"))).toBe(true);
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
    expect(wrapper.get("[data-sources-section='manual-collect']").text()).toContain("未启用定时采集");
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

  it("submits a wechat source from the simplified modal", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.createSource).mockResolvedValue({ ok: true, kind: "wechat_demo" });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-action='add-source']").trigger("click");
    await flushPromises();

    expect(document.body.querySelector(".ant-modal-root")).not.toBeNull();

    await getModalNode("[data-source-type='wechat_bridge']").trigger("click");
    await getModalNode("[data-source-form='wechat-name']").setValue("微信 Demo");
    await getModalNode("[data-source-form='article-url']").setValue("https://mp.weixin.qq.com/s?__biz=abc");
    await getModalNode("[data-source-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "wechat_bridge",
        wechatName: "微信 Demo",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
      })
    );
  });

  it("submits an rss source from the same create modal", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.createSource).mockResolvedValue({ ok: true, kind: "rss_demo" });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-action='add-source']").trigger("click");
    await flushPromises();
    expect(getModalNode("[data-source-modal-intro]").text()).toContain("这里只收用户输入");

    await getModalNode("[data-source-type='rss']").trigger("click");
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

  it("updates a custom wechat source with the existing modal", async () => {
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
    vi.mocked(settingsApi.updateSource).mockResolvedValue({ ok: true, kind: "wechat_demo" });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-source-edit='wechat_demo']").trigger("click");
    await flushPromises();

    await getModalNode("[data-source-form='wechat-name']").setValue("微信 Demo 新版");
    await getModalNode("[data-source-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.updateSource).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "wechat_demo",
        sourceType: "wechat_bridge",
        wechatName: "微信 Demo 新版",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
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
    expect(sourceCell.get("[data-source-badges='wechat_demo']").text()).toContain("公众号");
    expect(sourceCell.text()).not.toContain("编辑");
    expect(sourceCell.text()).not.toContain("删除");
    expect(actionsRow.text()).toContain("编辑");
    expect(actionsRow.text()).toContain("删除");
    expect(inventoryHeaderCells.at(-1)?.text()).toContain("操作");
  });

  it("disables wechat source creation when bridge capability is unavailable", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue({
      ...createSourcesModel(),
      capability: {
        wechatArticleUrlEnabled: false,
        wechatArticleUrlMessage: "当前未配置 bridge 服务；RSS 仍可直接新增，但公众号来源暂时不可用。"
      }
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-action='add-source']").trigger("click");
    await flushPromises();

    expect(getModalNode("[data-source-type='wechat_bridge']").attributes("disabled")).toBeDefined();
    expect(getModalNode("[data-source-wechat-capability]").text()).toContain("公众号来源暂时不可用");
    expect(findModalNode("[data-source-form='wechat-name']")).toBeNull();
    expect(findModalNode("[data-source-form='article-url']")).toBeNull();
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
});
