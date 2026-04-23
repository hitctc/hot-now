import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { createTwitterAccount } from "../../src/core/twitter/twitterAccountRepository.js";
import { createTwitterSearchKeyword } from "../../src/core/twitter/twitterSearchKeywordRepository.js";
import { runTwitterAccountCollection } from "../../src/core/twitter/runTwitterAccountCollection.js";
import { runTwitterKeywordCollection } from "../../src/core/twitter/runTwitterKeywordCollection.js";

describe("runTwitterKeywordCollection", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("persists collected tweets and links keyword matches without duplicating existing twitter account content", async () => {
    const handle = await createTestDatabase("hot-now-twitter-keyword-manual-collect-");
    handles.push(handle);
    createTwitterAccount(handle.db, {
      username: "openai",
      displayName: "OpenAI"
    });
    createTwitterSearchKeyword(handle.db, {
      keyword: "OpenAI",
      category: "official_vendor",
      priority: 90
    });
    createTwitterSearchKeyword(handle.db, {
      keyword: "Agents",
      category: "topic",
      priority: 70
    });

    const accountFetchMock = vi.fn().mockResolvedValue(
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

    await runTwitterAccountCollection(handle.db, {
      apiKey: "test-key",
      fetch: accountFetchMock,
      now: new Date("2026-04-23T08:30:00.000Z"),
      fetchArticle: vi.fn(async (url: string) => ({
        ok: false,
        url,
        title: "",
        text: "",
        error: "twitter page skipped"
      }))
    });

    const searchFetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
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
              },
              {
                id: "tweet-2",
                text: "Agents SDK gets a new release",
                url: "https://x.com/openai/status/tweet-2",
                createdAt: "2026-04-23T09:00:00.000Z",
                likeCount: 88,
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tweets: [
              {
                id: "tweet-2",
                text: "Agents SDK gets a new release",
                url: "https://x.com/openai/status/tweet-2",
                createdAt: "2026-04-23T09:00:00.000Z",
                likeCount: 88,
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

    const result = await runTwitterKeywordCollection(handle.db, {
      apiKey: "test-key",
      fetch: searchFetchMock,
      now: new Date("2026-04-23T10:00:00.000Z"),
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
      action: "collect-twitter-keywords",
      enabledKeywordCount: 2,
      processedKeywordCount: 2,
      fetchedTweetCount: 3,
      persistedContentItemCount: 1,
      reusedContentItemCount: 1,
      failureCount: 0
    });

    const contentRows = handle.db
      .prepare(
        `
          SELECT cs.kind AS source_kind, ci.external_id, ci.canonical_url
          FROM content_items ci
          JOIN content_sources cs ON cs.id = ci.source_id
          WHERE ci.external_id LIKE 'twitter:%'
          ORDER BY ci.external_id ASC, ci.id ASC
        `
      )
      .all() as Array<{
      source_kind: string;
      external_id: string;
      canonical_url: string;
    }>;

    expect(contentRows).toEqual([
      {
        source_kind: "twitter_accounts",
        external_id: "twitter:tweet-1",
        canonical_url: "https://x.com/openai/status/tweet-1"
      },
      {
        source_kind: "twitter_keyword_search",
        external_id: "twitter:tweet-2",
        canonical_url: "https://x.com/openai/status/tweet-2"
      }
    ]);

    const matchRows = handle.db
      .prepare(
        `
          SELECT keyword.keyword, match.tweet_external_id, content.external_id AS content_external_id
          FROM twitter_search_keyword_matches match
          JOIN twitter_search_keywords keyword ON keyword.id = match.keyword_id
          JOIN content_items content ON content.id = match.content_item_id
          ORDER BY keyword.keyword ASC, match.tweet_external_id ASC
        `
      )
      .all() as Array<{
      keyword: string;
      tweet_external_id: string;
      content_external_id: string;
    }>;

    expect(matchRows).toEqual([
      {
        keyword: "Agents",
        tweet_external_id: "twitter:tweet-2",
        content_external_id: "twitter:tweet-2"
      },
      {
        keyword: "OpenAI",
        tweet_external_id: "twitter:tweet-1",
        content_external_id: "twitter:tweet-1"
      },
      {
        keyword: "OpenAI",
        tweet_external_id: "twitter:tweet-2",
        content_external_id: "twitter:tweet-2"
      }
    ]);
  });

  it("returns a readable reason when no enabled keyword or api key is available", async () => {
    const handle = await createTestDatabase("hot-now-twitter-keyword-manual-empty-");
    handles.push(handle);

    await expect(runTwitterKeywordCollection(handle.db, { apiKey: "test-key" })).resolves.toEqual({
      accepted: false,
      reason: "no-enabled-twitter-keywords"
    });

    createTwitterSearchKeyword(handle.db, {
      keyword: "OpenAI",
      isCollectEnabled: true
    });

    await expect(runTwitterKeywordCollection(handle.db, { apiKey: null })).resolves.toEqual({
      accepted: false,
      reason: "twitter-api-key-missing"
    });
  });
});
