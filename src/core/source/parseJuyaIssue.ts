import Parser from "rss-parser";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { BUILTIN_SOURCES } from "./sourceCatalog.js";
import type { CandidateItem, LoadedIssue } from "./types.js";

export type DailyIssue = LoadedIssue;

const parser = new Parser();

// Juya keeps its existing digest-style parsing, but now enriches each item with the shared
// source metadata that later unified-site stages expect.
export async function parseJuyaIssue(feedXml: string): Promise<DailyIssue> {
  const feed = await parser.parseString(feedXml);
  const latestItem = feed.items[0];

  if (!latestItem) {
    throw new Error("RSS feed does not contain any issue items");
  }

  const date = latestItem.title?.trim() || "unknown-date";
  const issueUrl = latestItem.link?.trim() || "";
  const html = latestItem["content:encoded"]?.trim() ?? latestItem.content?.trim() ?? "";
  const issuePublishedAt = resolveIssuePublishedAt(feed, latestItem, date);

  const $ = cheerio.load(html);
  const summariesByRank = collectDetailedSummaries($);
  const contentsByRank = collectDetailedContents($);
  const items: CandidateItem[] = [];
  let currentCategory = "未分类";

  $("h3, li").each((_, element) => {
    if (element.tagName === "h3") {
      currentCategory = $(element).text().trim();
      return;
    }

    const link = $(element).find("a").attr("href") ?? "";
    const rankText = $(element).find("code").text().trim();
    const rankMatch = rankText.match(/^#([1-9]\d*)$/);
    if (!rankMatch) {
      return;
    }

    const rank = Number(rankMatch[1]);
    const title = $(element)
      .clone()
      .find("a, code")
      .remove()
      .end()
      .text()
      .replace("↗", "")
      .trim();

    if (link && title) {
      items.push({
        rank,
        category: currentCategory,
        title,
        sourceUrl: link,
        sourceName: BUILTIN_SOURCES.juya.name,
        externalId: link,
        ...(issuePublishedAt ? { publishedAt: issuePublishedAt } : {}),
        ...(summariesByRank.get(rank) ? { summary: summariesByRank.get(rank) } : {}),
        ...(contentsByRank.get(rank) ? { contentHtml: contentsByRank.get(rank) } : {})
      });
    }
  });

  return {
    date,
    issueUrl,
    sourceKind: "juya",
    sourceType: BUILTIN_SOURCES.juya.sourceType,
    sourcePriority: BUILTIN_SOURCES.juya.sourcePriority,
    items
  };
}

/** 按条目编号提取摘要，兼容旧 h2 与现役 h3 详情标题，不把整期正文混成一个摘要。 */
function collectDetailedSummaries($: cheerio.CheerioAPI): Map<number, string> {
  const summariesByRank = new Map<number, string>();

  $("h2, h3").each((_, element) => {
    const headingText = normalizeText($(element).text());

    if (!headingText || headingText === "概览") {
      return;
    }

    const rank = parseRank(headingText);

    if (rank == null) {
      return;
    }

    const sectionNodes = $(element).nextUntil("h2, h3");
    const summary = extractSectionSummary($, sectionNodes);

    if (summary) {
      summariesByRank.set(rank, summary);
    }
  });

  return summariesByRank;
}

/** 按编号收集详情摘要及全部正文段落；遇到下个 h2/h3 即停止，避免当前分栏结构串入下一条。 */
function collectDetailedContents($: cheerio.CheerioAPI): Map<number, string> {
  const contentsByRank = new Map<number, string>();

  $("h2, h3").each((_, element) => {
    const headingText = normalizeText($(element).text());

    if (!headingText || headingText === "概览") {
      return;
    }

    const rank = parseRank(headingText);

    if (rank == null) {
      return;
    }

    const sectionNodes = $(element).nextUntil("h2, h3");
    const parts: string[] = [];

    sectionNodes.filter("blockquote, p").each((_, el) => {
      const text = normalizeText($(el).text());
      if (text) parts.push(text);
    });

    if (parts.length > 0) {
      contentsByRank.set(rank, parts.join("\n\n"));
    }
  });

  return contentsByRank;
}

function extractSectionSummary($: cheerio.CheerioAPI, sectionNodes: cheerio.Cheerio<AnyNode>): string | undefined {
  const blockquoteText = normalizeText(sectionNodes.filter("blockquote").first().text());

  if (blockquoteText) {
    return blockquoteText;
  }

  const paragraphText = sectionNodes
    .filter("p")
    .slice(0, 2)
    .toArray()
    .map((element) => normalizeText($(element).text()))
    .filter(Boolean)
    .join(" ");

  return paragraphText || undefined;
}

function resolveIssuePublishedAt(feed: Parser.Output<unknown>, latestItem: Parser.Item, issueDate: string): string | undefined {
  const rssPublishedAt = toIsoDate(latestItem.isoDate ?? latestItem.pubDate ?? readFeedLastBuildDate(feed));

  if (rssPublishedAt) {
    return rssPublishedAt;
  }

  return toIssueDateIso(issueDate);
}

function readFeedLastBuildDate(feed: Parser.Output<unknown>): string | undefined {
  const candidate = (feed as { lastBuildDate?: unknown }).lastBuildDate;
  return typeof candidate === "string" ? candidate : undefined;
}

function toIsoDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function toIssueDateIso(issueDate: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    return undefined;
  }

  return `${issueDate}T00:00:00.000Z`;
}

function parseRank(text: string): number | undefined {
  const match = text.match(/#([1-9]\d*)$/);

  if (!match) {
    return undefined;
  }

  return Number(match[1]);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/↗/g, "").trim();
}
