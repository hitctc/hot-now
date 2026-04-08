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
        canTriggerManualCollect: true,
        canTriggerManualSendLatestEmail: true,
        isRunning: false
      },
      capability: {
        wechatArticleUrlEnabled: false,
        wechatArticleUrlMessage: "当前未配置 bridge 服务。"
      }
    });

    await readSettingsSources();

    expect(requestJson).toHaveBeenCalledWith("/api/settings/sources");
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
});
