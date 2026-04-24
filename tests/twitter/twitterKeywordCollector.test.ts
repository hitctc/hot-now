import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { listSourceCards } from "../../src/core/source/listSourceCards.js";
import { collectTwitterKeywordIssues } from "../../src/core/twitter/twitterKeywordCollector.js";
import { createTwitterSearchKeyword } from "../../src/core/twitter/twitterSearchKeywordRepository.js";

describe("twitterKeywordCollector", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("returns a degraded failure when api key is missing without blocking rss sources", async () => {
    const handle = await createTestDatabase("hot-now-twitter-keyword-collector-key-");
    handles.push(handle);
    createTwitterSearchKeyword(handle.db, { keyword: "OpenAI" });

    await expect(collectTwitterKeywordIssues(handle.db, { apiKey: null })).resolves.toMatchObject({
      length: 0,
      failures: [{ kind: "twitter_keyword_search", reason: "TWITTER_API_KEY is not configured" }]
    });
  });

  it("collects enabled keywords, stores fetch status, and hides the aggregate source from sources workbench", async () => {
    const handle = await createTestDatabase("hot-now-twitter-keyword-collector-");
    handles.push(handle);
    const created = createTwitterSearchKeyword(handle.db, {
      keyword: "OpenAI",
      category: "official_vendor",
      priority: 95
    });
    expect(created.ok).toBe(true);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tweets: [
            {
              id: "tweet-1",
              text: "OpenAI 发布了新的 Agents 能力",
              url: "https://x.com/openai/status/tweet-1",
              createdAt: "2026-04-23T08:00:00.000Z",
              likeCount: 120,
              author: {
                id: "user-1",
                userName: "openai",
                name: "OpenAI"
              }
            },
            {
              id: "tweet-ja",
              text: "【ChatGPT image2のつづき】ためしにキャラを読み込ませてみると...",
              url: "https://x.com/hika_san3/status/tweet-ja",
              createdAt: "2026-04-23T08:10:00.000Z",
              likeCount: 66,
              author: {
                id: "user-ja",
                userName: "hika_san3",
                name: "ひかさん"
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const issues = await collectTwitterKeywordIssues(handle.db, {
      apiKey: "test-key",
      fetch: fetchMock,
      now: new Date("2026-04-23T08:30:00.000Z")
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining("/twitter/tweet/advanced_search?")
      }),
      expect.anything()
    );
    const requestUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(requestUrl.searchParams.get("query")).toBe(
      "OpenAI lang:zh since_time:1776673800 until_time:1776933000"
    );
    expect(issues).toHaveLength(1);
    expect(issues.failures).toEqual([]);
    expect(issues[0]).toMatchObject({
      date: "2026-04-23",
      issueUrl: "https://x.com/search",
      sourceKind: "twitter_keyword_search",
      sourceType: "official",
      sourcePriority: 95
    });
    expect(issues[0].items[0]).toMatchObject({
      rank: 1,
      category: "official_vendor",
      title: "OpenAI 发布了新的 Agents 能力",
      sourceUrl: "https://x.com/openai/status/tweet-1",
      sourceName: "Twitter 搜索 / OpenAI",
      externalId: "twitter:tweet-1",
      publishedAt: "2026-04-23T08:00:00.000Z",
      summary: "OpenAI 发布了新的 Agents 能力"
    });
    expect(issues[0].items.map((item) => item.externalId)).not.toContain("twitter:tweet-ja");
    expect(JSON.parse(issues[0].items[0].metadataJson ?? "{}")).toMatchObject({
      collector: {
        kind: "twitter_keyword_search",
        keyword: "OpenAI",
        priority: 95,
        searchQuery: "OpenAI lang:zh since_time:1776673800 until_time:1776933000"
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
        .prepare(
          "SELECT last_fetched_at, last_success_at, last_result FROM twitter_search_keywords WHERE keyword = ?"
        )
        .get("OpenAI")
    ).toEqual({
      last_fetched_at: "2026-04-23T08:30:00.000Z",
      last_success_at: "2026-04-23T08:30:00.000Z",
      last_result: "本次搜索成功，获得 1 条可入库推文。"
    });
    expect(
      handle.db
        .prepare("SELECT is_enabled, show_all_when_selected FROM content_sources WHERE kind = 'twitter_keyword_search' LIMIT 1")
        .get()
    ).toEqual({ is_enabled: 0, show_all_when_selected: 0 });
    expect(listSourceCards(handle.db).map((source) => source.kind)).not.toContain("twitter_keyword_search");
  });
});
