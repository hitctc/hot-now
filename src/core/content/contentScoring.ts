export type SourceType = "official" | "media" | "aggregator";

export type ContentScoringInput = {
  title: string;
  summary: string;
  bodyMarkdown: string;
  publishedAt: string | null;
  sourceKind: string;
};

export type ContentScoreBreakdown = {
  contentScore: number;
  badges: string[];
  freshnessScore: number;
  sourceScore: number;
  completenessScore: number;
  aiScore: number;
  heatScore: number;
};

const HOUR_MS = 60 * 60 * 1000;

const sourceTypeByKind: Record<string, SourceType> = {
  juya: "aggregator",
  openai: "official",
  google_ai: "official",
  techcrunch_ai: "media"
};

const aiKeywords = [
  "ai",
  "llm",
  "gpt",
  "agent",
  "model",
  "prompt",
  "openai",
  "claude",
  "deepseek",
  "大模型",
  "智能体"
];

const heatKeywords = [
  "breaking",
  "update",
  "launch",
  "release",
  "announcement",
  "roundup",
  "report",
  "analysis",
  "benchmark",
  "weekly",
  "hot",
  "trending",
  "发布",
  "上线",
  "更新",
  "快讯",
  "周报",
  "热点",
  "速览",
  "深度",
  "洞察"
];

// The scoring module owns all content signals so the list view can stay a thin mapper over DB rows.
export function scoreContentItem(
  input: ContentScoringInput,
  options?: {
    now?: Date | string | number;
  }
): ContentScoreBreakdown {
  const referenceTime = resolveReferenceTime(options?.now);
  const title = normalizeText(input.title);
  const summary = normalizeText(input.summary);
  const body = normalizeText(input.bodyMarkdown);
  const sourceType = resolveSourceType(input.sourceKind);
  const freshnessScore = scoreFreshness(input.publishedAt, referenceTime);
  const sourceScore = scoreSourceType(sourceType);
  const completenessScore = scoreCompleteness(summary, body);
  const aiScore = scoreKeywordSignals([title, summary, body], aiKeywords);
  const heatScore = scoreHeatSignals([title, summary, body], freshnessScore);
  const contentScore = clampScore(
    freshnessScore * 0.32 +
      sourceScore * 0.2 +
      completenessScore * 0.18 +
      aiScore * 0.18 +
      heatScore * 0.12
  );

  return {
    contentScore,
    badges: buildBadges({
      sourceType,
      freshnessScore,
      completenessScore,
      summaryLength: summary.length,
      bodyLength: body.length,
      aiScore,
      heatScore
    }),
    freshnessScore,
    sourceScore,
    completenessScore,
    aiScore,
    heatScore
  };
}

// Source type stays derived from the source catalog kind, which keeps the DB schema unchanged for Task 2.
export function resolveSourceType(sourceKind: string): SourceType {
  const normalizedKind = sourceKind.trim();

  if (normalizedKind in sourceTypeByKind) {
    return sourceTypeByKind[normalizedKind];
  }

  return "aggregator";
}

function resolveReferenceTime(now: Date | string | number | undefined): Date {
  // Tests can pin the clock, while production naturally falls back to the current wall time.
  if (now instanceof Date) {
    return now;
  }

  if (typeof now === "number") {
    return new Date(now);
  }

  if (typeof now === "string") {
    return new Date(now);
  }

  return new Date();
}

function scoreFreshness(publishedAt: string | null, referenceTime: Date): number {
  // Freshness declines in gentle tiers so very recent items still stand out without making older items vanish.
  if (!publishedAt) {
    return 12;
  }

  const parsedDate = new Date(publishedAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return 12;
  }

  const ageHours = Math.max(0, (referenceTime.getTime() - parsedDate.getTime()) / HOUR_MS);

  if (ageHours <= 24) {
    return 100;
  }

  if (ageHours <= 48) {
    return 84;
  }

  if (ageHours <= 72) {
    return 70;
  }

  if (ageHours <= 168) {
    return 48;
  }

  if (ageHours <= 336) {
    return 28;
  }

  return 12;
}

