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
    triggerManualCollect: vi.fn(),
    triggerManualSendLatestEmail: vi.fn()
  };
});

const mountedWrappers: VueWrapper[] = [];

function mountSourcesPage() {
  const wrapper = mountWithApp(SourcesPage, {
    global: {
      stubs: {
        teleport: false
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
    operations: {
      lastCollectionRunAt: "2026-03-31T08:10:00.000Z",
      lastSendLatestEmailAt: "2026-03-31T08:30:00.000Z",
      canTriggerManualCollect: true,
      canTriggerManualSendLatestEmail: true,
      isRunning: false
    },
    capability: {
      wechatArticleUrlEnabled: true,
      wechatArticleUrlMessage: "当前已配置 bridge 服务，可直接粘贴公众号文章链接自动生成 feed。"
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
        getPropertyValue: vi.fn().mockReturnValue("0px")
      })
    });
  });

  afterEach(() => {
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("renders operation cards and source tables from the api model", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());

    const wrapper = mountSourcesPage();

    await flushPromises();

    expect(wrapper.find("[data-settings-intro='sources']").exists()).toBe(false);
    expect(wrapper.get("[data-sources-section='overview']").findAll("article")).toHaveLength(4);
    expect(wrapper.get("[data-sources-section='overview']").text()).toContain("接入来源");
    expect(wrapper.get("[data-sources-section='overview']").text()).toContain("已启用来源");
    expect(wrapper.get("[data-sources-section='manual-collect']").text()).toContain("手动执行采集");
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
    expect(wrapper.get("[data-sources-section='inventory']").classes()).toContain("bg-editorial-panel");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("已完成");
    expect(wrapper.get("[data-sources-section='inventory']").text()).not.toContain("选中时全量");

    const analyticsHeaderCells = wrapper.get("[data-sources-section='analytics']").findAll("thead th");
    const inventoryHeaderCells = wrapper.get("[data-sources-section='inventory']").findAll("thead th");

    expect(analyticsHeaderCells.every((cell) => (cell.attributes("style") || "").includes("text-align: center"))).toBe(true);
    expect(inventoryHeaderCells.every((cell) => (cell.attributes("style") || "").includes("text-align: center"))).toBe(true);
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

  it("submits a wechat bridge source from article-url mode", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.createSource).mockResolvedValue({ ok: true, kind: "wechat_demo" });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-action='add-source']").trigger("click");
    await flushPromises();

    expect(document.body.querySelector(".ant-modal-root")).not.toBeNull();

    await getModalNode("[data-source-type='wechat_bridge']").trigger("click");
    await getModalNode("[data-bridge-input-mode='article_url']").trigger("click");
    await getModalNode("[data-source-form='kind']").setValue("wechat_demo");
    await getModalNode("[data-source-form='name']").setValue("微信 Demo");
    await getModalNode("[data-source-form='site-url']").setValue("https://mp.weixin.qq.com/");
    await getModalNode("[data-source-form='article-url']").setValue("https://mp.weixin.qq.com/s?__biz=abc");
    await getModalNode("[data-source-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "wechat_bridge",
        inputMode: "article_url",
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

    await getModalNode("[data-source-type='rss']").trigger("click");
    await getModalNode("[data-source-form='kind']").setValue("rss_demo");
    await getModalNode("[data-source-form='name']").setValue("RSS Demo");
    await getModalNode("[data-source-form='site-url']").setValue("https://example.com");
    await getModalNode("[data-source-form='rss-url']").setValue("https://example.com/feed.xml");
    await getModalNode("[data-source-form='submit']").trigger("click");
    await flushPromises();

    expect(getModalNode("[data-source-modal-intro]").text()).toContain("新增来源统一在这一个弹窗里完成");
    expect(settingsApi.createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "rss",
        kind: "rss_demo",
        rssUrl: "https://example.com/feed.xml"
      })
    );
  });

  it("submits a wechat bridge source from feed-url mode", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.mocked(settingsApi.createSource).mockResolvedValue({ ok: true, kind: "wechat_demo" });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-action='add-source']").trigger("click");
    await flushPromises();

    await getModalNode("[data-source-type='wechat_bridge']").trigger("click");
    await getModalNode("[data-bridge-input-mode='feed_url']").trigger("click");
    await getModalNode("[data-source-form='kind']").setValue("wechat_demo");
    await getModalNode("[data-source-form='name']").setValue("微信 Demo");
    await getModalNode("[data-source-form='site-url']").setValue("https://mp.weixin.qq.com/");
    await getModalNode("[data-source-form='feed-url']").setValue("https://bridge.example.test/feed/demo.xml");
    await getModalNode("[data-source-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "wechat_bridge",
        inputMode: "feed_url",
        feedUrl: "https://bridge.example.test/feed/demo.xml"
      })
    );
  });

  it("updates a custom bridge source with the existing modal", async () => {
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
          bridgeKind: "wechat2rss",
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

    await getModalNode("[data-source-form='name']").setValue("微信 Demo 新版");
    await getModalNode("[data-source-form='submit']").trigger("click");
    await flushPromises();

    expect(settingsApi.updateSource).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "wechat_demo",
        name: "微信 Demo 新版",
        sourceType: "wechat_bridge",
        inputMode: "article_url"
      })
    );
  });

  it("falls back to feed-url mode and disables article-url mode when bridge capability is unavailable", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue({
      ...createSourcesModel(),
      capability: {
        wechatArticleUrlEnabled: false,
        wechatArticleUrlMessage: "当前未配置 bridge 服务；你仍可新增 RSS 或填写现成 feed URL，但“公众号文章链接”模式暂不可用。"
      }
    });

    const wrapper = mountSourcesPage();
    await flushPromises();

    await wrapper.get("[data-action='add-source']").trigger("click");
    await flushPromises();

    await getModalNode("[data-source-type='wechat_bridge']").trigger("click");
    await flushPromises();

    expect(getModalNode("[data-source-wechat-capability]").text()).toContain("公众号文章链接");
    expect(getModalNode("[data-bridge-input-mode='article_url']").attributes("disabled")).toBeDefined();
    expect(findModalNode("[data-source-form='feed-url']")?.exists()).toBe(true);
    expect(findModalNode("[data-source-form='article-url']")).toBeNull();
  });

  it("deletes a custom source and refreshes the latest model", async () => {
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
            bridgeKind: "wechat2rss",
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
    await flushPromises();

    expect(settingsApi.deleteSource).toHaveBeenCalledWith("wechat_demo");
    expect(settingsApi.readSettingsSources).toHaveBeenCalledTimes(2);
  });
});
