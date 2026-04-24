import type { SqliteDatabase } from "../db/openDatabase.js";
import type { SourceKind } from "../source/types.js";

export type ContentSourceRecord = {
  id: number;
  kind: SourceKind;
  name: string;
  siteUrl: string;
  rssUrl: string | null;
};

export type UpsertContentItemInput = {
  externalId?: string;
  title: string;
  canonicalUrl: string;
  summary?: string;
  bodyMarkdown?: string;
  publishedAt?: string;
  fetchedAt?: string;
  metadataJson?: string;
};

export type CreateCollectionRunInput = {
  runDate: string;
  triggerKind: string;
  status: string;
  startedAt: string;
  notes?: string;
};

export type FinishCollectionRunInput = {
  id: number;
  status: string;
  finishedAt: string;
  notes?: string;
};

export type LinkTwitterSearchKeywordMatchInput = {
  keywordId: number;
  tweetExternalId: string;
  contentItemId: number;
};

export type ContentItemIdByExternalId = {
  externalId: string;
  contentItemId: number;
};

export type MergeContentMatchedQueriesInput = {
  contentItemId: number;
  matchedQueries: string[];
};

// This resolves the persisted source row so callers can attach collected items to the same
// source catalog that migrations and seed data already manage.
export function resolveSourceByKind(db: SqliteDatabase, kind: SourceKind): ContentSourceRecord | undefined {
  return db
    .prepare(
      `
        SELECT id, kind, name, site_url AS siteUrl, rss_url AS rssUrl
        FROM content_sources
        WHERE kind = ?
        LIMIT 1
      `
    )
    .get(kind) as ContentSourceRecord | undefined;
}

// 隐藏聚合来源不会出现在普通 source 库存表里，内容页需要单独判断它是否已经有可读内容。
export function hasContentItemsForSourceKind(db: SqliteDatabase, kind: SourceKind): boolean {
  const row = db
    .prepare(
      `
        SELECT 1 AS hasContent
        FROM content_items item
        JOIN content_sources source ON source.id = item.source_id
        WHERE source.kind = ?
        LIMIT 1
      `
    )
    .get(kind) as { hasContent: number } | undefined;

  return Boolean(row);
}

// Content items are upserted on the existing `(source_id, canonical_url)` key so repeated runs
// refresh extracted text without creating duplicate rows for the same source article.
export function upsertContentItems(
  db: SqliteDatabase,
  params: { sourceId: number; items: UpsertContentItemInput[] }
): void {
  const statement = db.prepare(
    `
      INSERT INTO content_items (
        source_id,
        external_id,
        title,
        canonical_url,
        summary,
        body_markdown,
        metadata_json,
        published_at,
        fetched_at,
        updated_at
      )
      VALUES (
        @sourceId,
        @externalId,
        @title,
        @canonicalUrl,
        @summary,
        @bodyMarkdown,
        @metadataJson,
        @publishedAt,
        @fetchedAt,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(source_id, canonical_url) DO UPDATE SET
        external_id = excluded.external_id,
        title = excluded.title,
        summary = excluded.summary,
        body_markdown = CASE
          WHEN excluded.body_markdown IS NOT NULL AND LENGTH(TRIM(excluded.body_markdown)) > 0
            THEN excluded.body_markdown
          ELSE content_items.body_markdown
        END,
        metadata_json = excluded.metadata_json,
        published_at = excluded.published_at,
        fetched_at = excluded.fetched_at,
        updated_at = CURRENT_TIMESTAMP
    `
  );

  const upsert = db.transaction((items: UpsertContentItemInput[]) => {
    for (const item of items) {
      statement.run({
        sourceId: params.sourceId,
        externalId: item.externalId ?? null,
        title: item.title,
        canonicalUrl: item.canonicalUrl,
        summary: item.summary ?? null,
        bodyMarkdown: item.bodyMarkdown ?? null,
        metadataJson: item.metadataJson ?? null,
        publishedAt: item.publishedAt ?? null,
        fetchedAt: item.fetchedAt ?? null
      });
    }
  });

  upsert(params.items);
}

