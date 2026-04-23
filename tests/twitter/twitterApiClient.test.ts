import { describe, expect, it, vi } from "vitest";
import { fetchUserLastTweets } from "../../src/core/twitter/twitterApiClient.js";

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
});
