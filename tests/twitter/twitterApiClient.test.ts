import { describe, expect, it, vi } from "vitest";
import { fetchAdvancedSearchTweets, fetchUserLastTweets } from "../../src/core/twitter/twitterApiClient.js";

describe("twitterApiClient", () => {
  it("requests user last tweets with api key and normalizes tweet payloads", async () => {
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
              retweetCount: 12,
              author: {
                id: "user-1",
                userName: "openai",
                name: "OpenAI",
                followers: 1000,
                isBlueVerified: true
              }
            }
          ],
          has_next_page: true,
          next_cursor: "cursor-2"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const result = await fetchUserLastTweets({
      apiKey: "test-key",
      userName: "openai",
      includeReplies: true,
      fetch: fetchMock
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://api.twitterapi.io/twitter/user/last_tweets?userName=openai&includeReplies=true"
      }),
      expect.objectContaining({
        headers: {
          "X-API-Key": "test-key"
        }
      })
    );
    expect(result).toEqual({
      ok: true,
      tweets: [
        {
          id: "tweet-1",
          text: "OpenAI ships a new model",
          url: "https://x.com/openai/status/tweet-1",
          createdAt: "2026-04-23T08:00:00.000Z",
          author: {
            id: "user-1",
            username: "openai",
            name: "OpenAI",
            followers: 1000,
            verified: true
          },
          metrics: {
            likeCount: 120,
            retweetCount: 12
          }
        }
      ],
      hasNextPage: true,
      nextCursor: "cursor-2"
    });
  });

  it("returns a safe error when twitterapi reports failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "error", message: "invalid user" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(
      fetchUserLastTweets({
        apiKey: "test-key",
        userId: "123",
        fetch: fetchMock
      })
    ).resolves.toEqual({ ok: false, reason: "invalid user" });
  });

  it("requests advanced search with the query payload and normalizes tweet payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tweets: [
            {
              id: "tweet-2",
              text: "OpenAI 发布了新的 Agents 能力",
              url: "https://x.com/openai/status/tweet-2",
              createdAt: "2026-04-23T09:00:00.000Z",
              likeCount: 88,
              author: {
                id: "user-1",
                userName: "openai",
                name: "OpenAI"
              }
            }
          ],
          has_next_page: false,
          next_cursor: null
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const result = await fetchAdvancedSearchTweets({
      apiKey: "test-key",
      query: "OpenAI since_time:1776045662 until_time:1776081762",
      queryType: "Latest",
      fetch: fetchMock
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://api.twitterapi.io/twitter/tweet/advanced_search?query=OpenAI+since_time%3A1776045662+until_time%3A1776081762&queryType=Latest"
      }),
      expect.objectContaining({
        headers: {
          "X-API-Key": "test-key"
        }
      })
    );
    expect(result).toEqual({
      ok: true,
      tweets: [
        {
          id: "tweet-2",
          text: "OpenAI 发布了新的 Agents 能力",
          url: "https://x.com/openai/status/tweet-2",
          createdAt: "2026-04-23T09:00:00.000Z",
          author: {
            id: "user-1",
            username: "openai",
            name: "OpenAI",
            followers: null,
            verified: null
          },
          metrics: {
            likeCount: 88
          }
        }
      ],
      hasNextPage: false,
      nextCursor: null
    });
  });
});
