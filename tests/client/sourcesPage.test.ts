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
      nextCollectionRunAt: "2026-03-31T10:40:00.000Z",
      canTriggerManualCollect: true,
      canTriggerManualSendLatestEmail: true,
      isRunning: false
    },
    capability: {
      wechatArticleUrlEnabled: true,
      wechatArticleUrlMessage: "公众号来源已开启，可直接填写公众号名称，或补一篇文章链接帮助系统更快定位来源。"
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
    vi.useRealTimers();
  });

  it("renders operation cards and source tables from the api model", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T10:34:00.000Z"));

    const wrapper = mountSourcesPage();

    await flushPromises();

    expect(wrapper.find("[data-settings-intro='sources']").exists()).toBe(false);
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
    expect(wrapper.get("[data-sources-section='inventory']").classes()).toContain("bg-editorial-panel");
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

    await getModalNode("[data-source-type='rss']").trigger("click");
    await getModalNode("[data-source-form='rss-url']").setValue("https://example.com/feed.xml");
    await getModalNode("[data-source-form='submit']").trigger("click");
    await flushPromises();

    expect(getModalNode("[data-source-modal-intro]").text()).toContain("这里只收用户输入");
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
});
