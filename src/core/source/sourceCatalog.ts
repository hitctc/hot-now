import type { BuiltinSourceKind, SourceDefinition } from "./types.js";

export const BUILTIN_SOURCES: Record<BuiltinSourceKind, SourceDefinition> = {
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
  },
  zhihu_daily: {
    kind: "zhihu_daily",
    name: "知乎每日精选",
    siteUrl: "https://www.zhihu.com/",
    rssUrl: "https://www.zhihu.com/rss",
    navigationViews: ["hot", "articles"],
    category: "精选问答",
    sourceType: "aggregator",
    sourcePriority: 77
  },
  sspai: {
    kind: "sspai",
    name: "少数派",
    siteUrl: "https://sspai.com/",
    rssUrl: "https://sspai.com/feed",
    navigationViews: ["articles", "ai"],
    category: "效率工具",
    sourceType: "media",
    sourcePriority: 76
  },
  chinaz: {
    kind: "chinaz",
    name: "站长之家",
    siteUrl: "https://www.chinaz.com/",
    rssUrl: "https://app.chinaz.com/?app=rss",
    navigationViews: ["hot", "articles"],
    category: "行业资讯",
    sourceType: "media",
    sourcePriority: 74
  },
  huxiu: {
    kind: "huxiu",
    name: "虎嗅网",
    siteUrl: "https://www.huxiu.com/",
    rssUrl: "https://www.huxiu.com/rss/0.xml",
    navigationViews: ["hot", "articles"],
    category: "科技热点",
    sourceType: "media",
    sourcePriority: 80
  },
  dgtle: {
    kind: "dgtle",
    name: "数字尾巴",
    siteUrl: "https://www.dgtle.com/",
    rssUrl: "https://www.dgtle.com/rss/dgtle.xml",
    navigationViews: ["articles"],
    category: "数码资讯",
    sourceType: "media",
    sourcePriority: 68
  },
  cnblogs: {
    kind: "cnblogs",
    name: "Cnblogs",
    siteUrl: "https://www.cnblogs.com/",
    rssUrl: "https://feed.cnblogs.com/blog/sitehome/rss",
    navigationViews: ["articles", "ai"],
    category: "开发者文章",
    sourceType: "aggregator",
    sourcePriority: 72
  },
  v2ex: {
    kind: "v2ex",
    name: "V2EX",
    siteUrl: "https://www.v2ex.com/",
    rssUrl: "https://www.v2ex.com/feed/tab/tech.xml",
    navigationViews: ["articles", "ai"],
    category: "技术讨论",
    sourceType: "aggregator",
    sourcePriority: 71
  },
  cyzone: {
    kind: "cyzone",
    name: "创业邦",
    siteUrl: "https://www.cyzone.cn/",
    rssUrl: "https://www.cyzone.cn/rss/",
    navigationViews: ["hot", "articles"],
    category: "创投资讯",
    sourceType: "media",
    sourcePriority: 73
  },
  geekpark: {
    kind: "geekpark",
    name: "极客公园",
    siteUrl: "https://www.geekpark.net/",
    rssUrl: "https://www.geekpark.net/rss",
    navigationViews: ["articles", "ai"],
    category: "AI 科技",
    sourceType: "media",
    sourcePriority: 79
  },
  appinn: {
    kind: "appinn",
    name: "小众软件",
    siteUrl: "https://www.appinn.com/",
    rssUrl: "https://feeds.appinn.com/appinns/",
    navigationViews: ["articles"],
    category: "效率工具",
    sourceType: "media",
    sourcePriority: 69
  },
  wikipedia: {
    kind: "wikipedia",
    name: "维基百科",
    siteUrl: "https://www.wikipedia.org/",
    rssUrl: "https://feedx.net/rss/wikiindex.xml",
    navigationViews: ["articles"],
    category: "百科动态",
    sourceType: "aggregator",
    sourcePriority: 63
  },
  guangming_daily: {
    kind: "guangming_daily",
    name: "光明日报",
    siteUrl: "https://www.gmw.cn/",
    rssUrl: "https://feedx.net/rss/guangmingribao.xml",
    navigationViews: ["hot", "articles"],
    category: "综合新闻",
    sourceType: "aggregator",
    sourcePriority: 62
  },
  williamlong_blog: {
    kind: "williamlong_blog",
    name: "月光博客",
    siteUrl: "https://www.williamlong.info/",
    rssUrl: "https://www.williamlong.info/rss.xml",
    navigationViews: ["articles", "ai"],
    category: "科技博客",
    sourceType: "media",
    sourcePriority: 67
  }
};

// Built-in source checks stay centralized here so loader code can decide whether to use a
// hand-tuned adapter or fall back to the generic RSS parser for user-defined rows.
export function isBuiltinSourceKind(kind: string): kind is BuiltinSourceKind {
  return Object.hasOwn(BUILTIN_SOURCES, kind);
}

export function resolveBuiltinSourceDefinition(kind: string): SourceDefinition {
  const source = isBuiltinSourceKind(kind) ? BUILTIN_SOURCES[kind] : undefined;

  if (!source) {
    throw new Error(`Unsupported content source kind: "${kind}"`);
  }

  return source;
}
