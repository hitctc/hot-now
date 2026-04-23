import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, insertTestContentItem, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { createHackerNewsQuery } from "../../src/core/hackernews/hackerNewsQueryRepository.js";
import { runHackerNewsCollection } from "../../src/core/hackernews/runHackerNewsCollection.js";

describe("runHackerNewsCollection", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("returns a readable reason when no enabled HN query exists", async () => {
    const handle = await createTestDatabase("hot-now-hn-run-empty-");
    handles.push(handle);

    await expect(runHackerNewsCollection(handle.db)).resolves.toEqual({
      accepted: false,
      reason: "no-enabled-hackernews-queries"
    });
  });

  it("persists new HN content and reuses existing items while merging matched queries", async () => {
    const handle = await createTestDatabase("hot-now-hn-run-collect-");
    handles.push(handle);

    createHackerNewsQuery(handle.db, { query: "OpenAI", priority: 90 });
    createHackerNewsQuery(handle.db, { query: "Agents", priority: 80 });

    const existingContentId = insertTestContentItem(handle.db, {
      sourceKind: "hackernews_search",
      canonicalUrl: "https://example.com/openai",
      title: "OpenAI old title",
      summary: "existing summary"
    });
    handle.db
      .prepare("UPDATE content_items SET external_id = ?, metadata_json = ? WHERE id = ?")
      .run(
        "hackernews:hn-1",
        JSON.stringify({
          collector: { kind: "hackernews_search", query: "OpenAI" },
          matchedQueries: ["OpenAI"]
        }),
        existingContentId
      );

    const fetchMock = vi.fn(async (input: string | URL) => {
      const query = (input as URL).searchParams.get("query");

      if (query === "OpenAI") {
        return new Response(
          JSON.stringify({
            hits: [
              {
                objectID: "hn-1",
                title: "OpenAI launch",
                url: "https://example.com/openai",
                author: "pg"
              },
              {
                objectID: "hn-2",
                title: "Agents SDK release",
                url: "https://example.com/agents",
                author: "dang"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          hits: [
            {
              objectID: "hn-2",
              title: "Agents SDK release",
              url: "https://example.com/agents",
              author: "dang"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const result = await runHackerNewsCollection(handle.db, {
      fetch: fetchMock,
      now: new Date("2026-04-23T10:00:00.000Z")
    });

    expect(result).toEqual({
      accepted: true,
      action: "collect-hackernews",
      enabledQueryCount: 2,
      processedQueryCount: 2,
      fetchedHitCount: 3,
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
          WHERE ci.external_id LIKE 'hackernews:%'
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
        source_kind: "hackernews_search",
        external_id: "hackernews:hn-1",
        canonical_url: "https://example.com/openai",
        title: "OpenAI old title"
      },
      {
        source_kind: "hackernews_search",
        external_id: "hackernews:hn-2",
        canonical_url: "https://example.com/agents",
        title: "Agents SDK release"
      }
    ]);

    expect(JSON.parse(rows[0].metadata_json ?? "{}")).toMatchObject({
      matchedQueries: ["OpenAI"]
    });
    expect(JSON.parse(rows[1].metadata_json ?? "{}")).toMatchObject({
      matchedQueries: ["OpenAI", "Agents"],
      collector: {
        kind: "hackernews_search"
      }
    });
  });
});
