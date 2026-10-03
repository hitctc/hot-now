import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readSiteCss, SITE_CSS_FRAGMENTS } from "../../src/server/routes/sitePageAssetHelpers.js";

describe("legacy stylesheet compatibility", () => {
  it("keeps the pre-refactor response bytes and cascade order", () => {
    const css = readSiteCss();
    expect(createHash("sha256").update(css).digest("hex")).toBe("57bb91d6157863a25668c703aa68ba8a7dd14e09330121cd2065888459795c69");
    expect(css).not.toContain("@import");
    expect(SITE_CSS_FRAGMENTS).toHaveLength(6);
  });
});
