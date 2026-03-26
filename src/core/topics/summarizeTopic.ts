import type { Topic } from "./clusterTopics.js";

export type TopicSummary = {
  title: string;
  category: string;
  whyItMatters: string;
  summary: string;
  keywords: string[];
  relatedCount: number;
};

// This turns a clustered topic into a fixed report shape and deliberately avoids any HTML/report rendering concerns.
export function summarizeTopic(topic: Topic): TopicSummary {
  const bestItem = pickBestItem(topic.items);
  const body = collapseWhitespace(bestItem.article.ok ? bestItem.article.text : bestItem.title);

  return {
    title: topic.headline,
    category: topic.category,
    whyItMatters: `该主题当前聚合了 ${topic.items.length} 条候选信息，且最高源内排序为 #${bestItem.rank}。`,
    summary: body.slice(0, 140),
    keywords: extractKeywords(topic.headline),
    relatedCount: topic.items.length
  };
}

function pickBestItem(items: Topic["items"]) {
  // The summary always follows the strongest-ranked item so the explanation stays consistent with the topic order.
  return items.slice().sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }

    return left.sourceUrl.localeCompare(right.sourceUrl);
  })[0];
}

function collapseWhitespace(text: string) {
  // Report summaries should not preserve source formatting noise or repeated line breaks.
  return text.replace(/\s+/g, " ").trim();
}

function extractKeywords(title: string) {
  // Keywords stay title-only so the report remains deterministic even when article text changes.
  const normalized = title.normalize("NFKC");
  const rawTokens = normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const keywords: string[] = [];

  for (const token of rawTokens) {
    if (/^[\p{Script=Han}]+$/u.test(token)) {
      for (let index = 0; index < token.length; index += 2) {
        const chunk = token.slice(index, index + 2);
        if (chunk.length >= 2) {
          keywords.push(chunk);
        }
      }
      continue;
    }

    if (token.length >= 2) {
      keywords.push(token);
    }
  }

  return [...new Set(keywords)].slice(0, 5);
}
