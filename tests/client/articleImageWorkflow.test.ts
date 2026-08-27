import { effectScope, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyCoverImage,
  applyInlineImage,
  extractInlineImageUrl,
  mergeLunaImageJobs,
  useArticleImageWorkflow,
} from "../../src/client/components/creative/article-detail/useArticleImageWorkflow.js";
import { editFinishedArticle, regenInlineImage, type CreativeFinishedArticle, type LunaImageJob } from "../../src/client/services/creativeApi.js";

vi.mock("../../src/client/services/creativeApi.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/creativeApi.js")>("../../src/client/services/creativeApi.js");
  return {
    ...actual,
    editFinishedArticle: vi.fn().mockResolvedValue({ ok: true, updatedAt: "revision-3" }),
    regenInlineImage: vi.fn(),
  };
});

vi.mock("ant-design-vue", () => ({
  message: { success: vi.fn(), error: vi.fn() },
}));

afterEach(() => vi.clearAllMocks());

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

  it("替换正文图时同时删除对应图片描述，但保留其他槽位", () => {
    const markdown = [
      "开头",
      "[IMAGE1_DESC:图一说明]",
      "[IMAGE1]",
      "中段",
      "[IMAGE2_DESC:图二说明]",
      "[IMAGE2]",
    ].join("\n\n");

    const result = applyInlineImage(markdown, 2, "https://img.test/2.png");

    expect(result).toContain("[IMAGE1_DESC:图一说明]");
    expect(result).toContain("[IMAGE1]");
    expect(result).toContain("![配图2](https://img.test/2.png)");
    expect(result).not.toContain("[IMAGE2_DESC:");
    expect(result).not.toContain("[IMAGE2]");
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

  it("正文图完成后只替换当前编号并保留生图期间用户的新正文", async () => {
    vi.mocked(regenInlineImage).mockResolvedValue({
      ok: true,
      imageUrl: "https://img.test/generated-2.png",
      imageIndex: 2,
      contentMarkdown: "旧快照\n\n![配图2](https://img.test/generated-2.png)",
      updatedAt: "revision-2",
    });
    const article = {
      id: 16212,
      updatedAt: "revision-1",
      contentMarkdown: "旧快照",
      humanMarkdown: "旧人工稿",
      imagesJson: null,
      coverImage: [],
      direction: "article",
    } as unknown as CreativeFinishedArticle;
    const editContent = ref("用户新正文\n\n[IMAGE1]\n\n[IMAGE2_DESC:图二]\n[IMAGE2]");
    const humanContent = ref("用户新人工稿\n\n[IMAGE1]\n\n[IMAGE2_DESC:图二]\n[IMAGE2]");
    const scope = effectScope();
    const prepareExplicitContentSave = vi.fn().mockResolvedValue(undefined);
    let lastSavedContent = "旧快照";
    let lastSavedHuman = "旧人工稿";
    let workflow!: ReturnType<typeof useArticleImageWorkflow>;

    scope.run(() => {
      workflow = useArticleImageWorkflow({
        getArticle: () => article,
        isOpen: () => true,
        editContent,
        humanContent,
        getLastSavedContent: () => lastSavedContent,
        setLastSavedContent: (value) => { lastSavedContent = value; },
        getLastSavedHuman: () => lastSavedHuman,
        setLastSavedHuman: (value) => { lastSavedHuman = value; },
        prepareExplicitContentSave,
        setPromptDirty: () => {},
        isLivePreview: () => false,
        getPreviewThemeId: () => "sunset-film",
        tickArticleChange: () => {},
        onSaved: () => {},
      });
    });

    await workflow.handleRegenInlineImage(2);

    expect(vi.mocked(regenInlineImage)).toHaveBeenCalledWith(article.id, 2);
    expect(prepareExplicitContentSave).toHaveBeenCalledOnce();
    expect(editContent.value).toContain("用户新正文");
    expect(humanContent.value).toContain("用户新人工稿");
    expect(editContent.value).toContain("![配图2](https://img.test/generated-2.png)");
    expect(editContent.value).not.toContain("[IMAGE2_DESC:");
    expect(vi.mocked(editFinishedArticle)).toHaveBeenCalledWith(article.id, expect.objectContaining({
      expectedUpdatedAt: "revision-2",
      contentMarkdown: editContent.value,
      humanMarkdown: humanContent.value,
    }));
    scope.stop();
  });
});
