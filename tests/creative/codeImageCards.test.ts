import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { editCreativeFinishedArticle, findCreativeFinishedArticleById, insertCreativeFinishedArticle } from "../../src/core/creative/creativeFinishedArticleRepository.js";
import { insertCreativeSourceItem } from "../../src/core/creative/creativeSourceItemRepository.js";
import { generateCodeImageCards, resolveCodeImageKeywords, resolveCodeImageThesis } from "../../src/core/creative/codeImageCardsService.js";
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
      const buffer = await renderCodeImageCard({
        variant,
        title: "AI 产品正在改变普通人的工作方式",
        thesis: "真正的变化来自工作流程，而不是单个工具的功能列表。",
        keywords: ["AI产品", "工作流程", "效率"],
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

  it("长文案不会越过画布右边界，也不会和底部元素重叠", async () => {
    // 这里回归的是真实缺陷：换行按缩小后的字号计算，绘制却用初始字号，
    // 导致第一行被画到画布右侧之外。横图和方图都曾因此被裁切。
    const longTitle = "这是一条特别特别长的标题用来测试换行是否会超出画布右边界的极端情况";
    const longThesis = "判断方向：核心事实不在于制造“反转”，而在于复盘公开表态，解释其对 AI Agent 发展速度、监管和未来讨论的立场（包括但不限于产能、价格与合规）。";
    for (const variant of ["2.5:1", "1:1", "3:4"] as const) {
      const buffer = await renderCodeImageCard({
        variant,
        title: longTitle,
        thesis: longThesis,
        keywords: ["AI监管", "算力供给", "合规边界"],
      });
      const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const marginPx = (variant === "2.5:1" ? 42 : variant === "1:1" ? 58 : 64) * 2;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          const offset = (y * info.width + x) * info.channels;
          if (data[offset] < 150 && data[offset + 1] < 140 && data[offset + 2] < 170) {
            if (x > right) right = x;
            if (y > bottom) bottom = y;
          }
        }
      }
      expect({ variant, contained: right <= info.width - marginPx }).toEqual({ variant, contained: true });
      expect(bottom).toBeLessThan(info.height);
    }
  });

  it("核心文案缺失时使用导语、摘要或标签，不输出占位文案", async () => {
    const handle = await createTestDatabase("hot-now-code-image-fallback-");
    handles.push(handle);
    const article = insertCreativeFinishedArticle(handle.db, {
      direction: "short_content",
      titles: ["标题内容"],
      intros: ["这是一条可直接用于图片主体的导语。"],
      contentMarkdown: "正文",
    });

    expect(resolveCodeImageThesis(article, "标题内容", "素材摘要")).toBe("这是一条可直接用于图片主体的导语。");
    expect(resolveCodeImageThesis({ ...article, intros: null }, "标题内容", "素材摘要")).toBe("素材摘要");
    expect(resolveCodeImageThesis({ ...article, intros: null }, "标题内容", null)).toBe("标题内容");
  });

  it("优先使用素材标签，缺失时确定性提取关键词", () => {
    expect(resolveCodeImageKeywords(["文章标签"], '["素材标签"]')).toEqual(["文章标签"]);
    expect(resolveCodeImageKeywords([], '["素材标签"]')).toEqual(["素材标签"]);
    expect(resolveCodeImageKeywords(null, null)).toEqual([]);
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
      codeImageKeywords: ["文章标签", "工作流"],
      contentMarkdown: "# AI 代理正在重写工作流\n\n正文内容足够长，满足短内容成品的最小正文长度要求。",
      humanMarkdown: "# AI 代理正在重写工作流\n\n正文内容足够长，满足短内容成品的最小正文长度要求。",
      status: "ready_for_publish",
    });

    const result = await generateCodeImageCards(handle.db, article.id, {
      imageDir,
      publicBaseUrl: "https://now.example.com",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("succeeded");
    const saved = findCreativeFinishedArticleById(handle.db, article.id)!;
    expect(saved.codeImageCards).toHaveLength(3);
    expect(saved.codeImageCards.every((card) => card.status === "succeeded")).toBe(true);
    expect(saved.codeImageKeywords).toEqual(["文章标签", "工作流"]);
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
      mode: "all",
    });
    expect(regenerated.status).toBe("succeeded");
  });
});
