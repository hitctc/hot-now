import type { SqliteDatabase } from "../db/openDatabase.js";
import { scoreContentItem, type ContentScoreBreakdown } from "./contentScoring.js";
import {
  listTwitterAccountContentItemIds,
  listVisibleTwitterKeywordMatchContentItemIds,
  listVisibleTwitterKeywordMatchContentItemIdsByKeywordIds,
  listWechatRssContentItemIds
} from "./contentRepository.js";
import { BUILTIN_SOURCES } from "../source/sourceCatalog.js";
import {
  getInternalViewRuleConfig,
  type ViewRuleConfigValues
} from "../viewRules/viewRuleConfig.js";
import type { ContentCardView, ContentViewKey } from "./listContentView.js";
import type { NlEvaluationDecision } from "../strategy/nlEvaluationRepository.js";
import type { StrategyGateScope } from "../strategy/strategyGateScopes.js";

export type ContentViewSelectionOptions = {
  includeNlEvaluations?: boolean;
  selectedSourceKinds?: string[];
  selectedTwitterAccountIds?: number[];
  selectedTwitterKeywordIds?: number[];
  selectedWechatRssSourceIds?: number[];
  referenceTime?: Date;
  limitOverride?: number;
  sortMode?: ContentSortMode;
  ruleConfig?: ViewRuleConfigValues;
};

export type ContentSortMode = "published_at" | "content_score";

export type RankedContentCardView = ContentCardView & {
  rankingScore: number;
  rankingTimestamp: string | null;
};

export type CurrentPageSourceMetrics = {
  todayCandidateCount: number;
  todayVisibleCount: number;
  todayVisibleShare: number;
};

export type IndependentSourceViewMetrics = {
  candidateCount: number;
  visibleCount: number;
  visibleShare: number;
};

export type ContentViewSelection = {
  candidateCards: RankedContentCardView[];
  visibleCards: RankedContentCardView[];
  visibleCountsBySourceKind: Record<string, number>;
  currentPageMetricsBySourceKind: Record<string, CurrentPageSourceMetrics>;
  currentPageTodayVisibleCount: number;
};

type RankedContentCardCandidate = RankedContentCardView & {
  isBlocked: boolean;
  showAllWhenSelected: boolean;
};

type ContentCardRow = {
  id: number;
  title: string;
  summary: string | null;
  bodyMarkdown: string | null;
  metadataJson: string | null;
  sourceName: string;
  sourceKind: string;
  showAllWhenSelected: number;
  canonicalUrl: string;
  publishedAt: string | null;
  feedbackEntryId: number | null;
  feedbackFreeText: string | null;
  feedbackSuggestedEffect: string | null;
  feedbackStrengthLevel: string | null;
  feedbackPositiveKeywordsJson: string | null;
  feedbackNegativeKeywordsJson: string | null;
  rankingTimestamp: string | null;
  baseDecision: string | null;
  baseScoreDelta: number | null;
  viewDecision: string | null;
  viewScoreDelta: number | null;
};

const matchingSourceViewBonus = 120;
const twitterAccountsSourceKind = "twitter_accounts";
const twitterKeywordSearchSourceKind = "twitter_keyword_search";
const wechatRssSourceKind = "wechat_rss";
const bilibiliSourceKind = "bilibili_search";
const hackerNewsSourceKind = "hackernews_search";
const hotOnlySourceKinds = new Set(["weibo_trending"]);

const contentSelectSql = `
  SELECT
    ci.id AS id,
    ci.title AS title,
    ci.summary AS summary,
    ci.body_markdown AS bodyMarkdown,
    ci.metadata_json AS metadataJson,
    cs.name AS sourceName,
    cs.kind AS sourceKind,
    cs.show_all_when_selected AS showAllWhenSelected,
    ci.canonical_url AS canonicalUrl,
    ci.published_at AS publishedAt,
    fp.id AS feedbackEntryId,
    fp.free_text AS feedbackFreeText,
    fp.suggested_effect AS feedbackSuggestedEffect,
    fp.strength_level AS feedbackStrengthLevel,
    fp.positive_keywords_json AS feedbackPositiveKeywordsJson,
    fp.negative_keywords_json AS feedbackNegativeKeywordsJson,
    base_eval.decision AS baseDecision,
    base_eval.score_delta AS baseScoreDelta,
    view_eval.decision AS viewDecision,
    view_eval.score_delta AS viewScoreDelta,
    COALESCE(ci.published_at, ci.fetched_at, ci.created_at) AS rankingTimestamp
  FROM content_items ci
  JOIN content_sources cs ON cs.id = ci.source_id
  LEFT JOIN feedback_pool fp ON fp.content_item_id = ci.id
  LEFT JOIN content_nl_evaluations base_eval
    ON base_eval.content_item_id = ci.id
   AND base_eval.scope = 'base'
  LEFT JOIN content_nl_evaluations view_eval
    ON view_eval.content_item_id = ci.id
   AND view_eval.scope = @viewScope
  ORDER BY datetime(COALESCE(ci.published_at, ci.fetched_at, ci.created_at)) DESC, ci.id DESC
`;

