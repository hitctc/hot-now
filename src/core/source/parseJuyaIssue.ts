import Parser from "rss-parser";
import * as cheerio from "cheerio";

export type CandidateItem = {
  rank: number;
  category: string;
  title: string;
  sourceUrl: string;
};

export type DailyIssue = {
  date: string;
  issueUrl: string;
  items: CandidateItem[];
};

const parser = new Parser();

export async function parseJuyaIssue(feedXml: string): Promise<DailyIssue> {
  const feed = await parser.parseString(feedXml);
  const latestItem = feed.items[0];

  if (!latestItem) {
    throw new Error("RSS feed does not contain any issue items");
  }

  const date = latestItem.title ?? "unknown-date";
  const issueUrl = latestItem.link ?? "";
  const html = latestItem["content:encoded"] ?? latestItem.content ?? "";
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
    const rank = Number(rankText.replace("#", ""));
    const title = $(element)
      .clone()
      .find("a, code")
      .remove()
      .end()
      .text()
      .replace("↗", "")
      .trim();

    if (link && Number.isFinite(rank) && title) {
      items.push({ rank, category: currentCategory, title, sourceUrl: link });
    }
  });

  return { date, issueUrl, items };
}
