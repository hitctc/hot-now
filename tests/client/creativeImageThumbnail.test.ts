import { describe, expect, it } from "vitest";

import { buildCreativeImageThumbnailUrl } from "../../src/client/utils/creativeImageThumbnail.js";

describe("buildCreativeImageThumbnailUrl", () => {
  it("adds the thumbnail variant to local and absolute stored image URLs", () => {
    const sameOriginUrl = `${window.location.origin}/api/creative/images/2026-07-31/cover.jpg`;
    expect(buildCreativeImageThumbnailUrl(
      "/api/creative/images/2026-07-31/cover.png"
    )).toBe(
      "/api/creative/images/2026-07-31/cover.png?variant=thumbnail"
    );
    expect(buildCreativeImageThumbnailUrl(sameOriginUrl)).toBe(`${sameOriginUrl}?variant=thumbnail`);
  });

  it("does not send external or malformed images through the thumbnail route", () => {
    expect(buildCreativeImageThumbnailUrl("https://example.com/cover.png")).toBeNull();
    expect(buildCreativeImageThumbnailUrl(
      "https://example.com/api/creative/images/2026-07-31/cover.png"
    )).toBeNull();
    expect(buildCreativeImageThumbnailUrl("not-a-url")).toBeNull();
    expect(buildCreativeImageThumbnailUrl(null)).toBeNull();
  });
});
