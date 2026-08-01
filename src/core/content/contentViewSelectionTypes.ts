import type { ContentCardView } from "./listContentView.js";

/** 内容页允许的最终展示排序方式。 */
export type ContentSortMode = "published_at" | "content_score";

/** 已完成评分但尚未剥离选择器内部字段的内容卡片。 */
export type RankedContentCardView = ContentCardView & {
  rankingScore: number;
  rankingTimestamp: string | null;
};

/** 选择器内部使用的候选卡片，额外携带过滤与完整展示标记。 */
export type RankedContentCardCandidate = RankedContentCardView & {
  isBlocked: boolean;
  showAllWhenSelected: boolean;
};
