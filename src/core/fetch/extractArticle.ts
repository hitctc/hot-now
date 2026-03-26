import { Readability } from "@mozilla/readability";
import { createRequire } from "node:module";

export type ArticleResult =
  | { ok: true; url: string; title: string; text: string; siteName?: string }
  | { ok: false; url: string; title: string; text: string; error: string };

const MAX_ARTICLE_TEXT_LENGTH = 6000;
const MIN_FALLBACK_TEXT_LENGTH = 80;
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom") as {
  JSDOM: new (html: string, options: { url: string }) => { window: { document: Document } };
};

export async function extractArticle(url: string, html: string): Promise<ArticleResult> {
  try {
    // Readability handles the main-content guesswork so downstream clustering gets a stable text block.
    const dom = new JSDOM(html, { url });
    const parsed = new Readability(dom.window.document).parse();
    const text = parsed?.textContent?.trim();

    if (!text || !hasReadableBody(parsed?.content ?? "", text)) {
      return {
        ok: false,
        url,
        title: parsed?.title ?? "",
        text: "",
        error: "Readable text not found"
      };
    }

    return {
      ok: true,
      url,
      title: parsed?.title ?? "",
      text: text.slice(0, MAX_ARTICLE_TEXT_LENGTH),
      siteName: parsed?.siteName ?? undefined
    };
  } catch (error) {
    return {
      ok: false,
      url,
      title: "",
      text: "",
      error: error instanceof Error ? error.message : "Unknown extraction error"
    };
  }
}

function hasReadableBody(content: string, text: string) {
  // Short fragments without paragraph structure are usually menus or labels, not article bodies.
  return content.includes("<p") || text.length >= MIN_FALLBACK_TEXT_LENGTH;
}

export async function fetchAndExtractArticle(url: string): Promise<ArticleResult> {
  try {
    // Fetch stays single-shot here; retries and scheduling belong to later pipeline tasks.
    const response = await fetch(url);

    if (response.status !== 200) {
      return {
        ok: false,
        url,
        title: "",
        text: "",
        error: `HTTP ${response.status}`
      };
    }

    return extractArticle(url, await response.text());
  } catch (error) {
    return {
      ok: false,
      url,
      title: "",
      text: "",
      error: error instanceof Error ? error.message : "Unknown fetch error"
    };
  }
}
