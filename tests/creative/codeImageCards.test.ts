import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { editCreativeFinishedArticle, findCreativeFinishedArticleById, insertCreativeFinishedArticle } from "../../src/core/creative/creativeFinishedArticleRepository.js";
import { insertCreativeSourceItem } from "../../src/core/creative/creativeSourceItemRepository.js";
import { generateCodeImageCards, resolveCodeImageKeywords } from "../../src/core/creative/codeImageCardsService.js";
import { getCodeImageCardSize, renderCodeImageCard } from "../../src/core/creative/codeImageCardsRenderer.js";
import { refreshCodeImageCardsTemplateMigration } from "../../src/core/db/migrations/052_refresh_code_image_cards_template.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  while (handles.length > 0) handles.pop()?.close();
  while (tempDirs.length > 0) await rm(tempDirs.pop()!, { recursive: true, force: true });
});

describe("短内容代码制图", () => {
  it("按三种比例导出清晰的 PNG", async () => {
    for (const variant of ["2.5:1", "1:1", "3:4"] as const) {
      const fontDataUri = `data:font/otf;base64,${(await readFile(path.join(process.cwd(), "src/server/public/fonts/NotoSansSC-Regular.otf"))).toString("base64")}`;
      const buffer = await renderCodeImageCard({
        variant,
        title: "AI 产品正在改变普通人的工作方式",
        thesis: "真正的变化来自工作流程，而不是单个工具的功能列表。",
        keywords: ["AI产品", "工作流程", "效率"],
        fontDataUri,
      });
      const metadata = await sharp(buffer).metadata();
      expect({ width: metadata.width, height: metadata.height }).toEqual(getCodeImageCardSize(variant));
      expect(metadata.format).toBe("png");
      expect(buffer.length).toBeGreaterThan(0);

      const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const darkPixels = (x: number, y: number): boolean => {
        const offset = (y * info.width + x) * info.channels;
        return data[offset] < 150 && data[offset + 1] < 140 && data[offset + 2] < 170;
      };
      const darkBounds = { top: info.height, bottom: -1 };
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < Math.floor(info.width * 0.8); x += 1) {
          if (darkPixels(x, y)) {
            darkBounds.top = Math.min(darkBounds.top, y);
            darkBounds.bottom = Math.max(darkBounds.bottom, y);
          }
        }
      }
      expect((darkBounds.bottom - darkBounds.top + 1) / info.height).toBeGreaterThan(0.4);
    }
  });

  it("优先使用素材标签，缺失时确定性提取关键词", () => {
    expect(resolveCodeImageKeywords('["AI代理", "工作流", "自动化"]', "标题", "判断")).toEqual(["AI代理", "工作流", "自动化"]);
    const fallback = resolveCodeImageKeywords(null, "AI 代理正在重写工作流", "自动化会先改变流程");
    expect(fallback).toHaveLength(3);
    expect(fallback.every((keyword) => keyword.length > 0 && keyword.length <= 9)).toBe(true);
  });

  it("制作三张图片并回写独立元数据、封面候选和人工正文", async () => {
    const handle = await createTestDatabase("hot-now-code-image-");
    handles.push(handle);
    const imageDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-code-image-files-"));
    tempDirs.push(imageDir);
    const source = insertCreativeSourceItem(handle.db, {
      externalId: `code-image-${Date.now()}`,
      collectorAgent: "test",
      title: "AI 代理",
      url: "https://example.com/code-image",
      tags: '["AI代理", "工作流", "自动化"]',
    });
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      direction: "short_content",
      titles: ["AI 代理正在重写工作流"],
      thesis: "真正的变化来自工作流程，而不是单个工具。",
      contentMarkdown: "# AI 代理正在重写工作流\n\n正文内容足够长，满足短内容成品的最小正文长度要求。",
      humanMarkdown: "# AI 代理正在重写工作流\n\n正文内容足够长，满足短内容成品的最小正文长度要求。",
      status: "ready_for_publish",
    });

    const fontPath = path.join(process.cwd(), "src/server/public/fonts/NotoSansSC-Regular.otf");
    const result = await generateCodeImageCards(handle.db, article.id, {
      imageDir,
      publicBaseUrl: "https://now.example.com",
      fontPath,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("succeeded");
    const saved = findCreativeFinishedArticleById(handle.db, article.id)!;
    expect(saved.codeImageCards).toHaveLength(3);
    expect(saved.codeImageCards.every((card) => card.status === "succeeded")).toBe(true);
    expect(saved.coverImage).toHaveLength(3);
    expect(saved.coverImageIndex).toBe(0);
    expect(saved.humanMarkdown).toContain("封面图｜HotNow 2.5:1 横图");
    expect(saved.humanMarkdown).toContain("配图｜HotNow 1:1 方图");
    expect(saved.humanMarkdown).toContain("配图｜HotNow 3:4 竖图");

    refreshCodeImageCardsTemplateMigration.apply(handle.db);
    expect(findCreativeFinishedArticleById(handle.db, article.id)!.codeImageCards.every((card) => card.status === "stale")).toBe(true);

    const repeat = await generateCodeImageCards(handle.db, article.id, {
      imageDir,
      publicBaseUrl: "https://now.example.com",
      fontPath,
    });
    expect(repeat.status).toBe("succeeded");
    const repeated = findCreativeFinishedArticleById(handle.db, article.id)!;
    expect(repeated.humanMarkdown?.match(/HotNow 2\.5:1 横图/g)).toHaveLength(1);

    expect(editCreativeFinishedArticle(handle.db, article.id, {
      titles: ["更新后的 AI 代理判断"],
    }).ok).toBe(true);
    const stale = findCreativeFinishedArticleById(handle.db, article.id)!;
    expect(stale.codeImageCards.every((card) => card.status === "stale")).toBe(true);
    const regenerated = await generateCodeImageCards(handle.db, article.id, {
      imageDir,
      publicBaseUrl: "https://now.example.com",
      fontPath,
      mode: "all",
    });
    expect(regenerated.status).toBe("succeeded");
  });
});
