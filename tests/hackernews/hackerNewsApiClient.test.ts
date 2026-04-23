import { describe, expect, it, vi } from "vitest";
import { searchHackerNewsStories } from "../../src/core/hackernews/hackerNewsApiClient.js";

describe("hackerNewsApiClient", () => {
  it("requests Algolia search with the expected query, story tag, lookback window, and hit limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          hits: [
            {
              objectID: "hn-1",
              title: "OpenAI ships something new",
              url: "https://example.com/openai",
              author: "dang",
              points: 123,
              num_comments: 45,
              created_at: "2026-04-20T08:00:00.000Z",
              story_text: "Launch notes"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const result = await searchHackerNewsStories({
      query: "OpenAI",
      now: new Date("2026-04-23T08:30:00.000Z"),
      fetch: fetchMock
    });

    expect(result).toMatchObject({
      ok: true,
      hits: [
        {
          objectId: "hn-1",
          title: "OpenAI ships something new",
          url: "https://example.com/openai",
          author: "dang",
          points: 123,
          numComments: 45,
          createdAt: "2026-04-20T08:00:00.000Z",
          storyText: "Launch notes"
        }
      ]
    });

    const requestUrl = fetchMock.mock.calls[0]?.[0];
    expect(requestUrl).toBeInstanceOf(URL);
    expect((requestUrl as URL).origin + (requestUrl as URL).pathname).toBe("https://hn.algolia.com/api/v1/search");
    expect((requestUrl as URL).searchParams.get("query")).toBe("OpenAI");
    expect((requestUrl as URL).searchParams.get("tags")).toBe("story");
    expect((requestUrl as URL).searchParams.get("hitsPerPage")).toBe("10");
    expect((requestUrl as URL).searchParams.get("numericFilters")).toBe("created_at_i>=1776328200");
  });

  it("falls back to created_at_i when created_at is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          hits: [
            {
              objectID: "hn-2",
              title: "Anthropic launch",
              created_at_i: 1776806400
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const result = await searchHackerNewsStories({
      query: "Anthropic",
      fetch: fetchMock
    });

    expect(result).toMatchObject({
      ok: true,
      hits: [
        {
          objectId: "hn-2",
          title: "Anthropic launch",
          createdAt: "2026-04-21T21:20:00.000Z"
        }
      ]
    });
  });

  it("returns clear error reasons for invalid payloads and failed responses", async () => {
    const invalidPayloadFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } })
    );
    const invalidPayload = await searchHackerNewsStories({
      query: "AI agents",
      fetch: invalidPayloadFetch
    });
    expect(invalidPayload).toEqual({
      ok: false,
      reason: "Hacker News search returned invalid payload"
    });

    const failedFetch = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    const failed = await searchHackerNewsStories({
      query: "AI agents",
      fetch: failedFetch
    });
    expect(failed).toEqual({
      ok: false,
      reason: "Hacker News search failed with 429"
    });
  });
});
