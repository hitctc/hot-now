import type { SourceDefinition, SourceKind } from "./types.js";

export const BUILTIN_SOURCES: Record<SourceKind, SourceDefinition> = {
  // The catalog keeps the built-in source metadata in one place so adapters and tests do not
  // drift away from the SQLite seed defaults.
  juya: {
    kind: "juya",
    name: "Juya AI Daily",
    siteUrl: "https://imjuya.github.io/juya-ai-daily/",
    rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml",
    category: "热点资讯"
  },
  openai: {
    kind: "openai",
    name: "OpenAI",
    siteUrl: "https://openai.com/news/",
    rssUrl: "https://openai.com/news/rss.xml",
    category: "最新 AI 消息"
  },
  google_ai: {
    kind: "google_ai",
    name: "Google AI",
    siteUrl: "https://blog.google/technology/ai/",
    rssUrl: "https://blog.google/technology/ai/rss/",
    category: "最新 AI 消息"
  },
  techcrunch_ai: {
    kind: "techcrunch_ai",
    name: "TechCrunch AI",
    siteUrl: "https://techcrunch.com/category/artificial-intelligence/",
    rssUrl: "https://techcrunch.com/category/artificial-intelligence/feed/",
    category: "热门文章"
  }
};
