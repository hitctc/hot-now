import type { SourceDefinition, SourceKind } from "./types.js";

export const BUILTIN_SOURCES: Record<SourceKind, SourceDefinition> = {
  // The catalog keeps the built-in source metadata in one place so adapters and tests do not
  // drift away from the SQLite seed defaults.
  juya: {
    kind: "juya",
    name: "Juya AI Daily",
    siteUrl: "https://imjuya.github.io/juya-ai-daily/",
    rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml",
    navigationViews: ["hot", "ai"],
    category: "热点资讯",
    sourceType: "aggregator",
    sourcePriority: 70
  },
  openai: {
    kind: "openai",
    name: "OpenAI",
    siteUrl: "https://openai.com/news/",
    rssUrl: "https://openai.com/news/rss.xml",
    navigationViews: ["articles", "ai"],
    category: "最新 AI 消息",
    sourceType: "official",
    sourcePriority: 95
  },
  google_ai: {
    kind: "google_ai",
    name: "Google AI",
    siteUrl: "https://blog.google/technology/ai/",
    rssUrl: "https://blog.google/technology/ai/rss/",
    navigationViews: ["articles", "ai"],
    category: "最新 AI 消息",
    sourceType: "official",
    sourcePriority: 92
  },
  kr36: {
    kind: "kr36",
    name: "36氪",
    siteUrl: "https://36kr.com/",
    rssUrl: "https://36kr.com/feed",
    navigationViews: ["hot", "articles"],
    category: "热点资讯",
    sourceType: "media",
    sourcePriority: 88
  },
  kr36_newsflash: {
    kind: "kr36_newsflash",
    name: "36氪快讯",
    siteUrl: "https://36kr.com/newsflashes/catalog/2",
    rssUrl: "https://36kr.com/feed-newsflash",
    navigationViews: ["hot"],
    category: "热点新闻",
    sourceType: "media",
    sourcePriority: 86
  },
  techcrunch_ai: {
    kind: "techcrunch_ai",
    name: "TechCrunch AI",
    siteUrl: "https://techcrunch.com/category/artificial-intelligence/",
    rssUrl: "https://techcrunch.com/category/artificial-intelligence/feed/",
    navigationViews: ["articles", "ai"],
    category: "热门文章",
    sourceType: "media",
    sourcePriority: 84
  },
  aifanr: {
    kind: "aifanr",
    name: "爱范儿",
    siteUrl: "https://www.ifanr.com/",
    rssUrl: "https://www.ifanr.com/feed",
    navigationViews: ["articles", "ai"],
    category: "AI 科技",
    sourceType: "media",
    sourcePriority: 82
  },
  ithome: {
    kind: "ithome",
    name: "IT之家",
    siteUrl: "https://www.ithome.com/",
    rssUrl: "https://www.ithome.com/rss/",
    navigationViews: ["articles"],
    category: "科技热点",
    sourceType: "media",
    sourcePriority: 78
  }
};

export function resolveBuiltinSourceDefinition(kind: string): SourceDefinition {
  const source = BUILTIN_SOURCES[kind as SourceKind];

  if (!source) {
    throw new Error(`Unsupported content source kind: "${kind}"`);
  }

  return source;
}