export function buildContentViewSelection(
  db: SqliteDatabase,
  viewKey: ContentViewKey,
  options: ContentViewSelectionOptions = {}
): ContentViewSelection {
  // Shared selection keeps one exact candidate/visible pipeline for content pages and system analytics.
  const viewRuleConfig = options.ruleConfig ?? getInternalViewRuleConfig(viewKey);
  const referenceTime = options.referenceTime ?? new Date();
  const includeNlEvaluations = options.includeNlEvaluations ?? true;
  const sortMode = options.sortMode;
  const selectedSourceKinds = normalizeSelectedSourceKinds(options.selectedSourceKinds);
  const rows = db
    .prepare(contentSelectSql)
    .all({ viewScope: mapViewScope(viewKey) }) as ContentCardRow[];
  const visibleRows = filterTwitterScopedRows(db, rows, {
    selectedTwitterAccountIds: options.selectedTwitterAccountIds,
    selectedTwitterKeywordIds: options.selectedTwitterKeywordIds,
    selectedWechatRssSourceIds: options.selectedWechatRssSourceIds
  });
  const rankedCandidates = visibleRows
    .map((row) =>
      buildRankedCardCandidate(row, {
        viewKey,
        viewRuleConfig,
        referenceTime,
        includeNlEvaluations
      })
    )
    .filter((card) => !card.isBlocked);
  const rankedCards = rankedCandidates
    .filter((card) => selectedSourceKinds === null || selectedSourceKinds.has(card.sourceKind))
    .sort((left, right) => compareBySelectionOrder(viewRuleConfig, left, right));
  const limit = resolveVisibleLimit(viewKey, options.limitOverride ?? viewRuleConfig.limit);
  const fullDisplaySourceKinds =
    selectedSourceKinds === null
      ? new Set<string>()
      : new Set(
          rankedCards
            .filter((card) => card.showAllWhenSelected && selectedSourceKinds.has(card.sourceKind))
            .map((card) => card.sourceKind)
        );
  const visibleCards = [
    ...rankedCards.filter((card) => fullDisplaySourceKinds.has(card.sourceKind)),
    ...rankedCards.filter((card) => !fullDisplaySourceKinds.has(card.sourceKind)).slice(0, limit)
  ]
    .sort((left, right) => compareVisibleCards(sortMode, viewRuleConfig, left, right))
    .map(stripInternalSelectionCard);
  // 旧来源 tag 仍暂时保留稳定单来源口径，便于旧调用方在这轮迁移里逐步切换。
  const visibleCountsBySourceKind = countStableVisibleCardsBySourceKind(rankedCandidates, limit);
  const currentPageMetricsBySourceKind = countCurrentPageMetricsBySourceKind(
    rankedCards,
    visibleCards,
    referenceTime
  );
  const currentPageTodayVisibleCount = Object.values(currentPageMetricsBySourceKind)
    .reduce((sum, entry) => sum + entry.todayVisibleCount, 0);

  return {
    candidateCards: rankedCards.map(stripInternalSelectionCard),
    visibleCards,
    visibleCountsBySourceKind,
    currentPageMetricsBySourceKind: applyCurrentPageVisibleShares(
      currentPageMetricsBySourceKind,
      currentPageTodayVisibleCount
    ),
    currentPageTodayVisibleCount
  };
}

