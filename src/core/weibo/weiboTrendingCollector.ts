import type { SqliteDatabase } from "../db/openDatabase.js";
import type { LoadedSourceIssues } from "../source/loadEnabledSourceIssues.js";
import type { CandidateItem, LoadedIssue, SourceKind } from "../source/types.js";
import {
  fetchWeiboTrending,
  type WeiboFetch,
  type WeiboTrendingTopic
} from "./weiboTrendingApiClient.js";

export const weiboTrendingSourceKind = "weibo_trending" as SourceKind;
export const fixedWeiboTrendingKeywords = [
  "AI",
  "人工智能",
  "大模型",
  "模型",
  "OpenAI",
  "Claude",
  "Anthropic",
  "Gemini",
  "DeepSeek",
  "Kimi",
  "豆包",
  "智谱",
  "Agent",
  "智能体",
  "MCP",
  "AIGC",
  "机器人"
] as const;

export type CollectWeiboTrendingOptions = {
  fetch?: WeiboFetch;
  now?: Date;
};

type WeiboCandidateItem = CandidateItem & {
  metadataJson?: string;
};

// 微博这条链路不是全文搜索，只是把热搜榜里命中固定 AI 关键词的话题补进热点候选池。
export async function collectWeiboTrendingIssues(
  _db: SqliteDatabase,
  options: CollectWeiboTrendingOptions = {}
): Promise<LoadedSourceIssues> {
  const now = options.now ?? new Date();
  const fetchedAt = now.toISOString();
  const trending = await fetchWeiboTrending({ fetch: options.fetch });

  if (!trending.ok) {
    return Object.assign([], {
      failures: [
        {
          kind: weiboTrendingSourceKind,
          reason: trending.reason
        }
      ]
    });
  }

  const items = trending.topics.flatMap((topic, index) => mapTopicToCandidate(topic, index + 1));

  if (items.length === 0) {
    return Object.assign([], { failures: [] });
  }

  const issue: LoadedIssue = {
    date: fetchedAt.slice(0, 10),
    issueUrl: "https://s.weibo.com/top/summary",
    sourceKind: weiboTrendingSourceKind,
    sourceType: "aggregator",
    sourcePriority: 82,
    items
  };

  return Object.assign([issue], { failures: [] });
}

function mapTopicToCandidate(topic: WeiboTrendingTopic, rank: number): WeiboCandidateItem[] {
  const matchedKeywords = matchWeiboTrendingKeywords(topic.title);

  if (matchedKeywords.length === 0) {
    return [];
  }

  return [
    {
      rank,
      category: "social_trending",
      title: topic.title,
      sourceUrl: topic.url,
      sourceName: "微博热搜榜",
      externalId: `weibo:trending:${topic.id}`,
      summary: buildWeiboTrendingSummary(topic, matchedKeywords),
      metadataJson: JSON.stringify({
        collector: {
          kind: "weibo_trending"
        },
        matchedKeywords,
        hotValue: topic.hotValue,
        rank: topic.rank,
        label: topic.label,
        wordScheme: topic.wordScheme
      })
    }
  ];
}

function matchWeiboTrendingKeywords(title: string): string[] {
  const loweredTitle = title.toLowerCase();
  return [...new Set(fixedWeiboTrendingKeywords.filter((keyword) => loweredTitle.includes(keyword.toLowerCase())))];
}

function buildWeiboTrendingSummary(topic: WeiboTrendingTopic, matchedKeywords: string[]): string {
  const parts = [
    topic.rank ? `热搜排名 ${topic.rank}` : null,
    topic.hotValue ? `热度值 ${topic.hotValue}` : null,
    topic.label ? `标签 ${topic.label}` : null,
    `命中关键词 ${matchedKeywords.join("、")}`
  ].filter((value): value is string => typeof value === "string");

  return parts.join("；");
}
