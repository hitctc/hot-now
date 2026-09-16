import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { SqliteDatabase } from "../db/openDatabase.js";
import { storeImageBuffer } from "../storage/imageStore.js";
import { findCreativeSourceItemById } from "./creativeSourceItemRepository.js";
import {
  findCreativeFinishedArticleById,
  editCreativeFinishedArticle,
} from "./creativeFinishedArticleRepository.js";
import type { CreativeFinishedArticleRecord } from "./creativeFinishedArticleTypes.js";
import {
  CODE_IMAGE_CARD_VARIANTS,
  findCodeImageCard,
  orderCodeImageCards,
  type CodeImageCard,
  type CodeImageCardVariant,
} from "./codeImageCards.js";
import {
  getCodeImageCardSize,
  renderCodeImageCard,
} from "./codeImageCardsRenderer.js";

export type CodeImageCardsGenerationMode = "missing" | "all";

export type GenerateCodeImageCardsOptions = {
  imageDir: string;
  publicBaseUrl: string;
  logoPath?: string;
  mode?: CodeImageCardsGenerationMode;
};

export type GenerateCodeImageCardsResult = {
  ok: boolean;
  status: "running" | "succeeded" | "partial" | "failed";
  article?: CreativeFinishedArticleRecord;
  reason?: string;
};

const inFlight = new Map<number, Promise<GenerateCodeImageCardsResult>>();

/** 制作单篇短内容的代码图片；同一文章并发请求只保留一个执行实例。 */
export async function generateCodeImageCards(
  db: SqliteDatabase,
  articleId: number,
  options: GenerateCodeImageCardsOptions,
): Promise<GenerateCodeImageCardsResult> {
  const running = inFlight.get(articleId);
  if (running) {
    return {
      ok: true,
      status: "running",
      article: findCreativeFinishedArticleById(db, articleId) ?? undefined,
    };
  }

  const task = runCodeImageCards(db, articleId, options);
  inFlight.set(articleId, task);
  try {
    return await task;
  } finally {
    inFlight.delete(articleId);
  }
}

/** 计算页面和推送共用的整体图片状态，不改变文章本身的业务状态。 */
export function getCodeImageCardsStatus(
  cards: CodeImageCard[],
  currentFingerprint?: string | null,
): GenerateCodeImageCardsResult["status"] {
  const ordered = orderCodeImageCards(cards);
  if (ordered.some((card) => card.status === "running")) return "running";
  if (ordered.length === 0 || ordered.every((card) => card.status === "failed")) return "failed";
  if (ordered.some((card) => card.status === "stale" || (currentFingerprint && card.sourceFingerprint !== currentFingerprint))) {
    return "partial";
  }
  if (ordered.length === CODE_IMAGE_CARD_VARIANTS.length && ordered.every((card) => card.status === "succeeded")) return "succeeded";
  return "partial";
}

/** 根据文章最终字段和素材标签生成稳定指纹，供过期判断和幂等制作使用。 */
export function buildCodeImageSourceFingerprint(
  title: string,
  thesis: string,
  keywords: string[],
): string {
  return createHash("sha256")
    .update(JSON.stringify({ title, thesis, keywords, template: "hotnow-code-card-v1", sizes: { wide: "750x300", square: "750x750", portrait: "750x1000" } }))
    .digest("hex");
}

/** 从标题、判断和素材标签中整理图片使用的短关键词，完全在本地确定性完成。 */
export function resolveCodeImageKeywords(tags: string | null, title: string, thesis: string): string[] {
  const fromTags = parseTags(tags);
  const candidates = fromTags.length > 0 ? fromTags : extractKeywords(`${title} ${thesis}`);
  return [...new Set(candidates.map((item) => shortenKeyword(item)).filter(Boolean))].slice(0, 3);
}