export function collectIndependentTodayStatsBySourceForView(
  db: SqliteDatabase,
  viewKey: ContentViewKey,
  sourceKinds: string[],
  options: Pick<ContentViewSelectionOptions, "includeNlEvaluations" | "referenceTime"> = {}
): Map<string, CurrentPageSourceMetrics> {
  const metrics = collectIndependentStatsBySourceForView(db, viewKey, sourceKinds, {
    ...options,
    countWindow: "today"
  });

  return new Map(
    [...metrics.entries()].map(([sourceKind, metric]) => [
      sourceKind,
      {
        todayCandidateCount: metric.candidateCount,
        todayVisibleCount: metric.visibleCount,
        todayVisibleShare: metric.visibleShare
      }
    ])
  );
}

export function collectIndependentStatsBySourceForView(
  db: SqliteDatabase,
  viewKey: ContentViewKey,
  sourceKinds: string[],
  options: Pick<
    ContentViewSelectionOptions,
    | "includeNlEvaluations"
    | "referenceTime"
    | "selectedTwitterAccountIds"
    | "selectedTwitterKeywordIds"
    | "selectedWechatRssSourceIds"
  > & {
    countWindow?: "today" | "all" | "last_24_hours";
    ruleConfig?: ViewRuleConfigValues;
  } = {}
): Map<string, IndependentSourceViewMetrics> {
  // Source workbench only needs per-source independent metrics, so one grouped pass per view is enough.
  if (sourceKinds.length === 0) {
    return new Map();
  }

  const viewRuleConfig = options.ruleConfig ?? getInternalViewRuleConfig(viewKey);
  const referenceTime = options.referenceTime ?? new Date();
  const includeNlEvaluations = options.includeNlEvaluations ?? true;
  const sourceKindSet = new Set(sourceKinds);
  const rows = db
    .prepare(contentSelectSql)
    .all({ viewScope: mapViewScope(viewKey) }) as ContentCardRow[];
  const visibleRows = filterTwitterScopedRows(db, rows, {
    selectedTwitterAccountIds: options.selectedTwitterAccountIds,
    selectedTwitterKeywordIds: options.selectedTwitterKeywordIds,
    selectedWechatRssSourceIds: options.selectedWechatRssSourceIds
  });
  const rankedCandidates = visibleRows
    .map((row) =>
      buildRankedCardCandidate(row, {
        viewKey,
        viewRuleConfig,
        referenceTime,
        includeNlEvaluations
      })
    )
    .filter((card) => !card.isBlocked && sourceKindSet.has(card.sourceKind));
  const candidatesBySourceKind = new Map<string, RankedContentCardCandidate[]>();

  for (const sourceKind of sourceKinds) {
    candidatesBySourceKind.set(sourceKind, []);
  }

  for (const card of rankedCandidates) {
    const cards = candidatesBySourceKind.get(card.sourceKind);

    if (!cards) {
      continue;
    }

    cards.push(card);
  }

  const { shanghaiDayStart, shanghaiNextDayStart } = buildShanghaiDayRange(referenceTime);
  const independentMetrics = new Map<string, IndependentSourceViewMetrics>();
  let currentPageVisibleCount = 0;

  for (const [sourceKind, cards] of candidatesBySourceKind.entries()) {
    cards.sort((left, right) => compareBySelectionOrder(viewRuleConfig, left, right));

    const visibleCards =
      cards.length > 0 && cards[0]?.showAllWhenSelected
        ? cards
        : cards.slice(0, resolveVisibleLimit(viewKey, viewRuleConfig.limit));
    const metrics = {
      candidateCount: countCardsForWindow(cards, referenceTime, options.countWindow, shanghaiDayStart, shanghaiNextDayStart),
      visibleCount: countCardsForWindow(
        visibleCards,
        referenceTime,
        options.countWindow,
        shanghaiDayStart,
        shanghaiNextDayStart
      ),
      visibleShare: 0
    };

    independentMetrics.set(sourceKind, metrics);
    currentPageVisibleCount += metrics.visibleCount;
  }

  return new Map(
    [...independentMetrics.entries()].map(([sourceKind, metrics]) => [
      sourceKind,
      {
        ...metrics,
        visibleShare:
          currentPageVisibleCount > 0
            ? metrics.visibleCount / currentPageVisibleCount
            : 0
      }
    ])
  );
}

