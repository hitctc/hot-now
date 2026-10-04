import type { SqliteDatabase } from "../db/openDatabase.js";

export type CreativeRawRssFeed = "juya-ai-daily" | "wechat-rss";

export type CreativeRawRssFeedItem = {
  id: number;
  externalId: string;
  title: string;
  url: string;
  sourceName: string;
  summary: string | null;
  fullContent: string | null;
  publishedAt: string | null;
  collectorTimestamp: string | null;
  sourceFeed: CreativeRawRssFeed;
};

export type CreativeRawRssFeedResult = {
  items: CreativeRawRssFeedItem[];
  total: number;
  windowHours: number;
  latestId: number;
};

const feedToSourceKind: Record<CreativeRawRssFeed, string> = {
  "juya-ai-daily": "juya",
  "wechat-rss": "wechat_rss"
};

const normalizedUrlExpression = `LOWER(RTRIM(
  TRIM(SUBSTR(
    %s,
    1,
    CASE WHEN INSTR(%s, '#') > 0 THEN INSTR(%s, '#') - 1 ELSE LENGTH(%s) END
  )),
  '/'
))`;

type RawRssRow = {
  id: number;
  externalId: string;
  title: string;
  url: string;
  sourceName: string;
  summary: string | null;
  fullContent: string | null;
  publishedAt: string | null;
  collectorTimestamp: string | null;
  sourceKind: string;
  metadataJson: string | null;
};

/**
 * 按长短方向读取未交接的 RSS；afterId 用于短写上线基线与增量分页，latestId 固定本次上界。
 * 不修改素材或原采集记录，也不做评分和写作决策；短写窗口按采集时间而非文章发布时间计算。
 */
export function listCreativeRawRssItems(
  db: SqliteDatabase,
  options: { sourceFeed?: CreativeRawRssFeed; windowHours?: number; limit?: number; direction?: "article" | "short_content"; afterId?: number } = {}
): CreativeRawRssFeedResult {
  const windowHours = Math.min(168, Math.max(1, Math.floor(options.windowHours ?? 48)));
  const limit = Math.min(500, Math.max(1, Math.floor(options.limit ?? 200)));
  const sourceKinds = options.sourceFeed
    ? [feedToSourceKind[options.sourceFeed]]
    : Object.values(feedToSourceKind);
  const sourceKindPlaceholders = sourceKinds.map(() => "?").join(", ");
  const direction = options.direction ?? "article";
  const latestRow = db.prepare(`
    SELECT COALESCE(MAX(ci.id), 0) AS latestId FROM content_items ci
    JOIN content_sources cs ON cs.id = ci.source_id WHERE cs.kind IN (${sourceKindPlaceholders})
  `).get(...sourceKinds) as { latestId: number };
  const latestId = latestRow.latestId;
  const timestamp = direction === "short_content"
    ? "COALESCE(ci.fetched_at, ci.created_at)"
    : "COALESCE(ci.published_at, ci.fetched_at, ci.created_at)";
  const contentUrl = normalizedUrlExpression.replaceAll("%s", "ci.canonical_url");
  const creativeUrl = normalizedUrlExpression.replaceAll("%s", "creative.url");
  const whereClause = `
    cs.kind IN (${sourceKindPlaceholders})
    AND ci.canonical_url IS NOT NULL
    AND TRIM(ci.canonical_url) != ''
    AND datetime(${timestamp}) >= datetime('now', ?)
    AND ci.id <= ?
    ${options.afterId !== undefined ? "AND ci.id > ?" : ""}
    AND NOT EXISTS (
      SELECT 1
      FROM creative_source_items creative
      WHERE ${creativeUrl} = ${contentUrl} AND creative.direction = ?
    )
  `;
  const params = [...sourceKinds, `-${windowHours} hours`, latestId,
    ...(options.afterId !== undefined ? [options.afterId] : []), direction];

  const totalRow = db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM content_items ci
        JOIN content_sources cs ON cs.id = ci.source_id
        WHERE ${whereClause}
      `
    )
    .get(...params) as { total: number };

  const rows = db
    .prepare(
      `
        SELECT
          ci.id AS id,
          ci.external_id AS externalId,
          ci.title AS title,
          ci.canonical_url AS url,
          cs.name AS sourceName,
          ci.summary AS summary,
          ci.body_markdown AS fullContent,
          ci.published_at AS publishedAt,
          COALESCE(ci.fetched_at, ci.created_at) AS collectorTimestamp,
          cs.kind AS sourceKind,
          ci.metadata_json AS metadataJson
        FROM content_items ci
        JOIN content_sources cs ON cs.id = ci.source_id
        WHERE ${whereClause}
        ORDER BY ${options.afterId !== undefined ? "ci.id ASC" : `datetime(${timestamp}) DESC, ci.id DESC`}
        LIMIT ?
      `
    )
    .all(...params, limit) as RawRssRow[];

  return {
    items: rows.map((row) => ({
      id: row.id,
      externalId: row.externalId || `rss-content-${row.id}`,
      title: row.title,
      url: row.url,
      sourceName: resolveSourceName(row),
      summary: row.summary,
      fullContent: row.fullContent || null,
      publishedAt: row.publishedAt,
      collectorTimestamp: row.collectorTimestamp,
      sourceFeed: row.sourceKind === "juya" ? "juya-ai-daily" : "wechat-rss"
    })),
    total: totalRow.total,
    latestId,
    windowHours
  };
}

function resolveSourceName(row: RawRssRow): string {
  if (row.sourceKind !== "wechat_rss" || !row.metadataJson) {
    return row.sourceName;
  }

  try {
    const metadata = JSON.parse(row.metadataJson) as { collector?: { displayName?: unknown } };
    const displayName = metadata.collector?.displayName;
    return typeof displayName === "string" && displayName.trim()
      ? `微信公众号：${displayName.trim()}`
      : row.sourceName;
  } catch {
    return row.sourceName;
  }
}
