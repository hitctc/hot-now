import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflowFile = resolve(process.cwd(), "src/client/components/creative/article-detail/ArticleImageWorkflowSections.vue");

describe("Luna 图片操作布局", () => {
  it("把封面和正文 Luna 操作放在上传控件区域，而不是提示词底部", () => {
    const source = readFileSync(workflowFile, "utf8");
    const coverButton = source.indexOf('data-testid="luna-cover-image-button"');
    const coverPrompt = source.indexOf('label="封面 Prompt"');
    const inlineButton = source.indexOf(":data-testid=\"`luna-inline-image-button-${index}`\"");
    const inlinePrompt = source.indexOf(":label=\"`配图${index} Prompt`\"");

    expect(coverButton).toBeGreaterThanOrEqual(0);
    expect(coverButton).toBeLessThan(coverPrompt);
    expect(inlineButton).toBeGreaterThanOrEqual(0);
    expect(inlineButton).toBeLessThan(inlinePrompt);
    expect(source).toContain("inlinePromptFor(article, index)");
    expect(source).not.toContain("luna-inline-image-action");
  });

  it("为任务存在时的单图状态保留独立状态文案", () => {
    const source = readFileSync(workflowFile, "utf8");

    expect(source).toContain("排队中");
    expect(source).toContain("生成中");
    expect(source).toContain("已完成");
    expect(source).toContain("失败");
    expect(source).toContain("lunaJobStatusLabel");
  });
});