function countCardsForWindow(
  cards: Array<Pick<RankedContentCardView, "publishedAt" | "rankingTimestamp">>,
  referenceTime: Date,
  countWindow: "today" | "all" | "last_24_hours" | undefined,
  shanghaiDayStart: string,
  shanghaiNextDayStart: string
) {
  if (countWindow === "all") {
    return cards.length;
  }

  if (countWindow === "last_24_hours") {
    return countCardsWithinLastHours(cards, referenceTime, 24);
  }

  return countCardsWithinShanghaiDay(cards, shanghaiDayStart, shanghaiNextDayStart);
}

// 隐藏聚合来源的二级筛选都在这里统一处理，避免内容页和统计页各自解析 metadata。
function filterTwitterScopedRows(
  db: SqliteDatabase,
  rows: ContentCardRow[],
  options: {
    selectedTwitterAccountIds?: number[];
    selectedTwitterKeywordIds?: number[];
    selectedWechatRssSourceIds?: number[];
  }
) {
  const twitterAccountRows = rows.filter((row) => row.sourceKind === twitterAccountsSourceKind);
  const twitterKeywordRows = rows.filter((row) => row.sourceKind === twitterKeywordSearchSourceKind);
  const wechatRssRows = rows.filter((row) => row.sourceKind === wechatRssSourceKind);

  if (twitterAccountRows.length === 0 && twitterKeywordRows.length === 0 && wechatRssRows.length === 0) {
    return rows;
  }

  const visibleTwitterKeywordContentItemIdSet = new Set(
    listVisibleTwitterKeywordMatchContentItemIds(
      db,
      twitterKeywordRows.map((row) => row.id)
    )
  );
  const selectedTwitterAccountContentItemIdSet = options.selectedTwitterAccountIds === undefined
    ? null
    : new Set(
        listTwitterAccountContentItemIds(
          db,
          twitterAccountRows.map((row) => row.id),
          options.selectedTwitterAccountIds
        )
      );
  const selectedTwitterKeywordContentItemIdSet = options.selectedTwitterKeywordIds === undefined
    ? null
    : new Set(
        listVisibleTwitterKeywordMatchContentItemIdsByKeywordIds(
          db,
          twitterKeywordRows.map((row) => row.id),
          options.selectedTwitterKeywordIds
        )
      );
  const selectedWechatRssContentItemIdSet = options.selectedWechatRssSourceIds === undefined
    ? null
    : new Set(
        listWechatRssContentItemIds(
          db,
          wechatRssRows.map((row) => row.id),
          options.selectedWechatRssSourceIds
        )
      );

  return rows.filter((row) => {
    if (row.sourceKind === twitterAccountsSourceKind) {
      return selectedTwitterAccountContentItemIdSet === null || selectedTwitterAccountContentItemIdSet.has(row.id);
    }

    if (row.sourceKind === twitterKeywordSearchSourceKind) {
      if (!visibleTwitterKeywordContentItemIdSet.has(row.id)) {
        return false;
      }

      return selectedTwitterKeywordContentItemIdSet === null || selectedTwitterKeywordContentItemIdSet.has(row.id);
    }

    if (row.sourceKind === wechatRssSourceKind) {
      return selectedWechatRssContentItemIdSet === null || selectedWechatRssContentItemIdSet.has(row.id);
    }

    return true;
  });
}

function countStableVisibleCardsBySourceKind(
  cards: RankedContentCardCandidate[],
  limit: number
): Record<string, number> {
  const counts = new Map<string, { candidateCount: number; showAllWhenSelected: boolean }>();

  for (const card of cards) {
    const entry = counts.get(card.sourceKind) ?? {
      candidateCount: 0,
      showAllWhenSelected: card.showAllWhenSelected
    };

    entry.candidateCount += 1;
    counts.set(card.sourceKind, entry);
  }

  return Object.fromEntries(
    [...counts.entries()].map(([sourceKind, entry]) => [
      sourceKind,
      entry.showAllWhenSelected ? entry.candidateCount : Math.min(entry.candidateCount, limit)
    ])
  );
}

