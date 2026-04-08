import { describe, expect, it, vi } from "vitest";

import { readFeedMetadata } from "../../src/core/source/readFeedMetadata.js";

describe("readFeedMetadata", () => {
  it("reads rss title and homepage from a valid feed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<?xml version="1.0"?>
         <rss version="2.0">
           <channel>
             <title>Example Feed</title>
             <link>https://example.com/</link>
           </channel>
         </rss>`,
        { status: 200, headers: { "content-type": "application/rss+xml" } }
      )
    );

    await expect(readFeedMetadata("https://example.com/feed.xml", fetchMock)).resolves.toEqual({
      title: "Example Feed",
      siteUrl: "https://example.com/"
    });
  });

  it("falls back to the feed origin when homepage is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<?xml version="1.0"?>
         <rss version="2.0">
           <channel>
             <title>Example Feed</title>
           </channel>
         </rss>`,
        { status: 200, headers: { "content-type": "application/rss+xml" } }
      )
    );

    await expect(readFeedMetadata("https://example.com/feed.xml", fetchMock)).resolves.toEqual({
      title: "Example Feed",
      siteUrl: "https://example.com/"
    });
  });

  it("rejects invalid feeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html>not-a-feed</html>", {
        status: 200,
        headers: { "content-type": "text/html" }
      })
    );

    await expect(readFeedMetadata("https://example.com/feed.xml", fetchMock)).rejects.toThrow(
      "invalid-rss-feed"
    );
  });
});
