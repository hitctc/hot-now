import { describe, expect, it } from "vitest";
import { resolveContentSourceDetail } from "../../src/core/content/contentViewCardPresentation.js";

describe("resolveContentSourceDetail", () => {
  it("renders a Twitter author with name and username", () => {
    expect(resolveContentSourceDetail({ sourceKind: "twitter_accounts", sourceName: "Twitter 账号", metadataJson: JSON.stringify({ author: { name: "Sam Altman", username: "sama" } }) })).toEqual({ label: "作者", value: "Sam Altman @sama" });
  });

  it("renders a WeChat RSS collector title but hides a duplicate source name", () => {
    expect(resolveContentSourceDetail({ sourceKind: "wechat_rss", sourceName: "微信公众号 RSS", metadataJson: JSON.stringify({ collector: { displayName: "文章标题" } }) })).toEqual({ label: "来源标题", value: "文章标题" });
    expect(resolveContentSourceDetail({ sourceKind: "wechat_rss", sourceName: "微信公众号 RSS", metadataJson: JSON.stringify({ collector: { displayName: "微信公众号 RSS" } }) })).toBeNull();
  });

  it("degrades invalid metadata to an empty detail", () => {
    expect(resolveContentSourceDetail({ sourceKind: "twitter_accounts", sourceName: "Twitter 账号", metadataJson: "{" })).toBeNull();
  });
});
