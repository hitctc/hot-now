import { describe, expect, it } from "vitest";

import {
  applyCoverImage,
  applyInlineImage,
  extractInlineImageUrl,
  mergeLunaImageJobs,
} from "../../src/client/components/creative/article-detail/useArticleImageWorkflow.js";
import type { LunaImageJob } from "../../src/client/services/creativeApi.js";

function lunaJob(overrides: Partial<LunaImageJob> = {}): LunaImageJob {
  return {
    jobId: "job-default",
    articleId: 16212,
    target: "inline",
    targetKey: "inline-1",
    imageIndex: 1,
    mode: "manual",
    status: "queued",
    provider: "codex",
    model: "gpt-5.6-luna",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("article image workflow helpers", () => {
  it("优先替换正文占位符，不改变其他正文内容", () => {
    const markdown = "段落\n\n[IMAGE2]\n\n结尾";

    expect(applyInlineImage(markdown, 2, "https://img.test/2.png")).toBe(
      "段落\n\n![配图2](https://img.test/2.png)\n\n结尾",
    );
  });

  it("没有封面图行时插入封面，有封面图行时只替换图片", () => {
    expect(applyCoverImage("正文", "https://img.test/cover.png")).toBe(
      "![封面图](https://img.test/cover.png)\n\n正文",
    );
    expect(applyCoverImage("![封面图](https://img.test/old.png)\n\n正文", "https://img.test/new.png")).toBe(
      "![封面图](https://img.test/new.png)\n\n正文",
    );
  });

  it("从正文中读取对应图片，并只保留每个 Luna 目标的最新任务", () => {
    const older = lunaJob({ jobId: "job-old", updatedAt: "2026-08-18T00:01:00.000Z" });
    const newer = lunaJob({ jobId: "job-new", status: "succeeded", updatedAt: "2026-08-18T00:02:00.000Z" });
    const cover = lunaJob({
      jobId: "job-cover",
      target: "cover",
      targetKey: "cover",
      imageIndex: null,
      updatedAt: "2026-08-18T00:01:30.000Z",
    });

    expect(extractInlineImageUrl("![配图1](https://img.test/1.png)\n![配图2](https://img.test/2.png)", 2)).toBe(
      "https://img.test/2.png",
    );
    expect(mergeLunaImageJobs([older, newer, cover])).toEqual({
      "inline-1": newer,
      cover,
    });
  });
});
