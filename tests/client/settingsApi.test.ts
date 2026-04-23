import { beforeEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();

vi.mock("../../src/client/services/http", () => ({
  requestJson
}));

describe("settingsApi", () => {
  beforeEach(() => {
    requestJson.mockReset();
    window.localStorage.clear();
  });

  it("reads the sources workbench without reusing the content-page source filter", async () => {
    const { writeStoredContentSourceKinds } = await import("../../src/client/services/contentApi");
    const { readSettingsSources } = await import("../../src/client/services/settingsApi");

    writeStoredContentSourceKinds([" openai ", "juya", "openai"]);
    requestJson.mockResolvedValue({
      sources: [],
      operations: {
        lastCollectionRunAt: null,
        lastSendLatestEmailAt: null,
        nextCollectionRunAt: null,
        canTriggerManualCollect: true,
        canTriggerManualTwitterCollect: true,
        canTriggerManualTwitterKeywordCollect: true,
        canTriggerManualHackerNewsCollect: true,
        canTriggerManualBilibiliCollect: true,
        canTriggerManualSendLatestEmail: true,
        isRunning: false
      },
      capability: {
        wechatArticleUrlEnabled: false,
        wechatArticleUrlMessage: "当前环境未启用公众号来源解析。",
        hackerNewsSearchEnabled: true,
        hackerNewsSearchMessage: "Hacker News 搜索已就绪，可维护 query 并手动采集。",
        bilibiliSearchEnabled: true,
        bilibiliSearchMessage: "B 站搜索已就绪，可维护 query 并手动采集。"
      }
    });

    await readSettingsSources();

    expect(requestJson).toHaveBeenCalledWith("/api/settings/sources");
  });

  it("reads the content filter workbench from the view-rules api", async () => {
    const { readSettingsViewRules } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({
      filterWorkbench: {
        aiRule: {
          ruleKey: "ai",
          displayName: "AI 新讯怎么排",
          summary: "现在 AI 新讯默认只看最近 24 小时。排序时主要看 AI 内容、AI 新讯重点来源、综合分，下面会把这些词的意思直接写清楚。",
          toggles: {
            enableTimeWindow: true,
            enableSourceViewBonus: true,
            enableAiKeywordWeight: true,
            enableHeatKeywordWeight: true,
            enableFreshnessWeight: true,
            enableScoreRanking: true
          },
          weights: {
            freshnessWeight: 0.1,
            sourceWeight: 0.1,
            completenessWeight: 0.15,
            aiWeight: 0.5,
            heatWeight: 0.15
          }
        },
        hotRule: {
          ruleKey: "hot",
          displayName: "AI 热点怎么排",
          summary: "现在 AI 热点不限制 24 小时。排序时主要看热点词、新内容、AI 热点重点来源、综合分，下面会把这些词的意思直接写清楚。",
          toggles: {
            enableTimeWindow: false,
            enableSourceViewBonus: true,
            enableAiKeywordWeight: true,
            enableHeatKeywordWeight: true,
            enableFreshnessWeight: true,
            enableScoreRanking: true
          },
          weights: {
            freshnessWeight: 0.35,
            sourceWeight: 0.1,
            completenessWeight: 0.1,
            aiWeight: 0.05,
            heatWeight: 0.4
          }
        }
      },
      providerSettings: [],
      providerCapability: {
        featureAvailable: false,
        hasMasterKey: true,
        message: "未使用"
      },
      feedbackPool: []
    });

    await readSettingsViewRules();

    expect(requestJson).toHaveBeenCalledWith("/api/settings/view-rules");
  });

  it("posts content filter toggle payloads to the dedicated save action", async () => {
    const { saveContentFilterRule } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ ok: true, ruleKey: "ai" });

    await saveContentFilterRule({
      ruleKey: "ai",
      toggles: {
        enableTimeWindow: false,
        enableSourceViewBonus: true,
        enableAiKeywordWeight: true,
        enableHeatKeywordWeight: false,
        enableFreshnessWeight: true,
        enableScoreRanking: true
      },
      weights: {
        freshnessWeight: 0.1,
        sourceWeight: 0.1,
        completenessWeight: 0.15,
        aiWeight: 0.5,
        heatWeight: 0.15
      }
    });

    expect(requestJson).toHaveBeenCalledWith("/actions/view-rules/content-filters", {
      method: "POST",
      body: JSON.stringify({
        ruleKey: "ai",
        toggles: {
          enableTimeWindow: false,
          enableSourceViewBonus: true,
          enableAiKeywordWeight: true,
          enableHeatKeywordWeight: false,
          enableFreshnessWeight: true,
          enableScoreRanking: true
        },
        weights: {
          freshnessWeight: 0.1,
          sourceWeight: 0.1,
          completenessWeight: 0.15,
          aiWeight: 0.5,
          heatWeight: 0.15
        }
      })
    });
  });

  it("posts create source payloads to the sources create action", async () => {
    const { createSource } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ ok: true, kind: "wechat_demo" });

    await createSource({
      sourceType: "wechat_bridge",
      wechatName: "微信 Demo",
      articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
    });

    expect(requestJson).toHaveBeenCalledWith("/actions/sources/create", {
      method: "POST",
      body: JSON.stringify({
        sourceType: "wechat_bridge",
        wechatName: "微信 Demo",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
      })
    });
  });

  it("posts update source payloads to the sources update action", async () => {
    const { updateSource } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ ok: true, kind: "wechat_demo" });

    await updateSource({
      sourceType: "rss",
      kind: "wechat_demo",
      rssUrl: "https://example.com/feed.xml"
    });

    expect(requestJson).toHaveBeenCalledWith("/actions/sources/update", {
      method: "POST",
      body: JSON.stringify({
        sourceType: "rss",
        kind: "wechat_demo",
        rssUrl: "https://example.com/feed.xml"
      })
    });
  });

  it("posts delete source payloads to the sources delete action", async () => {
    const { deleteSource } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ ok: true, kind: "wechat_demo" });

    await deleteSource("wechat_demo");

    expect(requestJson).toHaveBeenCalledWith("/actions/sources/delete", {
      method: "POST",
      body: JSON.stringify({ kind: "wechat_demo" })
    });
  });

  it("posts twitter account create payloads to the twitter account create action", async () => {
    const { createTwitterAccount } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ ok: true, account: { id: 1 } });

    await createTwitterAccount({
      username: "@OpenAI",
      displayName: "OpenAI",
      category: "official_vendor",
      priority: 90,
      includeReplies: false,
      notes: "official account"
    });

    expect(requestJson).toHaveBeenCalledWith("/actions/twitter-accounts/create", {
      method: "POST",
      body: JSON.stringify({
        username: "@OpenAI",
        displayName: "OpenAI",
        category: "official_vendor",
        priority: 90,
        includeReplies: false,
        notes: "official account"
      })
    });
  });

  it("posts twitter account update payloads to the twitter account update action", async () => {
    const { updateTwitterAccount } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ ok: true, account: { id: 1 } });

    await updateTwitterAccount({
      id: 1,
      username: "openai",
      displayName: "OpenAI News"
    });

    expect(requestJson).toHaveBeenCalledWith("/actions/twitter-accounts/update", {
      method: "POST",
      body: JSON.stringify({
        id: 1,
        username: "openai",
        displayName: "OpenAI News"
      })
    });
  });

  it("posts twitter account delete and toggle payloads to their actions", async () => {
    const { deleteTwitterAccount, toggleTwitterAccount } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ ok: true });

    await deleteTwitterAccount(1);
    await toggleTwitterAccount(1, false);

    expect(requestJson).toHaveBeenNthCalledWith(1, "/actions/twitter-accounts/delete", {
      method: "POST",
      body: JSON.stringify({ id: 1 })
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, "/actions/twitter-accounts/toggle", {
      method: "POST",
      body: JSON.stringify({ id: 1, enable: false })
    });
  });

  it("posts twitter keyword create and update payloads to their actions", async () => {
    const { createTwitterSearchKeyword, updateTwitterSearchKeyword } = await import(
      "../../src/client/services/settingsApi"
    );

    requestJson.mockResolvedValue({ ok: true, keyword: { id: 1 } });

    await createTwitterSearchKeyword({
      keyword: "OpenAI",
      category: "official_vendor",
      priority: 90,
      isCollectEnabled: true,
      isVisible: true,
      notes: "core keyword"
    });
    await updateTwitterSearchKeyword({
      id: 1,
      keyword: "OpenAI Agents",
      category: "topic"
    });

    expect(requestJson).toHaveBeenNthCalledWith(1, "/actions/twitter-keywords/create", {
      method: "POST",
      body: JSON.stringify({
        keyword: "OpenAI",
        category: "official_vendor",
        priority: 90,
        isCollectEnabled: true,
        isVisible: true,
        notes: "core keyword"
      })
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, "/actions/twitter-keywords/update", {
      method: "POST",
      body: JSON.stringify({
        id: 1,
        keyword: "OpenAI Agents",
        category: "topic"
      })
    });
  });

  it("posts twitter keyword delete and toggle payloads to their actions", async () => {
    const {
      deleteTwitterSearchKeyword,
      toggleTwitterSearchKeywordCollect,
      toggleTwitterSearchKeywordVisible
    } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ ok: true });

    await deleteTwitterSearchKeyword(1);
    await toggleTwitterSearchKeywordCollect(1, false);
    await toggleTwitterSearchKeywordVisible(1, true);

    expect(requestJson).toHaveBeenNthCalledWith(1, "/actions/twitter-keywords/delete", {
      method: "POST",
      body: JSON.stringify({ id: 1 })
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, "/actions/twitter-keywords/toggle-collect", {
      method: "POST",
      body: JSON.stringify({ id: 1, enable: false })
    });
    expect(requestJson).toHaveBeenNthCalledWith(3, "/actions/twitter-keywords/toggle-visible", {
      method: "POST",
      body: JSON.stringify({ id: 1, enable: true })
    });
  });

  it("posts hacker news query create update delete and toggle payloads to their actions", async () => {
    const {
      createHackerNewsQuery,
      updateHackerNewsQuery,
      deleteHackerNewsQuery,
      toggleHackerNewsQuery
    } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ ok: true, query: { id: 1 } });

    await createHackerNewsQuery({
      query: "OpenAI",
      priority: 90,
      isEnabled: true,
      notes: "core query"
    });
    await updateHackerNewsQuery({
      id: 1,
      query: "OpenAI agents"
    });
    await deleteHackerNewsQuery(1);
    await toggleHackerNewsQuery(1, false);

    expect(requestJson).toHaveBeenNthCalledWith(1, "/actions/hackernews/create", {
      method: "POST",
      body: JSON.stringify({
        query: "OpenAI",
        priority: 90,
        isEnabled: true,
        notes: "core query"
      })
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, "/actions/hackernews/update", {
      method: "POST",
      body: JSON.stringify({
        id: 1,
        query: "OpenAI agents"
      })
    });
    expect(requestJson).toHaveBeenNthCalledWith(3, "/actions/hackernews/delete", {
      method: "POST",
      body: JSON.stringify({ id: 1 })
    });
    expect(requestJson).toHaveBeenNthCalledWith(4, "/actions/hackernews/toggle", {
      method: "POST",
      body: JSON.stringify({ id: 1, enable: false })
    });
  });

  it("posts manual twitter collection to the dedicated twitter action", async () => {
    const { triggerManualTwitterCollect } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ accepted: true, action: "collect-twitter-accounts" });

    await triggerManualTwitterCollect();

    expect(requestJson).toHaveBeenCalledWith("/actions/twitter-accounts/collect", {
      method: "POST",
      body: JSON.stringify({})
    });
  });

  it("posts manual twitter keyword collection to the dedicated twitter action", async () => {
    const { triggerManualTwitterKeywordCollect } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ accepted: true, action: "collect-twitter-keywords" });

    await triggerManualTwitterKeywordCollect();

    expect(requestJson).toHaveBeenCalledWith("/actions/twitter-keywords/collect", {
      method: "POST",
      body: JSON.stringify({})
    });
  });

  it("posts manual hacker news collection to the dedicated action", async () => {
    const { triggerManualHackerNewsCollect } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ accepted: true, action: "collect-hackernews" });

    await triggerManualHackerNewsCollect();

    expect(requestJson).toHaveBeenCalledWith("/actions/hackernews/collect", {
      method: "POST",
      body: JSON.stringify({})
    });
  });

  it("posts bilibili query create update delete and toggle payloads to their actions", async () => {
    const {
      createBilibiliQuery,
      updateBilibiliQuery,
      deleteBilibiliQuery,
      toggleBilibiliQuery
    } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ ok: true, query: { id: 1 } });

    await createBilibiliQuery({
      query: "OpenAI",
      priority: 90,
      isEnabled: true,
      notes: "video query"
    });
    await updateBilibiliQuery({
      id: 1,
      query: "OpenAI agents"
    });
    await deleteBilibiliQuery(1);
    await toggleBilibiliQuery(1, false);

    expect(requestJson).toHaveBeenNthCalledWith(1, "/actions/bilibili/create", {
      method: "POST",
      body: JSON.stringify({
        query: "OpenAI",
        priority: 90,
        isEnabled: true,
        notes: "video query"
      })
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, "/actions/bilibili/update", {
      method: "POST",
      body: JSON.stringify({
        id: 1,
        query: "OpenAI agents"
      })
    });
    expect(requestJson).toHaveBeenNthCalledWith(3, "/actions/bilibili/delete", {
      method: "POST",
      body: JSON.stringify({ id: 1 })
    });
    expect(requestJson).toHaveBeenNthCalledWith(4, "/actions/bilibili/toggle", {
      method: "POST",
      body: JSON.stringify({ id: 1, enable: false })
    });
  });

  it("posts manual bilibili collection to the dedicated action", async () => {
    const { triggerManualBilibiliCollect } = await import("../../src/client/services/settingsApi");

    requestJson.mockResolvedValue({ accepted: true, action: "collect-bilibili" });

    await triggerManualBilibiliCollect();

    expect(requestJson).toHaveBeenCalledWith("/actions/bilibili/collect", {
      method: "POST",
      body: JSON.stringify({})
    });
  });
});
