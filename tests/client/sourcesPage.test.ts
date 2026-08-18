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
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("AI 时间线 feed 摘要");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("04-24 18:00");
    expect(wrapper.get("[data-sources-section='ai-timeline']").find("[data-ai-timeline-admin-events]").exists()).toBe(false);
    expect(wrapper.find("[data-action='open-ai-timeline-admin']").exists()).toBe(false);
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
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("外部 Markdown feed 驱动");
    expect(wrapper.get("[data-sources-section='ai-timeline']").text()).toContain("now.achuan.cc/feeds/ai-timeline-feed.md");
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

});
