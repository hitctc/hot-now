import Parser from "rss-parser";
import * as cheerio from "cheerio";
import type { CandidateItem, LoadedIssue, SourceDefinition } from "./types.js";

const parser = new Parser();

// Standard article feeds share one normalization path so different publishers can enter the
// same downstream pipeline without custom ranking logic.
export async function parseArticleFeed(
  feedXml: string,
  source: Pick<SourceDefinition, "kind" | "name" | "category">
): Promise<LoadedIssue> {
  const feed = await parser.parseString(feedXml);
  const items = feed.items
    .map((item, index) => toCandidateItem(item, index, source))
    .filter((item): item is CandidateItem => item !== null);
  const publishedAt = items[0]?.publishedAt;

  // Article feeds do not expose a digest-style issue date, so we anchor the issue on the
  // freshest item publication date and fall back to an explicit unknown marker when missing.
  return {
    date: toIssueDate(publishedAt),
    issueUrl: feed.link?.trim() ?? "",
    sourceKind: source.kind,
    items
  };
}

// Each RSS item becomes one ranked candidate, and items missing a title or URL are skipped so
// storage only sees links we can trace back to the publisher.
function toCandidateItem(
  item: Parser.Item,
  index: number,
  source: Pick<SourceDefinition, "name" | "category">
): CandidateItem | null {
  const title = item.title?.trim() ?? "";
  const sourceUrl = item.link?.trim() ?? "";

  if (!title || !sourceUrl) {
    return null;
  }

  const publishedAt = toIsoDate(item.isoDate ?? item.pubDate);
  const externalId = item.guid?.trim() || sourceUrl;
  const summary = toSummary(
    item.contentSnippet ?? item.content ?? item.summary ?? readDescription(item)
  );

  return {
    rank: index + 1,
    category: source.category,
    title,
    sourceUrl,
    sourceName: source.name,
    externalId,
    ...(publishedAt ? { publishedAt } : {}),
    ...(summary ? { summary } : {})
  };
}

// The normalized issue date is only used as a coarse grouping key, so the newest item date is
// enough and avoids inventing feed-specific issue semantics.
function toIssueDate(publishedAt?: string): string {
  if (!publishedAt) {
    return "unknown-date";
  }

  return publishedAt.slice(0, 10);
}

// RSS publishers mix RFC2822 strings and ISO strings, so parse once here and keep the stored
// value consistent for later sorting and persistence.
function toIsoDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

// Summaries should stay readable text because later ranking and rendering paths do not expect
// raw HTML fragments from RSS descriptions.
function toSummary(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  // RSS descriptions often contain markup, so normalize them to plain text before downstream
  // storage and ranking logic sees them.
  const summary = cheerio.load(`<div>${value}</div>`)("div").text().replace(/\s+/g, " ").trim();
  return summary || undefined;
}

// `rss-parser` does not type `description`, so read it through one small compatibility shim
// instead of widening the parser type across the whole module.
function readDescription(item: Parser.Item): string | undefined {
  return (item as Parser.Item & { description?: string }).description;
}
