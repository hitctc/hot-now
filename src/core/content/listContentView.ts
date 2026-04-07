import type { SqliteDatabase } from "../db/openDatabase.js";
import { buildContentViewSelection, type ContentViewSelectionOptions } from "./buildContentViewSelection.js";

export type ContentViewKey = "hot" | "articles" | "ai";

export type ContentCardView = {
  id: number;
  title: string;
  summary: string;
  sourceName: string;
  sourceKind: string;
  canonicalUrl: string;
  publishedAt: string | null;
  contentScore: number;
  scoreBadges: string[];
  feedbackEntry?: {
    freeText: string | null;
    suggestedEffect: "boost" | "penalize" | "block" | "neutral" | null;
    strengthLevel: "low" | "medium" | "high" | null;
    positiveKeywords: string[];
    negativeKeywords: string[];
  };
};

export function listContentView(
  db: SqliteDatabase,
  viewKey: ContentViewKey,
  options: ContentViewSelectionOptions = {}
): ContentCardView[] {
  // The public content API still returns only the visible cards so existing callers stay unchanged.
  return buildContentViewSelection(db, viewKey, options).visibleCards.map(
    ({
      rankingScore: _rankingScore,
      rankingTimestamp: _rankingTimestamp,
      ...card
    }) => card
  );
}
