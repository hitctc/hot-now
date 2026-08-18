import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import {
  createSourcesModel,
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
