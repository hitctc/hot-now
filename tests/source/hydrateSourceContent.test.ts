import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { hydrateSourceContent } from "../../src/core/source/hydrateSourceContent.js";

describe("hydrateSourceContent", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("hydrates one custom source into content_items and triggers incremental evaluation", async () => {
    const handle = await createTestDatabase("hot-now-hydrate-source-");
    handles.push(handle);

    handle.db.prepare(
      `
        INSERT INTO content_sources (
          kind,
          name,
          site_url,
          rss_url,
          is_enabled,
          is_builtin,
          show_all_when_selected,
          source_type
        )
        VALUES (?, ?, ?, ?, 1, 0, 0, 'rss')
      `
    ).run(
      "custom_demo",
      "Custom Demo",
      "https://example.com",
      "https://example.com/feed.xml"
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue(`<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Custom Demo</title>
            <link>https://example.com/</link>
            <item>
              <title>Feed title</title>
              <link>https://example.com/post-1</link>
              <guid isPermaLink="false">demo-1</guid>
              <pubDate>Tue, 08 Apr 2026 08:00:00 GMT</pubDate>
              <description><![CDATA[<p>Feed summary</p>]]></description>
            </item>
          </channel>
        </rss>`)
    }));

    const runNlEvaluationCycle = vi.fn().mockResolvedValue(undefined);

    const result = await hydrateSourceContent(handle.db, "custom_demo", {
      fetchArticle: vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/post-1",
        title: "Resolved article title",
        text: "resolved article body"
      }),
      runNlEvaluationCycle
    });

    expect(result.itemCount).toBe(1);
    expect(result.contentItemIds.length).toBe(1);
    expect(
      handle.db
        .prepare("SELECT title, canonical_url, body_markdown, fetched_at FROM content_items WHERE source_id = (SELECT id FROM content_sources WHERE kind = 'custom_demo') LIMIT 1")
        .get()
    ).toEqual(
      expect.objectContaining({
        title: "Resolved article title",
        canonical_url: "https://example.com/post-1",
        body_markdown: "resolved article body"
      })
    );
    expect(runNlEvaluationCycle).toHaveBeenCalledWith({
      mode: "incremental-after-collect",
      contentItemIds: result.contentItemIds
    });
  });
});