// Keyword matches are stored separately so one tweet can belong to multiple search terms without
// duplicating the content_items row or losing per-keyword visibility controls later on.
export function linkTwitterSearchKeywordMatches(
  db: SqliteDatabase,
  matches: LinkTwitterSearchKeywordMatchInput[]
): void {
  const statement = db.prepare(
    `
      INSERT INTO twitter_search_keyword_matches (
        keyword_id,
        tweet_external_id,
        content_item_id,
        updated_at
      )
      VALUES (
        @keywordId,
        @tweetExternalId,
        @contentItemId,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(keyword_id, tweet_external_id) DO UPDATE SET
        content_item_id = excluded.content_item_id,
        updated_at = CURRENT_TIMESTAMP
    `
  );

  const link = db.transaction((items: LinkTwitterSearchKeywordMatchInput[]) => {
    for (const match of items) {
      statement.run(match);
    }
  });

  link(matches);
}

// Content reads only need the subset of ids that still has at least one visible keyword match,
// so the caller can keep other source logic unchanged and apply a small extra filter.
export function listVisibleTwitterKeywordMatchContentItemIds(
  db: SqliteDatabase,
  contentItemIds: number[]
): number[] {
  const normalizedIds = uniquePositiveIntegers(contentItemIds);

  if (normalizedIds.length === 0) {
    return [];
  }

  const placeholders = normalizedIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT DISTINCT match.content_item_id AS contentItemId
        FROM twitter_search_keyword_matches match
        JOIN twitter_search_keywords keyword ON keyword.id = match.keyword_id
        WHERE keyword.is_visible = 1
          AND match.content_item_id IN (${placeholders})
        ORDER BY match.content_item_id ASC
      `
    )
    .all(...normalizedIds) as Array<{ contentItemId: number }>;

  return rows.map((row) => row.contentItemId);
}

// 账号筛选只需要拿到当前候选内容里命中指定账号的 content_item_id，不需要改动普通来源查询。
export function listTwitterAccountContentItemIds(
  db: SqliteDatabase,
  contentItemIds: number[],
  accountIds: number[]
): number[] {
  const normalizedContentItemIds = uniquePositiveIntegers(contentItemIds);
  const normalizedAccountIds = uniquePositiveIntegers(accountIds);

  if (normalizedContentItemIds.length === 0 || normalizedAccountIds.length === 0) {
    return [];
  }

  const placeholders = normalizedContentItemIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT id AS contentItemId, metadata_json AS metadataJson
        FROM content_items
        WHERE id IN (${placeholders})
        ORDER BY id ASC
      `
    )
    .all(...normalizedContentItemIds) as Array<{ contentItemId: number; metadataJson: string | null }>;
  const selectedAccountIds = new Set(normalizedAccountIds);

  return rows.flatMap((row) => {
    const accountId = readTwitterAccountIdFromMetadataJson(row.metadataJson);
    return accountId !== null && selectedAccountIds.has(accountId) ? [row.contentItemId] : [];
  });
}

// 关键词筛选只保留仍处于展示启用状态且命中了指定关键词的内容，避免把已隐藏关键词重新带回内容页。
export function listVisibleTwitterKeywordMatchContentItemIdsByKeywordIds(
  db: SqliteDatabase,
  contentItemIds: number[],
  keywordIds: number[]
): number[] {
  const normalizedContentItemIds = uniquePositiveIntegers(contentItemIds);
  const normalizedKeywordIds = uniquePositiveIntegers(keywordIds);

  if (normalizedContentItemIds.length === 0 || normalizedKeywordIds.length === 0) {
    return [];
  }

  const contentItemPlaceholders = normalizedContentItemIds.map(() => "?").join(", ");
  const keywordPlaceholders = normalizedKeywordIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT DISTINCT match.content_item_id AS contentItemId
        FROM twitter_search_keyword_matches match
        JOIN twitter_search_keywords keyword ON keyword.id = match.keyword_id
        WHERE keyword.is_visible = 1
          AND match.content_item_id IN (${contentItemPlaceholders})
          AND match.keyword_id IN (${keywordPlaceholders})
        ORDER BY match.content_item_id ASC
      `
    )
    .all(...normalizedContentItemIds, ...normalizedKeywordIds) as Array<{ contentItemId: number }>;

  return rows.map((row) => row.contentItemId);
}

// Twitter 账号采集和关键词搜索会共享同一个 tweet external_id，所以这里单独暴露批量读取帮助后续复用去重。
export function listContentItemIdsByExternalIds(
  db: SqliteDatabase,
  externalIds: string[]
): ContentItemIdByExternalId[] {
  const normalizedExternalIds = uniqueNonEmptyStrings(externalIds);

  if (normalizedExternalIds.length === 0) {
    return [];
  }

  const placeholders = normalizedExternalIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT external_id AS externalId, id AS contentItemId
        FROM content_items
        WHERE external_id IN (${placeholders})
        ORDER BY id ASC
      `
    )
    .all(...normalizedExternalIds) as ContentItemIdByExternalId[];

  return rows.filter((row) => typeof row.externalId === "string" && row.externalId.length > 0);
}