function countCurrentPageMetricsBySourceKind(
  candidateCards: RankedContentCardCandidate[],
  visibleCards: RankedContentCardView[],
  referenceTime: Date
): Record<string, CurrentPageSourceMetrics> {
  // 当前页来源指标只回答“在这次真实筛选结果里，今天每个来源贡献了多少候选和展示”。
  const { shanghaiDayStart, shanghaiNextDayStart } = buildShanghaiDayRange(referenceTime);
  const metrics = new Map<string, CurrentPageSourceMetrics>();

  for (const card of candidateCards) {
    if (!isWithinShanghaiDay(card.publishedAt ?? card.rankingTimestamp, shanghaiDayStart, shanghaiNextDayStart)) {
      continue;
    }

    const entry = metrics.get(card.sourceKind) ?? {
      todayCandidateCount: 0,
      todayVisibleCount: 0,
      todayVisibleShare: 0
    };
    entry.todayCandidateCount += 1;
    metrics.set(card.sourceKind, entry);
  }

  for (const card of visibleCards) {
    if (!isWithinShanghaiDay(card.publishedAt ?? card.rankingTimestamp, shanghaiDayStart, shanghaiNextDayStart)) {
      continue;
    }

    const entry = metrics.get(card.sourceKind) ?? {
      todayCandidateCount: 0,
      todayVisibleCount: 0,
      todayVisibleShare: 0
    };
    entry.todayVisibleCount += 1;
    metrics.set(card.sourceKind, entry);
  }

  return Object.fromEntries(metrics.entries());
}

function countCardsWithinShanghaiDay(
  cards: Array<Pick<RankedContentCardView, "publishedAt" | "rankingTimestamp">>,
  shanghaiDayStart: string,
  shanghaiNextDayStart: string
): number {
  // Shared day counting keeps workbench metrics and page metrics on the same Shanghai-day boundary.
  return cards.filter((card) =>
    isWithinShanghaiDay(card.publishedAt ?? card.rankingTimestamp, shanghaiDayStart, shanghaiNextDayStart)
  ).length;
}

function countCardsWithinLastHours(
  cards: Array<Pick<RankedContentCardView, "publishedAt" | "rankingTimestamp">>,
  referenceTime: Date,
  hours: number
): number {
  // Rolling-hour counting is used when workbench stats must align with AI 新讯 page semantics instead of Shanghai natural days.
  return cards.filter((card) => isWithinLastHours(card.publishedAt ?? card.rankingTimestamp, referenceTime, hours)).length;
}

function applyCurrentPageVisibleShares(
  metricsBySourceKind: Record<string, CurrentPageSourceMetrics>,
  currentPageTodayVisibleCount: number
): Record<string, CurrentPageSourceMetrics> {
  // 今日占比统一在这里补齐，确保内容页和工作台复用同一分母定义。
  return Object.fromEntries(
    Object.entries(metricsBySourceKind).map(([sourceKind, metrics]) => [
      sourceKind,
      {
        ...metrics,
        todayVisibleShare:
          currentPageTodayVisibleCount > 0
            ? metrics.todayVisibleCount / currentPageTodayVisibleCount
            : 0
      }
    ])
  );
}

// 内容页选择链路会保留内部排序与开关字段，这里统一在对外返回前剥离，避免两套 map 写法漂移。
function stripInternalSelectionCard({
  isBlocked: _isBlocked,
  showAllWhenSelected: _showAllWhenSelected,
  ...card
}: RankedContentCardCandidate): RankedContentCardView {
  return card;
}

