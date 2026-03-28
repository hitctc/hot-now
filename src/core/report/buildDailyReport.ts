import type { Topic } from "../topics/clusterTopics.js";
import { summarizeTopic } from "../topics/summarizeTopic.js";

export type DailyReportTrigger = "manual" | "scheduled";

export type DailyReportIssue = {
  date: string;
  issueUrl: string;
  issueUrls: string[];
  sourceKinds: string[];
  items: readonly unknown[];
};

export type DailyReportRelatedItem = {
  sourceRank: number;
  sourceCategory: string;
  sourceTitle: string;
  sourceUrl: string;
  articleOk: boolean;
  articleTitle: string;
  articleSummary: string;
};

export type DailyReportTopic = {
  rank: number;
  title: string;
  category: string;
  whyItMatters: string;
  summary: string;
  keywords: string[];
  relatedCount: number;
  relatedItems: DailyReportRelatedItem[];
};

export type DailyReport = {
  meta: {
    date: string;
    generatedAt: string;
    trigger: DailyReportTrigger;
    issueUrl: string;
    issueUrls: string[];
    sourceKinds: string[];
    topicCount: number;
    degraded: boolean;
    mailStatus: string;
    sourceFailureCount: number;
    failedSourceKinds: string[];
  };
  topics: DailyReportTopic[];
};

export type BuildDailyReportParams = {
  issue: DailyReportIssue;
  trigger: DailyReportTrigger;
  topics: Topic[];
  topN: number;
};

// This builds the persisted report payload and keeps report-specific defaults in one place.
export function buildDailyReport({ issue, trigger, topics, topN }: BuildDailyReportParams): DailyReport {
  const safeTopN = normalizeTopN(topN);
  const reportTopics = topics.slice(0, safeTopN).map((topic, index) => ({
    rank: index + 1,
    ...summarizeTopic(topic),
    relatedItems: topic.items.map(mapRelatedItem)
  }));

  return {
    meta: {
      date: issue.date,
      generatedAt: new Date().toISOString(),
      trigger,
      issueUrl: issue.issueUrl,
      issueUrls: issue.issueUrls,
      sourceKinds: issue.sourceKinds,
      topicCount: Math.min(safeTopN, topics.length),
      degraded: hasDegradedContent(topics),
      mailStatus: "pending",
      sourceFailureCount: 0,
      failedSourceKinds: []
    },
    topics: reportTopics
  };
}

// Task 6 only needs a bounded positive count; invalid values collapse to zero so the report stays deterministic.
function normalizeTopN(topN: number) {
  return Number.isFinite(topN) ? Math.max(0, Math.floor(topN)) : 0;
}

// A single failed article is enough to mark the whole report as degraded because the pipeline surfaced partial data.
function hasDegradedContent(topics: Topic[]) {
  return topics.some((topic) => topic.items.some((item) => !item.article.ok));
}

// Related items keep the source-level metadata intact so the report can point back to the original candidates.
function mapRelatedItem(item: Topic["items"][number]): DailyReportRelatedItem {
  return {
    sourceRank: item.rank,
    sourceCategory: item.category,
    sourceTitle: item.title,
    sourceUrl: item.sourceUrl,
    articleOk: item.article.ok,
    articleTitle: item.article.title,
    articleSummary: item.article.text.slice(0, 240)
  };
}
