import { describe, expect, it } from "vitest";
import {
  buildInlinePromptSource,
  planInlineImagePlaceholders,
} from "../../src/core/creative/inlineImagePromptPlanner.js";

describe("planInlineImagePlaceholders", () => {
  it("adds at most four ordered slots to a long article", () => {
    const markdown = [
      "# 标题",
      ...Array.from({ length: 8 }, (_, index) => `这是第${index + 1}段正文，用来说明一个与普通读者有关的具体问题。`.repeat(15)),
    ].join("\n\n");

    const result = planInlineImagePlaceholders(markdown, "article");
    expect(result.changed).toBe(true);
    expect(result.count).toBe(4);
    expect(result.markdown.match(/\[IMAGE\d+\]/g)).toEqual(["[IMAGE1]", "[IMAGE2]", "[IMAGE3]", "[IMAGE4]"]);
  });

  it("keeps existing placements unchanged", () => {
    const markdown = "# 标题\n\n第一段正文足够长，用来说明具体问题。\n\n[IMAGE1]\n\n第二段正文。";
    expect(planInlineImagePlaceholders(markdown, "article")).toEqual({
      markdown,
      count: 1,
      changed: false,
    });
  });

  it("limits short content to two slots", () => {
    const markdown = `# 标题\n\n${"第一段短内容。".repeat(60)}\n\n${"第二段短内容。".repeat(60)}`;
    expect(planInlineImagePlaceholders(markdown, "short_content").count).toBe(2);
  });
});

describe("buildInlinePromptSource", () => {
  it("converts existing inline images only in the generation copy", () => {
    const markdown = "# 标题\n\n![配图1](https://example.com/1.jpg)\n\n正文";
    expect(buildInlinePromptSource(markdown)).toContain("[IMAGE1]");
    expect(markdown).toContain("https://example.com/1.jpg");
  });
});
