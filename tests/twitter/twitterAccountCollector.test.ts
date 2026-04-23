import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { listSourceCards } from "../../src/core/source/listSourceCards.js";
import { collectTwitterAccountIssues } from "../../src/core/twitter/twitterAccountCollector.js";
import { createTwitterAccount } from "../../src/core/twitter/twitterAccountRepository.js";

describe("twitterAccountCollector", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("returns a degraded failure when api key is missing without blocking rss sources", async () => {
    const handle = await createTestDatabase("hot-now-twitter-collector-key-");
    handles.push(handle);
    createTwitterAccount(handle.db, { username: "openai" });

    await expect(collectTwitterAccountIssues(handle.db, { apiKey: null })).resolves.toMatchObject({
      length: 0,
      failures: [{ kind: "twitter_accounts", reason: "TWITTER_API_KEY is not configured" }]
    });
  });

  it("collects enabled accounts, maps tweets, stores account status, and hides the aggregate source from sources workbench", async () => {
    const handle = await createTestDatabase("hot-now-twitter-collector-");
    handles.push(handle);
    const created = createTwitterAccount(handle.db, {
      username: "@OpenAI",
      displayName: "OpenAI",
      category: "official_vendor"
    });
    expect(created.ok).toBe(true);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          tweets: [
            {
              id: "tweet-1",
              text: "OpenAI ships a new model for developers",
              url: "https://x.com/openai/status/tweet-1",
              createdAt: "2026-04-23T08:00:00.000Z",
              likeCount: 120,
              author: {
                id: "user-1",
                userName: "openai",
                name: "OpenAI",
                followers: 1000,
                isBlueVerified: true
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const issues = await collectTwitterAccountIssues(handle.db, {
      apiKey: "test-key",
      fetch: fetchMock,
      now: new Date("2026-04-23T08:30:00.000Z")
    });

    expect(issues).toHaveLength(1);
    expect(issues.failures).toEqual([]);
    expect(issues[0]).toMatchObject({
      date: "2026-04-23",
      issueUrl: "https://x.com/",
      sourceKind: "twitter_accounts",
      sourceType: "official",
      sourcePriority: 100
    });
    expect(issues[0].items[0]).toMatchObject({
      rank: 1,
      category: "official_vendor",
      title: "OpenAI ships a new model for developers",
      sourceUrl: "https://x.com/openai/status/tweet-1",
      sourceName: "Twitter / OpenAI",
      externalId: "twitter:tweet-1",
      publishedAt: "2026-04-23T08:00:00.000Z",
      summary: "OpenAI ships a new model for developers"
    });
    expect(JSON.parse(issues[0].items[0].metadataJson ?? "{}")).toMatchObject({
      collector: {
        kind: "twitter_account",
        username: "openai",
        priority: 90
      },
      metrics: {
        likeCount: 120
      },
      author: {
        id: "user-1",
        username: "openai"
      }
    });
    expect(
      handle.db
        .prepare("SELECT user_id, last_fetched_at, last_success_at, last_error FROM twitter_accounts WHERE username = ?")
        .get("openai")
    ).toEqual({
      user_id: "user-1",
      last_fetched_at: "2026-04-23T08:30:00.000Z",
      last_success_at: "2026-04-23T08:30:00.000Z",
      last_error: "本次抓取成功，获得 1 条可入库推文。"
    });
    expect(
      handle.db
        .prepare("SELECT show_all_when_selected FROM content_sources WHERE kind = 'twitter_accounts' LIMIT 1")
        .get()
    ).toEqual({ show_all_when_selected: 0 });
    expect(listSourceCards(handle.db).map((source) => source.kind)).not.toContain("twitter_accounts");
  });
});
