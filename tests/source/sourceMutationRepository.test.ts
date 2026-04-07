import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, insertTestContentItem, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { deleteSource, saveSource } from "../../src/core/source/sourceMutationRepository.js";

describe("sourceMutationRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("creates a bridge source from an existing feed url", async () => {
    const handle = await createTestDatabase("hot-now-feed-url-source-");
    handles.push(handle);

    const result = await saveSource(
      handle.db,
      {
        mode: "create",
        sourceType: "wechat_bridge",
        kind: "wechat_demo",
        name: "微信 Demo",
        siteUrl: "https://mp.weixin.qq.com/",
        bridgeKind: "wechat2rss",
        inputMode: "feed_url",
        feedUrl: "https://bridge.example.test/feed/demo.xml"
      },
      { wechatBridge: null }
    );

    expect(result).toEqual({ ok: true, kind: "wechat_demo" });
    expect(
      handle.db
        .prepare("SELECT source_type, rss_url, bridge_kind, bridge_config_json FROM content_sources WHERE kind = ?")
        .get("wechat_demo")
    ).toEqual({
      source_type: "wechat_bridge",
      rss_url: "https://bridge.example.test/feed/demo.xml",
      bridge_kind: "wechat2rss",
      bridge_config_json: JSON.stringify({
        inputMode: "feed_url",
        feedUrl: "https://bridge.example.test/feed/demo.xml"
      })
    });
  });

  it("creates a bridge source from an article url by calling addurl", async () => {
    const handle = await createTestDatabase("hot-now-article-url-source-");
    handles.push(handle);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ err: "", data: "https://bridge.example.test/feed/123.xml" }), { status: 200 })
    );

    const result = await saveSource(
      handle.db,
      {
        mode: "create",
        sourceType: "wechat_bridge",
        kind: "wechat_demo",
        name: "微信 Demo",
        siteUrl: "https://mp.weixin.qq.com/",
        bridgeKind: "wechat2rss",
        inputMode: "article_url",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
      },
      {
        wechatBridge: { baseUrl: "https://bridge.example.test", token: "secret-token" },
        fetch: fetchMock
      }
    );

    expect(result).toEqual({ ok: true, kind: "wechat_demo" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bridge.example.test/addurl?url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%3F__biz%3Dabc&k=secret-token"
    );
    expect(
      handle.db
        .prepare("SELECT rss_url, bridge_config_json FROM content_sources WHERE kind = ?")
        .get("wechat_demo")
    ).toEqual({
      rss_url: "https://bridge.example.test/feed/123.xml",
      bridge_config_json: JSON.stringify({
        inputMode: "article_url",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc",
        resolvedFrom: "wechat2rss"
      })
    });
  });

  it("rejects article-url mode when bridge env vars are missing", async () => {
    const handle = await createTestDatabase("hot-now-missing-bridge-config-");
    handles.push(handle);

    const result = await saveSource(
      handle.db,
      {
        mode: "create",
        sourceType: "wechat_bridge",
        kind: "wechat_demo",
        name: "微信 Demo",
        siteUrl: "https://mp.weixin.qq.com/",
        bridgeKind: "wechat2rss",
        inputMode: "article_url",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
      },
      { wechatBridge: null }
    );

    expect(result).toEqual({ ok: false, reason: "wechat-bridge-disabled" });
  });

  it("updates an existing custom source in place", async () => {
    const handle = await createTestDatabase("hot-now-update-custom-source-");
    handles.push(handle);

    await saveSource(
      handle.db,
      {
        mode: "create",
        sourceType: "rss",
        kind: "custom_demo",
        name: "自定义源",
        siteUrl: "https://example.com",
        rssUrl: "https://example.com/feed.xml",
        isEnabled: false,
        showAllWhenSelected: true
      },
      { wechatBridge: null }
    );

    const result = await saveSource(
      handle.db,
      {
        mode: "update",
        sourceType: "rss",
        kind: "custom_demo",
        name: "自定义源新名字",
        siteUrl: "https://example.com/home",
        rssUrl: "https://example.com/feed-2.xml"
      },
      { wechatBridge: null }
    );

    expect(result).toEqual({ ok: true, kind: "custom_demo" });
    expect(
      handle.db
        .prepare(
          "SELECT name, site_url, rss_url, is_enabled, show_all_when_selected FROM content_sources WHERE kind = ?"
        )
        .get("custom_demo")
    ).toEqual({
      name: "自定义源新名字",
      site_url: "https://example.com/home",
      rss_url: "https://example.com/feed-2.xml",
      is_enabled: 0,
      show_all_when_selected: 1
    });
  });

  it("rejects deleting built-in sources and sources with collected content", async () => {
    const handle = await createTestDatabase("hot-now-delete-source-");
    handles.push(handle);

    await saveSource(
      handle.db,
      {
        mode: "create",
        sourceType: "rss",
        kind: "custom_demo",
        name: "自定义源",
        siteUrl: "https://example.com",
        rssUrl: "https://example.com/feed.xml"
      },
      { wechatBridge: null }
    );
    insertTestContentItem(handle.db, {
      sourceKind: "custom_demo",
      canonicalUrl: "https://example.com/post-1"
    });

    expect(deleteSource(handle.db, "openai")).toEqual({ ok: false, reason: "built-in" });
    expect(deleteSource(handle.db, "custom_demo")).toEqual({ ok: false, reason: "in-use" });
  });
});
