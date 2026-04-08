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

  it("creates a wechat source from relay-backed name lookup", async () => {
    const handle = await createTestDatabase("hot-now-feed-url-source-");
    handles.push(handle);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            rssUrl: "https://resolver.example.test/feed/demo.xml",
            resolvedName: "微信 Demo",
            siteUrl: "https://mp.weixin.qq.com/",
            resolverSummary: "resolved-via:name-lookup"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const result = await saveSource(
      handle.db,
      {
        mode: "create",
        sourceType: "wechat_bridge",
        wechatName: "微信 Demo"
      },
      {
        wechatResolver: { baseUrl: "https://resolver.example.test", token: "resolver-secret" },
        fetch: fetchMock
      }
    );

    expect(result).toEqual({ ok: true, kind: "wechat_demo" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://resolver.example.test/wechat/resolve-source",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer resolver-secret"
        }),
        body: JSON.stringify({ wechatName: "微信 Demo" })
      })
    );
    expect(
      handle.db
        .prepare("SELECT source_type, rss_url, bridge_kind, bridge_config_json FROM content_sources WHERE kind = ?")
        .get("wechat_demo")
    ).toEqual({
      source_type: "wechat_bridge",
      rss_url: "https://resolver.example.test/feed/demo.xml",
      bridge_kind: "resolver",
      bridge_config_json: JSON.stringify({
        inputMode: "name_lookup",
        wechatName: "微信 Demo",
        resolvedFrom: "resolved-via:name-lookup"
      })
    });
  });

  it("creates a wechat source from an article url via relay", async () => {
    const handle = await createTestDatabase("hot-now-article-url-source-");
    handles.push(handle);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          rssUrl: "https://resolver.example.test/feed/123.xml",
          resolvedName: "微信 Demo",
          siteUrl: "https://mp.weixin.qq.com/",
          resolverSummary: "resolved-via:article-url"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const result = await saveSource(
      handle.db,
      {
        mode: "create",
        sourceType: "wechat_bridge",
        wechatName: "微信 Demo",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
      },
      {
        wechatResolver: { baseUrl: "https://resolver.example.test", token: "resolver-secret" },
        fetch: fetchMock
      }
    );

    expect(result).toEqual({ ok: true, kind: "wechat_demo" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://resolver.example.test/wechat/resolve-source",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer resolver-secret"
        }),
        body: JSON.stringify({
          wechatName: "微信 Demo",
          articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
        })
      })
    );
    expect(
      handle.db
        .prepare("SELECT rss_url, bridge_kind, bridge_config_json FROM content_sources WHERE kind = ?")
        .get("wechat_demo")
    ).toEqual({
      rss_url: "https://resolver.example.test/feed/123.xml",
      bridge_kind: "resolver",
      bridge_config_json: JSON.stringify({
        inputMode: "article_url",
        wechatName: "微信 Demo",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc",
        resolvedFrom: "resolved-via:article-url"
      })
    });
  });

  it("rejects wechat source saves when resolver env vars are missing", async () => {
    const handle = await createTestDatabase("hot-now-missing-bridge-config-");
    handles.push(handle);

    const result = await saveSource(
      handle.db,
      {
        mode: "create",
        sourceType: "wechat_bridge",
        wechatName: "微信 Demo",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
      },
      { wechatResolver: null }
    );

    expect(result).toEqual({ ok: false, reason: "wechat-resolver-disabled" });
  });

  it("updates an existing custom source in place", async () => {
    const handle = await createTestDatabase("hot-now-update-custom-source-");
    handles.push(handle);

    await saveSource(
      handle.db,
      {
        mode: "create",
        sourceType: "rss",
        rssUrl: "https://example.com/feed.xml",
        isEnabled: false,
        showAllWhenSelected: true
      },
      {
        wechatResolver: null,
        fetch: vi.fn().mockResolvedValue(
          new Response(
            `<?xml version="1.0" encoding="UTF-8"?>
            <rss version="2.0">
              <channel>
                <title>Custom Demo</title>
                <link>https://example.com/home</link>
              </channel>
            </rss>`,
            { status: 200 }
          )
        )
      }
    );

    const result = await saveSource(
      handle.db,
      {
        mode: "update",
        sourceType: "rss",
        kind: "custom_demo",
        rssUrl: "https://example.com/feed-2.xml"
      },
      {
        wechatResolver: null,
        fetch: vi.fn().mockResolvedValue(
          new Response(
            `<?xml version="1.0" encoding="UTF-8"?>
            <rss version="2.0">
              <channel>
                <title>Custom Demo Updated</title>
                <link>https://example.com/home</link>
              </channel>
            </rss>`,
            { status: 200 }
          )
        )
      }
    );

    expect(result).toEqual({ ok: true, kind: "custom_demo" });
    expect(
      handle.db
        .prepare(
          "SELECT name, site_url, rss_url, is_enabled, show_all_when_selected FROM content_sources WHERE kind = ?"
        )
        .get("custom_demo")
    ).toEqual({
      name: "Custom Demo Updated",
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
        rssUrl: "https://example.com/feed.xml"
      },
      {
        wechatResolver: null,
        fetch: vi.fn().mockResolvedValue(
          new Response(
            `<?xml version="1.0" encoding="UTF-8"?>
            <rss version="2.0">
              <channel>
                <title>Custom Demo</title>
                <link>https://example.com</link>
              </channel>
            </rss>`,
            { status: 200 }
          )
        )
      }
    );
    insertTestContentItem(handle.db, {
      sourceKind: "custom_demo",
      canonicalUrl: "https://example.com/post-1"
    });

    expect(deleteSource(handle.db, "openai")).toEqual({ ok: false, reason: "built-in" });
    expect(deleteSource(handle.db, "custom_demo")).toEqual({ ok: false, reason: "in-use" });
  });
});