async function runCodeImageCards(
  db: SqliteDatabase,
  articleId: number,
  options: GenerateCodeImageCardsOptions,
): Promise<GenerateCodeImageCardsResult> {
  const initial = findCreativeFinishedArticleById(db, articleId);
  if (!initial) return { ok: false, status: "failed", reason: "article-not-found" };
  if (initial.deletedAt) return { ok: false, status: "failed", reason: "article-deleted" };
  if (initial.direction !== "short_content") return { ok: false, status: "failed", reason: "article-is-not-short-content" };

  const title = selectedTitle(initial);
  const thesis = initial.thesis?.trim() ?? "";
  const source = initial.sourceItemId ? findCreativeSourceItemById(db, initial.sourceItemId) : null;
  const keywords = resolveCodeImageKeywords(source?.tags ?? null, title, thesis);
  const fingerprint = buildCodeImageSourceFingerprint(title, thesis, keywords);
  const existing = orderCodeImageCards(initial.codeImageCards);
  const mode = options.mode ?? "missing";
  const targets = CODE_IMAGE_CARD_VARIANTS.filter((variant) => {
    const card = findCodeImageCard(existing, variant);
    if (mode === "all") return true;
    return !card || card.status === "failed" || card.status === "pending";
  });

  if (targets.length === 0) {
    return {
      ok: true,
      status: getCodeImageCardsStatus(existing, fingerprint),
      article: initial,
    };
  }

  const logoDataUri = await readLogoDataUri(options.logoPath);
  const runningCards = mergeCardStates(existing, targets.map((variant) => {
    const size = getCodeImageCardSize(variant);
    const current = findCodeImageCard(existing, variant);
    return {
      variant,
      url: current?.url ?? null,
      width: size.width,
      height: size.height,
      status: "running" as const,
      generatedAt: current?.generatedAt ?? null,
      sourceFingerprint: fingerprint,
      fileSize: current?.fileSize ?? null,
      error: null,
    };
  }));
  const runningSaved = editCreativeFinishedArticle(db, articleId, { codeImageCards: runningCards }, "code-image");
  if (!runningSaved.ok) return { ok: false, status: "failed", reason: runningSaved.reason ?? "code-image-state-save-failed" };

  const rendered = await Promise.all(targets.map(async (variant) => {
    try {
      const buffer = await renderCodeImageCard({ variant, title, thesis, keywords, logoDataUri });
      const stored = await storeImageBuffer(options.imageDir, buffer, ".png");
      const size = getCodeImageCardSize(variant);
      const publicUrl = options.publicBaseUrl ? `${options.publicBaseUrl}${stored.urlPath}` : stored.urlPath;
      return {
        variant,
        url: publicUrl,
        width: size.width,
        height: size.height,
        status: "succeeded" as const,
        generatedAt: new Date().toISOString(),
        sourceFingerprint: fingerprint,
        fileSize: buffer.length,
        error: null,
      } satisfies CodeImageCard;
    } catch (error) {
      const size = getCodeImageCardSize(variant);
      return {
        variant,
        url: findCodeImageCard(existing, variant)?.url ?? null,
        width: size.width,
        height: size.height,
        status: "failed" as const,
        generatedAt: findCodeImageCard(existing, variant)?.generatedAt ?? null,
        sourceFingerprint: fingerprint,
        fileSize: findCodeImageCard(existing, variant)?.fileSize ?? null,
        error: error instanceof Error ? error.message : String(error),
      } satisfies CodeImageCard;
    }
  }));

  const latest = findCreativeFinishedArticleById(db, articleId);
  if (!latest) return { ok: false, status: "failed", reason: "article-not-found-after-render" };
  const finalCards = mergeCardStates(latest.codeImageCards, rendered);
  const finalMarkdown = mergeCodeImageMarkdown(
    latest.humanMarkdown ?? latest.contentMarkdown,
    latest.codeImageCards,
    rendered,
  );
  const finalCoverImages = mergeCodeCoverCandidates(
    latest.coverImage,
    latest.coverImageIndex,
    latest.codeImageCards,
    finalCards,
  );
  const finalSaved = editCreativeFinishedArticle(db, articleId, {
    expectedUpdatedAt: latest.updatedAt,
    codeImageCards: finalCards,
    humanMarkdown: finalMarkdown,
    coverImage: finalCoverImages.images,
    coverImageIndex: finalCoverImages.index,
  }, "code-image");
  if (!finalSaved.ok) return { ok: false, status: "failed", reason: finalSaved.reason ?? "article-revision-conflict" };

  const article = findCreativeFinishedArticleById(db, articleId) ?? latest;
  const status = getCodeImageCardsStatus(article.codeImageCards, fingerprint);
  return { ok: true, status, article };
}

