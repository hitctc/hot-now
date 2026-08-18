import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import {
  createSourcesModel,
  findModalNode,
  getModalNode,
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

});
