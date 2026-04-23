import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, insertTestContentItem, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { createBilibiliQuery } from "../../src/core/bilibili/bilibiliQueryRepository.js";
import { runBilibiliCollection } from "../../src/core/bilibili/runBilibiliCollection.js";

describe("runBilibiliCollection", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("returns a readable reason when no enabled bilibili query exists", async () => {
    const handle = await createTestDatabase("hot-now-bili-run-empty-");
    handles.push(handle);

    await expect(runBilibiliCollection(handle.db)).resolves.toEqual({
      accepted: false,
      reason: "no-enabled-bilibili-queries"
    });
  });

  it("persists new bilibili content and reuses existing items while merging matched queries", async () => {
    const handle = await createTestDatabase("hot-now-bili-run-collect-");
    handles.push(handle);

    createBilibiliQuery(handle.db, { query: "OpenAI", priority: 90 });
    createBilibiliQuery(handle.db, { query: "Agents", priority: 80 });

    const existingContentId = insertTestContentItem(handle.db, {
      sourceKind: "bilibili_search",
      canonicalUrl: "https://www.bilibili.com/video/BV1",
      title: "OpenAI old title",
      summary: "existing summary"
    });
    handle.db
      .prepare("UPDATE content_items SET external_id = ?, metadata_json = ? WHERE id = ?")
      .run(
        "bilibili:BV1",
        JSON.stringify({
          collector: { kind: "bilibili_search", query: "OpenAI" },
          matchedQueries: ["OpenAI"]
        }),
        existingContentId
      );

    const fetchMock = vi.fn(async (input: string | URL) => {
      const query = (input as URL).searchParams.get("keyword");

      if (query === "OpenAI") {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              result: [
                {
                  bvid: "BV1",
                  title: "OpenAI launch",
                  arcurl: "https://www.bilibili.com/video/BV1",
                  author: "AI Daily"
                },
                {
                  bvid: "BV2",
                  title: "Agents SDK release",
                  arcurl: "https://www.bilibili.com/video/BV2",
                  author: "AI Daily"
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            result: [
              {
                bvid: "BV2",
                title: "Agents SDK release",
                arcurl: "https://www.bilibili.com/video/BV2",
                author: "AI Daily"
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const result = await runBilibiliCollection(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-23T10:00:00.000Z")
    });

    expect(result).toEqual({
      accepted: true,
      action: "collect-bilibili",
      enabledQueryCount: 2,
      processedQueryCount: 2,
      fetchedVideoCount: 3,
      persistedContentItemCount: 1,
      reusedContentItemCount: 1,
      failureCount: 0
    });

    const rows = handle.db
      .prepare(
        `
          SELECT cs.kind AS source_kind, ci.external_id, ci.canonical_url, ci.title, ci.metadata_json
          FROM content_items ci
          JOIN content_sources cs ON cs.id = ci.source_id
          WHERE ci.external_id LIKE 'bilibili:%'
          ORDER BY ci.external_id ASC
        `
      )
      .all() as Array<{
      source_kind: string;
      external_id: string;
      canonical_url: string;
      title: string;
      metadata_json: string | null;
    }>;

    expect(rows.map((row) => ({
      source_kind: row.source_kind,
      external_id: row.external_id,
      canonical_url: row.canonical_url,
      title: row.title
    }))).toEqual([
      {
        source_kind: "bilibili_search",
        external_id: "bilibili:BV1",
        canonical_url: "https://www.bilibili.com/video/BV1",
        title: "OpenAI old title"
      },
      {
        source_kind: "bilibili_search",
        external_id: "bilibili:BV2",
        canonical_url: "https://www.bilibili.com/video/BV2",
        title: "Agents SDK release"
      }
    ]);

    expect(JSON.parse(rows[0].metadata_json ?? "{}")).toMatchObject({
      matchedQueries: ["OpenAI"]
    });
    expect(JSON.parse(rows[1].metadata_json ?? "{}")).toMatchObject({
      matchedQueries: ["OpenAI", "Agents"],
      collector: {
        kind: "bilibili_search"
      }
    });
  });
});
