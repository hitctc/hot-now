import Parser from "rss-parser";
import * as cheerio from "cheerio";
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

  const $ = cheerio.load(html);
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
        externalId: link
      });
    }
  });

  return { date, issueUrl, sourceKind: "juya", items };
}
