import { describe, expect, it } from "vitest";
import { appendShortPublishFooter } from "../../src/client/utils/shortPublishFooter.js";

const footer = "跪求点赞、关注。";

describe("短成品发布结尾", () => {
  it("正文后留一个空行，重复拼接不会增加结尾", () => {
    const result = appendShortPublishFooter("# 标题\n\n发布正文\n\n\n", "short_content");
    expect(result).toBe(`# 标题\n\n发布正文\n\n${footer}`);
    expect(appendShortPublishFooter(result, "short_content")).toBe(result);
    expect(appendShortPublishFooter(`发布正文\n${footer}\n`, "short_content")).toBe(`发布正文\n\n${footer}`);
  });
  it.each([
    "正文\n\n跪求\n点赞、关注。",
    "正文\n\n跪求\n\n点赞、关注。",
  ])("分行或分段的尾注统一合并为一次标准文案：%s", input => {
    expect(appendShortPublishFooter(input, "short_content")).toBe(`正文\n\n${footer}`);
  });
  it("旧结尾及重复的新旧结尾统一换为一次新文案", () => {
    expect(appendShortPublishFooter("发布正文\n\n跪求点赞、关注，谢谢你。\n\n跪求点赞、关注。", "short_content")).toBe(`发布正文\n\n${footer}`);
  });
  it.each(["article", undefined, "unknown"])("%s正文保持原样", direction => {
    const input = "正文\n\n\n";
    expect(appendShortPublishFooter(input, direction)).toBe(input);
  });
  it.each(["", "   ", "# 标题\n\n", "# 标题\n\n[IMAGE1]\n", "![封面图](https://example.com/cover.png)\n\n# 标题\n\n"])("空白或占位稿不因结尾变成有正文：%s", input => {
    expect(appendShortPublishFooter(input, "short_content")).toBe(input);
  });
});
