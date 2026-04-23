import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { createTwitterAccount } from "../../src/core/twitter/twitterAccountRepository.js";
import { runTwitterAccountCollection } from "../../src/core/twitter/runTwitterAccountCollection.js";

describe("runTwitterAccountCollection", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("persists collected tweets into content_items without touching the default collection report flow", async () => {
    const handle = await createTestDatabase("hot-now-twitter-manual-collect-");
    handles.push(handle);
    createTwitterAccount(handle.db, {
      username: "openai",
      displayName: "OpenAI"
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          tweets: [
            {
              id: "tweet-1",
              text: "OpenAI ships a new model",
              url: "https://x.com/openai/status/tweet-1",
              createdAt: "2026-04-23T08:00:00.000Z",
              likeCount: 120,
              author: {
                id: "user-1",
                userName: "openai",
                name: "OpenAI"
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const result = await runTwitterAccountCollection(handle.db, {
      apiKey: "test-key",
      fetch: fetchMock,
      now: new Date("2026-04-23T08:30:00.000Z"),
      fetchArticle: vi.fn(async (url: string) => ({
        ok: false,
        url,
        title: "",
        text: "",
        error: "twitter page skipped"
      }))
    });

    expect(result).toEqual({
      accepted: true,
      action: "collect-twitter-accounts",
      enabledAccountCount: 1,
      fetchedTweetCount: 1,
      persistedContentItemCount: 1,
      failureCount: 0
    });

    const row = handle.db
      .prepare(
        `
          SELECT cs.kind AS source_kind, ci.external_id, ci.canonical_url, ci.summary, ci.metadata_json
          FROM content_items ci
          JOIN content_sources cs ON cs.id = ci.source_id
          WHERE ci.external_id = 'twitter:tweet-1'
          LIMIT 1
        `
      )
      .get() as {
      source_kind: string;
      external_id: string;
      canonical_url: string;
      summary: string;
      metadata_json: string;
    };

    expect(row.source_kind).toBe("twitter_accounts");
    expect(row.external_id).toBe("twitter:tweet-1");
    expect(row.canonical_url).toBe("https://x.com/openai/status/tweet-1");
    expect(row.summary).toBe("OpenAI ships a new model");
    expect(JSON.parse(row.metadata_json)).toMatchObject({
      collector: {
        kind: "twitter_account",
        username: "openai"
      },
      metrics: {
        likeCount: 120
      }
    });
  });

  it("returns a readable reason when no enabled account or api key is available", async () => {
    const handle = await createTestDatabase("hot-now-twitter-manual-empty-");
    handles.push(handle);

    await expect(runTwitterAccountCollection(handle.db, { apiKey: "test-key" })).resolves.toEqual({
      accepted: false,
      reason: "no-enabled-twitter-accounts"
    });

    createTwitterAccount(handle.db, {
      username: "openai",
      isEnabled: true
    });

    await expect(runTwitterAccountCollection(handle.db, { apiKey: null })).resolves.toEqual({
      accepted: false,
      reason: "twitter-api-key-missing"
    });
  });
});
