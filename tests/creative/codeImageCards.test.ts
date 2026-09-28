import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { editCreativeFinishedArticle, findCreativeFinishedArticleById, insertCreativeFinishedArticle } from "../../src/core/creative/creativeFinishedArticleRepository.js";
import { insertCreativeSourceItem } from "../../src/core/creative/creativeSourceItemRepository.js";
import { buildCodeImageSourceFingerprint, generateCodeImageCards, resolveCodeImageKeywords, resolveCodeImageThesis } from "../../src/core/creative/codeImageCardsService.js";
import { getCodeImageCardSize, getCodeImageCardTypography, renderCodeImageCard } from "../../src/core/creative/codeImageCardsRenderer.js";
import { refreshCodeImageCardsTemplateMigration } from "../../src/core/db/migrations/052_refresh_code_image_cards_template.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  while (handles.length > 0) handles.pop()?.close();
  while (tempDirs.length > 0) await rm(tempDirs.pop()!, { recursive: true, force: true });
});

describe("短内容代码制图", () => {
  it("三种比例使用各自的标题、导语和标签字号", () => {
    expect(getCodeImageCardTypography("2.5:1")).toMatchObject({ titleSize: 42, thesisSize: 38, keywordSize: 22 });
    expect(getCodeImageCardTypography("1:1")).toMatchObject({ titleSize: 120, keywordSize: 62 });
    expect(getCodeImageCardTypography("3:4")).toMatchObject({ titleSize: 66, thesisSize: 55, keywordSize: 48 });
  });

  it("竖图在标题、导语和标签之间留出均衡空隙，长标签也避开标识", async () => {
    const title = "手机弹窗广告如何治理";
    const thesis = "开屏广告退场之后，手机弹窗广告依然频繁出现，需要明确治理责任。";
    const input = { variant: "3:4" as const, title, thesis, keywords: ["手机广告", "弹窗治理", "平台责任"] };
    const [complete, titleOnly] = await Promise.all([
      renderCodeImageCard(input),
      renderCodeImageCard({ ...input, thesis: "", keywords: [] }),
    ]);
    const { data, info } = await sharp(complete).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data: titleData } = await sharp(titleOnly).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let titleBottom = -1;
    let thesisTop = info.height;
    let thesisBottom = -1;
    let firstTagTop = info.height;
    let secondTagPixels = 0;
    let logoOverlapPixels = 0;
    let lastTitleLineRight = 0;
    for (let y = 0; y < 900 * 2; y += 1) {
      for (let x = 128; x < 1250; x += 1) {
        const index = (y * info.width + x) * info.channels;
        if (y < 500 * 2 && titleData[index] < 80 && titleData[index + 1] < 80 && titleData[index + 2] < 80) {
          titleBottom = y;
          if (y > 350 && y < 395) lastTitleLineRight = Math.max(lastTitleLineRight, x);
        }
        if (y < 680 * 2 && Math.abs(data[index] - titleData[index]) > 40
          && data[index] < 180) {
          thesisTop = Math.min(thesisTop, y);
          thesisBottom = Math.max(thesisBottom, y);
        }
        const tagFill = data[index] === 0xea && data[index + 1] === 0xdf && data[index + 2] === 0xfc;
        if (tagFill && y > 550 * 2) {
          firstTagTop = Math.min(firstTagTop, y);
          if (y > 810 * 2 && y < 850 * 2) secondTagPixels += 1;
          if (y >= 870 * 2) logoOverlapPixels += 1;
        }
      }
    }
    expect(titleBottom).toBeGreaterThan(0);
    expect(lastTitleLineRight).toBeGreaterThan(550);
    expect(thesisBottom).toBeGreaterThan(thesisTop);
    expect(firstTagTop).toBeLessThan(info.height);
    expect(Math.abs((thesisTop - titleBottom) - (firstTagTop - thesisBottom))).toBeLessThan(80);
    expect(secondTagPixels).toBeGreaterThan(0);
    expect(logoOverlapPixels).toBe(0);
  });

  it("横图长标题不遮挡右上角装饰线", async () => {
    for (const title of ["手机弹窗广告", "手机弹窗广告频繁出现后该怎么治理"]) {
      const image = await renderCodeImageCard({
        variant: "2.5:1",
        title,
        thesis: "手机弹窗广告屡禁不止，开屏广告退场后还有哪些问题需要真正解决",
        keywords: ["手机广告"],
      });
      const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let linePixels = 0;
      for (let y = 12; y < 36; y += 1) {
        for (let x = 1020; x < 1416; x += 1) {
          const index = (y * info.width + x) * info.channels;
          if (data[index] > 220 && data[index] < 245
            && data[index + 1] > 185 && data[index + 1] < 220
            && data[index + 2] > 130 && data[index + 2] < 180) linePixels += 1;
        }
      }
      expect(linePixels).toBeGreaterThan(100);
    }
  });

  it("横图导语靠近标题，双行时仍与底部标签留有间距", async () => {
    for (const [title, thesis, maxFirstRow] of [
      ["短标题", "导语内容简短清晰", 260],
      ["手机弹窗广告频繁出现后该怎么治理", "手机弹窗广告屡禁不止，开屏广告退场后还有哪些问题需要真正解决", 310],
    ] as const) {
      const input = { variant: "2.5:1" as const, title, thesis, keywords: ["手机广告"] };
      const [withThesis, withoutThesis] = await Promise.all([
        renderCodeImageCard(input),
        renderCodeImageCard({ ...input, thesis: "" }),
      ]);
      const { data: withText, info } = await sharp(withThesis).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const { data: withoutText } = await sharp(withoutThesis).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let firstRow = info.height;
      let lastRow = -1;
      for (let y = 0; y < 228 * 2; y += 1) {
        for (let x = 84; x < 1300; x += 1) {
          const index = (y * info.width + x) * info.channels;
          if (Math.abs(withText[index] - withoutText[index]) > 40) {
            firstRow = Math.min(firstRow, y);
            lastRow = Math.max(lastRow, y);
          }
        }
      }
      expect(firstRow).toBeLessThan(maxFirstRow);
      expect(lastRow).toBeLessThan(440);
    }
  });

  it("方图长标题最多四行且不侵入标签区域", async () => {
    const image = await renderCodeImageCard({
      variant: "1:1",
      title: "这是一条测试方图标题可以使用四行排版并保持标题和标签之间距离的较长中文标题",
      thesis: "这段文字不出现在方图中。",
      keywords: ["分享图片"],
    });
    const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const darkRows: number[] = [];
    for (let y = 100; y < 920; y += 1) {
      let dark = 0;
      for (let x = 116; x < 1300; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        if (data[offset] < 80 && data[offset + 1] < 80 && data[offset + 2] < 80) dark += 1;
      }
      if (dark > 10) darkRows.push(y);
    }
    const lineStarts = darkRows.filter((row, index) => index === 0 || row > darkRows[index - 1] + 1);
    expect(lineStarts).toHaveLength(4);
    expect(darkRows.at(-1)).toBeLessThan(870);
  });

  it("方图不渲染导语文案", async () => {
    const base = {
      variant: "1:1" as const,
      title: "方图标题",
      keywords: ["AI产品", "内容创作"],
    };
    const first = await renderCodeImageCard({ ...base, thesis: "这段导语不应出现在方图中。" });
    const second = await renderCodeImageCard({ ...base, thesis: "替换为完全不同的中间文案。" });

    expect(first.equals(second)).toBe(true);
  });

  it("方图标签位置不随标题长度变化", async () => {
    const inputs = [
      { title: "短标题" },
      { title: "OpenAI 产品团队调整，AI 助手将从聊天工具走向完整工作流程" },
    ];
    const images = await Promise.all(inputs.map(({ title }) => renderCodeImageCard({
      variant: "1:1",
      title,
      thesis: "方图不应展示导语。",
      keywords: ["AI产品", "工作流程"],
    })));
    const tagTopRows = await Promise.all(images.map(async (image) => {
      const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let y = 800; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          const offset = (y * info.width + x) * info.channels;
          if (data[offset] === 0xea && data[offset + 1] === 0xdf && data[offset + 2] === 0xfc) return y;
        }
      }
      return -1;
    }));

    expect(tagTopRows[0]).toBeGreaterThanOrEqual(0);
    expect(tagTopRows[1]).toBe(tagTopRows[0]);
  });

  it("三个四字标签换行后给右下角标识留出空隙", async () => {
    const buffer = await renderCodeImageCard({
      variant: "1:1",
      title: "手机弹窗广告频繁出现，开屏广告暂退后该怎么治",
      thesis: "方图不显示导语。",
      keywords: ["手机广告", "弹窗治理", "App规范"],
    });
    const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    // Logo 位于 y=659 起；第二行标签必须在 y=650 前结束，不靠遮盖 Logo 解决。
    let secondRowPixels = 0;
    let overlapPixels = 0;
    for (let y = 560 * 2; y < 659 * 2; y += 1) {
      for (let x = 58 * 2; x < 560 * 2; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        const isTag = data[offset] === 0xea && data[offset + 1] === 0xdf && data[offset + 2] === 0xfc;
        if (isTag && y < 650 * 2) secondRowPixels += 1;
        if (isTag && y >= 650 * 2) overlapPixels += 1;
      }
    }
    expect(secondRowPixels).toBeGreaterThan(0);
    expect(overlapPixels).toBe(0);
  });

  it("方图大标签放不下一行时会换行显示", async () => {
    const buffer = await renderCodeImageCard({
      variant: "1:1",
      title: "固定区域标题",
      thesis: "方图不应显示这段导语。",
      keywords: ["AI产品", "工作流程", "产品转型"],
    });
    const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rowTwoTop = 572 * 2;
    const rowTwoBottom = 668 * 2;
    let tagFillPixels = 0;
    for (let y = rowTwoTop; y < rowTwoBottom; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        if (data[offset] === 0xea && data[offset + 1] === 0xdf && data[offset + 2] === 0xfc) {
          tagFillPixels += 1;
        }
      }
    }

    expect(tagFillPixels).toBeGreaterThan(0);
  });

  it("栅格化后的文字边缘保持足够清晰", async () => {
    const buffer = await renderCodeImageCard({
      variant: "2.5:1",
      title: "三条车道等一位老人",
      thesis: "判断方向：核心重点不是制造反转，而是复盘老人过斑马线近3分钟期间车辆集体耐心礼让。",
      keywords: ["文明礼让", "斑马线安全", "上海交通"],
    });
    const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
    let gradientTotal = 0;
    let gradientSamples = 0;
    for (let y = 1; y < info.height - 1; y += 1) {
      for (let x = 1; x < info.width - 1; x += 1) {
        const offset = y * info.width + x;
        if (data[offset] >= 235) continue;
        gradientTotal += Math.abs(data[offset] - data[offset + 1]);
        gradientTotal += Math.abs(data[offset] - data[offset + info.width]);
        gradientSamples += 2;
      }
    }
    expect(gradientTotal / gradientSamples).toBeGreaterThan(16);
  });

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

    const baseFingerprint = buildCodeImageSourceFingerprint(
      "AI 代理正在重写工作流", "真正的变化来自工作流程，而不是单个工具。", ["文章标签", "工作流"],
    );
    const legacyWide = {
      ...saved.codeImageCards.find((card) => card.variant === "2.5:1")!,
      sourceFingerprint: createHash("sha256").update(`${baseFingerprint}:wide-intro-v1`).digest("hex"),
    };
    const squareBeforeWideRefresh = saved.codeImageCards.find((card) => card.variant === "1:1")!;
    const portraitBeforeWideRefresh = saved.codeImageCards.find((card) => card.variant === "3:4")!;
    expect(editCreativeFinishedArticle(handle.db, article.id, {
      codeImageCards: saved.codeImageCards.map((card) => card.variant === "2.5:1" ? legacyWide : card),
    }).ok).toBe(true);
    const wideRefresh = await generateCodeImageCards(handle.db, article.id, {
      imageDir,
      publicBaseUrl: "https://now.example.com",
    });
    expect(wideRefresh.status).toBe("succeeded");
    const wideRefreshedArticle = findCreativeFinishedArticleById(handle.db, article.id)!;
    expect(wideRefreshedArticle.codeImageCards.find((card) => card.variant === "2.5:1")!.url).not.toBe(legacyWide.url);
    expect(wideRefreshedArticle.codeImageCards.find((card) => card.variant === "1:1")).toEqual(squareBeforeWideRefresh);
    expect(wideRefreshedArticle.codeImageCards.find((card) => card.variant === "3:4")).toEqual(portraitBeforeWideRefresh);

    const wideBeforeSquareRefresh = wideRefreshedArticle.codeImageCards.find((card) => card.variant === "2.5:1")!;
    const portraitBeforeSquareRefresh = wideRefreshedArticle.codeImageCards.find((card) => card.variant === "3:4")!;
    const squareBeforeRefresh = wideRefreshedArticle.codeImageCards.find((card) => card.variant === "1:1")!;
    const legacySquare = {
      ...squareBeforeRefresh,
      sourceFingerprint: createHash("sha256")
        .update(`${baseFingerprint}:square-title-tags-v2`).digest("hex"),
    };
    expect(editCreativeFinishedArticle(handle.db, article.id, {
      codeImageCards: wideRefreshedArticle.codeImageCards.map((card) => card.variant === "1:1" ? legacySquare : card),
    }).ok).toBe(true);

    const squareRefresh = await generateCodeImageCards(handle.db, article.id, {
      imageDir,
      publicBaseUrl: "https://now.example.com",
    });
    expect(squareRefresh.status).toBe("succeeded");
    const squareRefreshedArticle = findCreativeFinishedArticleById(handle.db, article.id)!;
    expect(squareRefreshedArticle.codeImageCards.find((card) => card.variant === "1:1")!.url).not.toBe(legacySquare.url);
    expect(squareRefreshedArticle.codeImageCards.find((card) => card.variant === "2.5:1")).toEqual(wideBeforeSquareRefresh);
    expect(squareRefreshedArticle.codeImageCards.find((card) => card.variant === "3:4")).toEqual(portraitBeforeSquareRefresh);

    // 旧竖图仍使用未分版式的基础指纹；补做时仅替换这一比例。
    const legacyPortrait = { ...portraitBeforeSquareRefresh, sourceFingerprint: baseFingerprint };
    expect(editCreativeFinishedArticle(handle.db, article.id, {
      codeImageCards: squareRefreshedArticle.codeImageCards.map((card) => card.variant === "3:4" ? legacyPortrait : card),
    }).ok).toBe(true);
    const portraitRefresh = await generateCodeImageCards(handle.db, article.id, {
      imageDir,
      publicBaseUrl: "https://now.example.com",
    });
    expect(portraitRefresh.status).toBe("succeeded");
    const portraitRefreshedArticle = findCreativeFinishedArticleById(handle.db, article.id)!;
    expect(portraitRefreshedArticle.codeImageCards.find((card) => card.variant === "3:4")!.url).not.toBe(legacyPortrait.url);
    expect(portraitRefreshedArticle.codeImageCards.find((card) => card.variant === "2.5:1")).toEqual(wideBeforeSquareRefresh);
    expect(portraitRefreshedArticle.codeImageCards.find((card) => card.variant === "1:1")).toEqual(squareRefreshedArticle.codeImageCards.find((card) => card.variant === "1:1"));

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

    expect(editCreativeFinishedArticle(handle.db, article.id, {
      intros: ["更新后的导语"],
    }).ok).toBe(true);
    expect(findCreativeFinishedArticleById(handle.db, article.id)!.codeImageCards.every((card) => card.status === "stale")).toBe(true);

    await generateCodeImageCards(handle.db, article.id, {
      imageDir,
      publicBaseUrl: "https://now.example.com",
      mode: "all",
    });
    expect(editCreativeFinishedArticle(handle.db, article.id, {
      summary100: ["更新后的摘要"],
    }).ok).toBe(true);
    expect(findCreativeFinishedArticleById(handle.db, article.id)!.codeImageCards.every((card) => card.status === "stale")).toBe(true);
  });
});