function selectedTitle(article: CreativeFinishedArticleRecord): string {
  const titles = article.titles ?? [];
  return (titles[article.titleIndex] ?? titles[0] ?? "未命名短内容").trim() || "未命名短内容";
}

function mergeCardStates(base: CodeImageCard[], updates: CodeImageCard[]): CodeImageCard[] {
  const byVariant = new Map(base.map((card) => [card.variant, card]));
  for (const update of updates) byVariant.set(update.variant, update);
  return orderCodeImageCards([...byVariant.values()]);
}

function mergeCodeImageMarkdown(markdown: string, previous: CodeImageCard[], updates: CodeImageCard[]): string {
  let merged = markdown;
  const linesToInsert: string[] = [];
  for (const update of updates) {
    if (update.status !== "succeeded" || !update.url) continue;
    const old = findCodeImageCard(previous, update.variant);
    if (old?.url && merged.includes(old.url)) {
      merged = merged.split(old.url).join(update.url);
      continue;
    }
    if (!old || old.status === "failed" || old.status === "pending" || old.status === "running") {
      linesToInsert.push(markdownLine(update.variant, update.url));
    }
  }
  if (linesToInsert.length === 0) return merged;
  return `${linesToInsert.join("\n\n")}\n\n${merged.trimStart()}`.trimEnd();
}

function markdownLine(variant: CodeImageCardVariant, url: string): string {
  if (variant === "2.5:1") return `![封面图｜HotNow 2.5:1 横图](${url})`;
  if (variant === "1:1") return `![配图｜HotNow 1:1 方图](${url})`;
  return `![配图｜HotNow 3:4 竖图](${url})`;
}

function mergeCodeCoverCandidates(
  current: string[],
  currentIndex: number,
  previous: CodeImageCard[],
  next: CodeImageCard[],
): { images: string[]; index: number } {
  const oldCodeUrls = new Set(previous.map((card) => card.url).filter((url): url is string => Boolean(url)));
  const selectedUrl = current[currentIndex] ?? null;
  const selectedVariant = previous.find((card) => card.url === selectedUrl)?.variant;
  const images = current.filter((url) => !oldCodeUrls.has(url));
  const codeCards = CODE_IMAGE_CARD_VARIANTS
    .map((variant) => findCodeImageCard(next, variant))
    .filter((card): card is CodeImageCard => Boolean(card?.url));
  for (const card of codeCards) {
    if (!images.includes(card.url!)) images.push(card.url!);
  }

  if (selectedUrl && images.includes(selectedUrl)) return { images, index: images.indexOf(selectedUrl) };
  const preferredVariant = selectedVariant && codeCards.some((card) => card.variant === selectedVariant)
    ? selectedVariant
    : codeCards.find((card) => card.variant === "2.5:1")?.variant
      ?? codeCards.find((card) => card.variant === "3:4")?.variant
      ?? codeCards[0]?.variant;
  const selectedCode = codeCards.find((card) => card.variant === preferredVariant)?.url;
  return { images, index: selectedCode ? images.indexOf(selectedCode) : 0 };
}

async function readLogoDataUri(logoPath: string | undefined): Promise<string | undefined> {
  if (!logoPath) return undefined;
  try {
    const buffer = await readFile(logoPath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function parseTags(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    // 兼容历史数据中的逗号、顿号和井号分隔文本。
  }
  return raw.split(/[、,，|｜#\n]/).map((item) => item.trim()).filter(Boolean);
}

function extractKeywords(text: string): string[] {
  const words: string[] = text.match(/[\u4e00-\u9fff]{2,8}|[A-Za-z][A-Za-z0-9-]{1,15}/g) ?? [];
  return words.filter((word, index) => words.indexOf(word) === index).slice(0, 3);
}

function shortenKeyword(value: string): string {
  const compact = value.replace(/^#/, "").replace(/\s+/g, " ").trim();
  return compact.length > 8 ? `${compact.slice(0, 8)}…` : compact;
}