function scoreSourceType(sourceType: SourceType): number {
  // Trusted first-party sources get the strongest baseline, while aggregators still remain visible.
  switch (sourceType) {
    case "official":
      return 100;
    case "media":
      return 74;
    case "aggregator":
    default:
      return 58;
  }
}

function scoreCompleteness(summary: string, body: string): number {
  // The completeness tier rewards usable summary+body depth, not just raw byte length.
  const summaryLength = summary.trim().length;
  const bodyLength = body.trim().length;
  let score = 10;

  if (summaryLength >= 80) {
    score += 22;
  } else if (summaryLength >= 40) {
    score += 16;
  } else if (summaryLength >= 12) {
    score += 10;
  }

  if (bodyLength >= 320) {
    score += 68;
  } else if (bodyLength >= 160) {
    score += 56;
  } else if (bodyLength >= 80) {
    score += 40;
  } else if (bodyLength >= 1) {
    score += 18;
  }

  return clampScore(score);
}

function scoreKeywordSignals(texts: string[], keywords: string[]): number {
  // A small distinct-hit counter is enough here; repeated spammy words should not inflate the score too much.
  const haystack = texts.join(" ").toLowerCase();
  const hitCount = keywords.reduce((count, keyword) => count + (matchesKeyword(haystack, keyword) ? 1 : 0), 0);

  if (hitCount === 0) {
    return 0;
  }

  return clampScore(hitCount * 20);
}

function scoreHeatSignals(texts: string[], freshnessScore: number): number {
  // Heat mixes headline buzz with a small freshness boost so breaking items rise quickly but not indefinitely.
  const haystack = texts.join(" ").toLowerCase();
  const hitCount = heatKeywords.reduce((count, keyword) => count + (matchesKeyword(haystack, keyword) ? 1 : 0), 0);
  const freshnessBonus = freshnessScore >= 90 ? 18 : freshnessScore >= 70 ? 12 : freshnessScore >= 48 ? 6 : 0;

  return clampScore(hitCount * 18 + freshnessBonus);
}

function buildBadges(input: {
  sourceType: SourceType;
  freshnessScore: number;
  completenessScore: number;
  summaryLength: number;
  bodyLength: number;
  aiScore: number;
  heatScore: number;
}): string[] {
  // Badges stay short and human-readable so the card can explain the score without turning into a checklist.
  const badges: string[] = [];

  if (input.freshnessScore >= 95) {
    badges.push("24h 内");
  } else if (input.freshnessScore >= 70) {
    badges.push("3 天内");
  } else if (input.freshnessScore >= 48) {
    badges.push("7 天内");
  }

  if (input.sourceType === "official") {
    badges.push("官方源");
  } else if (input.sourceType === "media") {
    badges.push("媒体源");
  } else {
    badges.push("聚合源");
  }

  if (input.bodyLength >= 100) {
    badges.push("正文完整");
  } else if (input.summaryLength >= 60 || input.completenessScore >= 70) {
    badges.push("摘要充实");
  }

  if (input.aiScore >= 40) {
    badges.push("AI 相关");
  }

  if (input.heatScore >= 45) {
    badges.push("热点信号");
  }

  return badges.slice(0, 4);
}

function matchesKeyword(text: string, keyword: string): boolean {
  // English tokens use word boundaries, while Chinese phrases fall back to a plain substring match.
  if (/[a-z0-9]/i.test(keyword)) {
    return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text);
  }

  return text.includes(keyword.toLowerCase());
}

function escapeRegExp(value: string): string {
  // Regex escaping stays local so keyword matching does not depend on any extra utility module.
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value: string): string {
  // Text normalization keeps scoring stable even if the source text contains repeated whitespace.
  return value.trim().replace(/\s+/g, " ");
}

function clampScore(value: number): number {
  // Scores are presented as whole numbers on a 0-100 scale, so values are rounded and bounded here.
  return Math.max(0, Math.min(100, Math.round(value)));
}