function buildRankedCardCandidate(
  row: ContentCardRow,
  context: {
    viewKey: ContentViewKey;
    viewRuleConfig: ViewRuleConfigValues;
    referenceTime: Date;
    includeNlEvaluations: boolean;
  }
): RankedContentCardCandidate {
  const score = scoreContentItem(
    {
      title: row.title,
      summary: row.summary ?? "",
      bodyMarkdown: row.bodyMarkdown ?? "",
      publishedAt: row.publishedAt,
      sourceKind: row.sourceKind
    },
    { now: context.referenceTime }
  );

  return {
    id: row.id,
    title: row.title,
    summary: row.summary?.trim() || "暂无摘要",
    sourceName: row.sourceName,
    sourceDetail: resolveSourceDetail(row),
    sourceKind: row.sourceKind,
    showAllWhenSelected: row.showAllWhenSelected === 1,
    canonicalUrl: row.canonicalUrl,
    // 展示时间优先使用官方发布时间，缺失时回退到抓取/创建时间，避免卡片显示“未知”。
    publishedAt: row.publishedAt ?? row.rankingTimestamp,
    contentScore: score.contentScore,
    scoreBadges: score.badges,
    feedbackEntry: row.feedbackEntryId
      ? {
          freeText: row.feedbackFreeText,
          suggestedEffect: normalizeSuggestedEffect(row.feedbackSuggestedEffect),
          strengthLevel: normalizeStrengthLevel(row.feedbackStrengthLevel),
          positiveKeywords: parseKeywordJson(row.feedbackPositiveKeywordsJson),
          negativeKeywords: parseKeywordJson(row.feedbackNegativeKeywordsJson)
        }
      : undefined,
    rankingScore: calculateViewRankingScore(
      context.viewKey,
      context.viewRuleConfig,
      score,
      row.sourceKind,
      row.rankingTimestamp,
      context.referenceTime,
      context.includeNlEvaluations ? (row.baseScoreDelta ?? 0) + (row.viewScoreDelta ?? 0) : 0
    ),
    rankingTimestamp: row.rankingTimestamp,
    isBlocked:
      shouldBlockByViewSourceScope(context.viewKey, row.sourceKind) ||
      shouldBlockByTimeWindow(context.viewKey, row, context.referenceTime, context.viewRuleConfig) ||
      (context.includeNlEvaluations &&
        (normalizeNlDecision(row.baseDecision) === "block" || normalizeNlDecision(row.viewDecision) === "block"))
  };
}

function resolveVisibleLimit(viewKey: ContentViewKey, limit: number): number {
  // AI 新讯和 AI 热点都改成“完整结果集 + 后续分页”，只有文章流继续保留稳定的总量截断。
  return viewKey === "articles" ? limit : Number.MAX_SAFE_INTEGER;
}

function shouldBlockByTimeWindow(
  viewKey: ContentViewKey,
  row: Pick<ContentCardRow, "publishedAt" | "rankingTimestamp">,
  referenceTime: Date,
  viewRuleConfig: ViewRuleConfigValues
): boolean {
  // AI 新讯固定只保留最近 24 小时内的内容，时间戳优先 published_at，再回退到抓取/创建时间。
  if (viewKey !== "ai" || !viewRuleConfig.enableTimeWindow) {
    return false;
  }

  const timestamp = row.publishedAt ?? row.rankingTimestamp;
  return !isWithinLastHours(timestamp, referenceTime, 24);
}

function shouldBlockByViewSourceScope(viewKey: ContentViewKey, sourceKind: string): boolean {
  // 微博热搜只作为热点信号补充源，不进入 AI 新讯或旧文章流。
  return hotOnlySourceKinds.has(sourceKind) && viewKey !== "hot";
}

function isWithinLastHours(value: string | null, referenceTime: Date, hours: number): boolean {
  if (!value) {
    return false;
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return false;
  }

  const referenceTimestamp = referenceTime.getTime();
  const windowStart = referenceTimestamp - hours * 60 * 60 * 1000;

  return parsed >= windowStart && parsed <= referenceTimestamp;
}

function normalizeSelectedSourceKinds(selectedSourceKinds?: string[]) {
  if (!selectedSourceKinds) {
    return null;
  }

  return new Set(selectedSourceKinds.map((kind) => kind.trim()).filter(Boolean));
}

