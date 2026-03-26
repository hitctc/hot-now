import type { ArticleResult } from "../fetch/extractArticle.js";

export type RankedInput = {
  rank: number;
  category: string;
  title: string;
  sourceUrl: string;
  article: ArticleResult;
};

export type Topic = {
  topicKey: string;
  score: number;
  category: string;
  headline: string;
  items: RankedInput[];
};

const PRIORITY_BONUS: Record<string, number> = {
  要闻: 30,
  模型发布: 20,
  开发生态: 15
};

const TOPIC_KEYWORDS = [
  { key: "lyria", patterns: ["lyria"] },
  { key: "claude", patterns: ["claude"] },
  { key: "figma", patterns: ["figma"] }
];

// This clusters the same entity into one bucket and keeps the ordering deterministic for later reporting.
export function clusterTopics(items: RankedInput[]): Topic[] {
  const buckets = new Map<string, Topic>();

  for (const item of items) {
    const topicKey = deriveTopicKey(item);
    const score = scoreItem(item);
    const existing = buckets.get(topicKey);

    if (!existing) {
      buckets.set(topicKey, {
        topicKey,
        score,
        category: item.category,
        headline: item.title,
        items: [item]
      });
      continue;
    }

    existing.score += score + 10;
    existing.items.push(item);

    const bestItem = pickBestItem(existing.items);
    existing.headline = bestItem.title;
    existing.category = bestItem.category;
  }

  return [...buckets.values()].sort((left, right) => {
    const scoreDiff = right.score - left.score;

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return left.topicKey.localeCompare(right.topicKey);
  });
}

function scoreItem(item: RankedInput) {
  return 100 - item.rank + (PRIORITY_BONUS[item.category] ?? 0);
}

function deriveTopicKey(item: RankedInput) {
  const haystack = `${item.title} ${item.article.title} ${item.article.text}`.toLowerCase();

  for (const entry of TOPIC_KEYWORDS) {
    if (entry.patterns.some((pattern) => haystack.includes(pattern))) {
      return entry.key;
    }
  }

  const tokens = tokenizeTopicText(item.title);

  if (tokens.length > 0) {
    return tokens.slice(0, 2).join("-");
  }

  return `topic-${item.rank}`;
}

function pickBestItem(items: RankedInput[]) {
  return items.slice().sort(compareItems)[0];
}

function compareItems(left: RankedInput, right: RankedInput) {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }

  return left.sourceUrl.localeCompare(right.sourceUrl);
}

function tokenizeTopicText(text: string) {
  const normalized = text.normalize("NFKC").toLowerCase();
  const rawTokens = normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  const tokens: string[] = [];

  for (const token of rawTokens) {
    if (/^[\p{Script=Han}]+$/u.test(token)) {
      for (let index = 0; index < token.length; index += 2) {
        const chunk = token.slice(index, index + 2);
        if (chunk.length > 0) {
          tokens.push(chunk);
        }
      }
      continue;
    }

    if (token.length >= 2) {
      tokens.push(token);
    }
  }

  return [...new Set(tokens)];
}
