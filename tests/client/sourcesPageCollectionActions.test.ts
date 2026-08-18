import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import {
  createMockMessageHandle,
  createSourcesModel,
  message,
  mountSourcesPage,
  settingsApi,
  setupSourcesPageTestHooks
} from "./sourcesPageTestSupport";

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

setupSourcesPageTestHooks();

describe("SourcesPage", () => {
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

});