function compareByRanking(left: RankedContentCardCandidate, right: RankedContentCardCandidate): number {
  if (right.rankingScore !== left.rankingScore) {
    return right.rankingScore - left.rankingScore;
  }

  const rightTimestamp = toTimestampMs(right.rankingTimestamp);
  const leftTimestamp = toTimestampMs(left.rankingTimestamp);

  if (rightTimestamp !== leftTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return right.id - left.id;
}

// 旧内容 view key 仍保留在内部排序层，正式自然语言策略只再认新的 gate scope。
function mapViewScope(viewKey: ContentViewKey): StrategyGateScope | null {
  if (viewKey === "ai") {
    return "ai_new";
  }

  if (viewKey === "hot") {
    return "ai_hot";
  }

  return null;
}

function normalizeSuggestedEffect(value: string | null): "boost" | "penalize" | "block" | "neutral" | null {
  return value === "boost" || value === "penalize" || value === "block" || value === "neutral" ? value : null;
}

function normalizeStrengthLevel(value: string | null): "low" | "medium" | "high" | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

// 内容卡片的主来源仍保留聚合 source 名，这里只从采集 metadata 里补一条更具体的来源或作者说明。
function resolveSourceDetail(
  row: Pick<ContentCardRow, "metadataJson" | "sourceKind" | "sourceName">
): ContentCardView["sourceDetail"] {
  const metadata = parseMetadataRecord(row.metadataJson);

  if (!metadata) {
    return null;
  }

  const collector = readRecord(metadata.collector);

  if (row.sourceKind === wechatRssSourceKind) {
    return buildSourceDetail("来源标题", readString(collector?.displayName), row.sourceName);
  }

  if (row.sourceKind === twitterAccountsSourceKind || row.sourceKind === twitterKeywordSearchSourceKind) {
    const author = readRecord(metadata.author);
    const authorText = formatTwitterAuthor(
      readString(author?.name),
      readString(author?.username) ?? readString(collector?.username)
    );
    return buildSourceDetail("作者", authorText, row.sourceName);
  }

  if (row.sourceKind === bilibiliSourceKind) {
    return buildSourceDetail("UP主", readString(metadata.author), row.sourceName);
  }

  if (row.sourceKind === hackerNewsSourceKind) {
    return buildSourceDetail("作者", readString(metadata.author), row.sourceName);
  }

  return null;
}

// metadata_json 来自多个采集器，坏数据只能降级为空，不能影响内容页整体渲染。
function parseMetadataRecord(rawValue: string | null): Record<string, unknown> | null {
  if (!rawValue) {
    return null;
  }

  try {
    return readRecord(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

// 只接受普通对象，避免数组或 null 被后续按 record 读取。
function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// 页面只展示有实际内容的字符串，空白值统一当成缺失。
function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// 和主来源名完全相同的信息不重复展示，避免 RSS 卡片元信息变啰嗦。
function buildSourceDetail(label: string, value: string | null, fallbackSourceName: string): ContentCardView["sourceDetail"] {
  if (!value || value === fallbackSourceName.trim()) {
    return null;
  }

  return { label, value };
}

// Twitter 同时给 name 和 username 时保留两个值，方便区分同名账号。
function formatTwitterAuthor(name: string | null, username: string | null): string | null {
  if (name && username) {
    return `${name} @${username}`;
  }

  return name ?? (username ? `@${username}` : null);
}

function calculateViewRankingScore(
  viewKey: ContentViewKey,
  viewRuleConfig: ViewRuleConfigValues,
  score: ContentScoreBreakdown,
  sourceKind: string,
  rankingTimestamp: string | null,
  referenceTime: Date,
  nlScoreDelta: number
): number {
  // The saved rule config controls both the ranking mix and the freshness window.
  const freshnessScore = viewRuleConfig.enableFreshnessWeight
    ? calculateFreshnessWindowScore(
        rankingTimestamp,
        referenceTime,
        viewRuleConfig.freshnessWindowDays,
        score.freshnessScore
      )
    : 0;
  const aiScore = viewRuleConfig.enableAiKeywordWeight ? score.aiScore : 0;
  const heatScore = viewRuleConfig.enableHeatKeywordWeight ? score.heatScore : 0;
  const sourceViewBonus = viewRuleConfig.enableSourceViewBonus
    ? calculateMatchingSourceViewBonus(viewKey, sourceKind)
    : 0;

  return (
    freshnessScore * viewRuleConfig.freshnessWeight +
    score.sourceScore * viewRuleConfig.sourceWeight +
    score.completenessScore * viewRuleConfig.completenessWeight +
    aiScore * viewRuleConfig.aiWeight +
    heatScore * viewRuleConfig.heatWeight +
    nlScoreDelta +
    sourceViewBonus
  );
}

function compareBySelectionOrder(
  viewRuleConfig: ViewRuleConfigValues,
  left: RankedContentCardCandidate,
  right: RankedContentCardCandidate
): number {
  return viewRuleConfig.enableScoreRanking ? compareByRanking(left, right) : compareByPublishedAtDesc(left, right);
}

function normalizeNlDecision(value: string | null): "boost" | "penalize" | "block" | "neutral" {
  return value === "boost" || value === "penalize" || value === "block" ? value : "neutral";
}

function calculateMatchingSourceViewBonus(viewKey: ContentViewKey, sourceKind: string): number {
  // Matching sources get a strong view bonus so the shared pool still surfaces view-native feeds first.
  const source = BUILTIN_SOURCES[sourceKind as keyof typeof BUILTIN_SOURCES];

  if (!source) {
    return 0;
  }

  return source.navigationViews.includes(viewKey) ? matchingSourceViewBonus : 0;
}

function calculateFreshnessWindowScore(
  rankingTimestamp: string | null,
  referenceTime: Date,
  freshnessWindowDays: number,
  fallbackScore: number
): number {
  // Missing or invalid timestamps fall back to the precomputed freshness score instead of dropping the item.
  if (!rankingTimestamp) {
    return fallbackScore;
  }

  const parsedTimestamp = Date.parse(rankingTimestamp);

  if (!Number.isFinite(parsedTimestamp)) {
    return fallbackScore;
  }

  const windowDays = Math.max(1, freshnessWindowDays);
  const ageDays = Math.max(0, (referenceTime.getTime() - parsedTimestamp) / (24 * 60 * 60 * 1000));

  if (ageDays >= windowDays) {
    return 0;
  }

  return Math.max(0, Math.min(100, 100 - (ageDays / windowDays) * 100));
}

function compareVisibleCards(
  sortMode: ContentSortMode | undefined,
  viewRuleConfig: ViewRuleConfigValues,
  left: RankedContentCardCandidate,
  right: RankedContentCardCandidate
): number {
  // Core selection keeps the legacy ranking order unless a caller explicitly asks for a user-facing sort.
  if (sortMode === undefined) {
    return compareBySelectionOrder(viewRuleConfig, left, right);
  }

  if (sortMode === "content_score") {
    if (right.contentScore !== left.contentScore) {
      return right.contentScore - left.contentScore;
    }

    const publishedDelta = toTimestampMs(right.publishedAt ?? right.rankingTimestamp) - toTimestampMs(left.publishedAt ?? left.rankingTimestamp);

    if (publishedDelta !== 0) {
      return publishedDelta;
    }

    return compareBySelectionOrder(viewRuleConfig, left, right);
  }

  const publishedDelta = toTimestampMs(right.publishedAt ?? right.rankingTimestamp) - toTimestampMs(left.publishedAt ?? left.rankingTimestamp);

  if (publishedDelta !== 0) {
    return publishedDelta;
  }

  if (right.contentScore !== left.contentScore) {
    return right.contentScore - left.contentScore;
  }

  return compareBySelectionOrder(viewRuleConfig, left, right);
}

function compareByPublishedAtDesc(left: RankedContentCardCandidate, right: RankedContentCardCandidate): number {
  const publishedDelta = toTimestampMs(right.publishedAt ?? right.rankingTimestamp) - toTimestampMs(left.publishedAt ?? left.rankingTimestamp);

  if (publishedDelta !== 0) {
    return publishedDelta;
  }

  return right.id - left.id;
}

function toTimestampMs(value: string | null): number {
  // Timestamp tie-breaks keep newer items ahead when the ranking score is identical.
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isWithinShanghaiDay(
  value: string | null,
  shanghaiDayStart: string,
  shanghaiNextDayStart: string
) {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);
  const shanghaiDayStartTimestamp = Date.parse(shanghaiDayStart);
  const shanghaiNextDayStartTimestamp = Date.parse(shanghaiNextDayStart);

  if (
    Number.isNaN(timestamp) ||
    Number.isNaN(shanghaiDayStartTimestamp) ||
    Number.isNaN(shanghaiNextDayStartTimestamp)
  ) {
    return false;
  }

  return timestamp >= shanghaiDayStartTimestamp && timestamp < shanghaiNextDayStartTimestamp;
}

function buildShanghaiDayRange(referenceTime: Date) {
  // 统计日统一锚定到上海自然日，避免服务器时区不同导致“今天”口径漂移。
  const shanghaiFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const [year, month, day] = shanghaiFormatter.format(referenceTime).split("-");
  const nextDayReferenceTime = new Date(referenceTime.getTime() + 24 * 60 * 60 * 1000);
  const [nextYear, nextMonth, nextDay] = shanghaiFormatter.format(nextDayReferenceTime).split("-");

  return {
    shanghaiDayStart: `${year}-${month}-${day}T00:00:00+08:00`,
    shanghaiNextDayStart: `${nextYear}-${nextMonth}-${nextDay}T00:00:00+08:00`
  };
}

function parseKeywordJson(rawValue: string | null): string[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
