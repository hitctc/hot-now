import type { AiTimelineEventType } from "./aiTimelineTypes.js";

export type OfficialAiTimelineSource = {
  companyKey: string;
  companyName: string;
  sourceLabel: string;
  sourceKind: string;
  feedUrl: string;
  allowedUrlPrefixes: readonly string[];
  defaultEventType: AiTimelineEventType;
};

// 第一版只放已经确认的官方 RSS，宁可少也不把二手来源混进官方时间线。
export const officialAiTimelineSources = [
  {
    companyKey: "openai",
    companyName: "OpenAI",
    sourceLabel: "OpenAI News",
    sourceKind: "official_blog",
    feedUrl: "https://openai.com/news/rss.xml",
    allowedUrlPrefixes: ["https://openai.com/"],
    defaultEventType: "产品应用"
  },
  {
    companyKey: "google_ai",
    companyName: "Google AI",
    sourceLabel: "Google AI Blog",
    sourceKind: "official_blog",
    feedUrl: "https://blog.google/technology/ai/rss/",
    allowedUrlPrefixes: ["https://blog.google/technology/ai/"],
    defaultEventType: "行业动态"
  }
] as const satisfies readonly OfficialAiTimelineSource[];
