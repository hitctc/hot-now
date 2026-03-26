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

  const date = latestItem.title?.trim();
  if (!date) {
    throw new Error("RSS issue item is missing title");
  }

  const issueUrl = latestItem.link?.trim();
  if (!issueUrl) {
    throw new Error("RSS issue item is missing link");
  }

  const html = latestItem["content:encoded"]?.trim() ?? latestItem.content?.trim();
  if (!html) {
    throw new Error("RSS issue item is missing content");
  }

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
      items.push({ rank, category: currentCategory, title, sourceUrl: link });
    }
  });

  return { date, issueUrl, items };
}