// Hacker News search keeps first-phase query hits in metadata_json, so repeated matches can merge
// there without introducing another relation table before query-level filtering is needed.
export function mergeContentMatchedQueries(
  db: SqliteDatabase,
  updates: MergeContentMatchedQueriesInput[]
): void {
  const normalizedUpdates = updates
    .map((update) => ({
      contentItemId: update.contentItemId,
      matchedQueries: uniqueNonEmptyStrings(update.matchedQueries)
    }))
    .filter((update) => Number.isInteger(update.contentItemId) && update.contentItemId > 0 && update.matchedQueries.length > 0);

  if (normalizedUpdates.length === 0) {
    return;
  }

  const readStatement = db.prepare("SELECT metadata_json AS metadataJson FROM content_items WHERE id = ? LIMIT 1");
  const writeStatement = db.prepare(
    `
      UPDATE content_items
      SET metadata_json = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
  );

  const merge = db.transaction((items: Array<{ contentItemId: number; matchedQueries: string[] }>) => {
    for (const item of items) {
      const row = readStatement.get(item.contentItemId) as { metadataJson: string | null } | undefined;

      if (!row) {
        continue;
      }

      const metadata = parseMetadataJson(row.metadataJson);
      const existingMatchedQueries = Array.isArray(metadata.matchedQueries)
        ? uniqueNonEmptyStrings(metadata.matchedQueries.filter((value): value is string => typeof value === "string"))
        : [];
      metadata.matchedQueries = uniqueNonEmptyStrings([...existingMatchedQueries, ...item.matchedQueries]);
      writeStatement.run(JSON.stringify(metadata), item.contentItemId);
    }
  });

  merge(normalizedUpdates);
}

// A collection run row is created as soon as a digest has enough source context to be tracked,
// so later steps can either complete it or mark the run as failed.
export function createCollectionRun(db: SqliteDatabase, input: CreateCollectionRunInput): number {
  const result = db
    .prepare(
      `
        INSERT INTO collection_runs (
          run_date,
          trigger_kind,
          status,
          started_at,
          notes
        )
        VALUES (?, ?, ?, ?, ?)
      `
    )
    .run(input.runDate, input.triggerKind, input.status, input.startedAt, input.notes ?? null);

  return Number(result.lastInsertRowid);
}

// The run row is updated in place so downstream report metadata can point at a stable execution id.
export function finishCollectionRun(db: SqliteDatabase, input: FinishCollectionRunInput): void {
  db.prepare(
    `
      UPDATE collection_runs
      SET status = ?,
          finished_at = ?,
          notes = ?
      WHERE id = ?
    `
  ).run(input.status, input.finishedAt, input.notes ?? null, input.id);
}

function uniquePositiveIntegers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  ];
}

function parseMetadataJson(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readTwitterAccountIdFromMetadataJson(metadataJson: string | null): number | null {
  if (!metadataJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadataJson) as {
      collector?: { accountId?: unknown };
    };
    const accountId = parsed.collector?.accountId;
    return Number.isInteger(accountId) && Number(accountId) > 0 ? Number(accountId) : null;
  } catch {
    return null;
  }
}
