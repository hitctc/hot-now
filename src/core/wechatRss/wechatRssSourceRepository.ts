import type { SqliteDatabase } from "../db/openDatabase.js";

export type WechatRssSourceRecord = {
  id: number;
  rssUrl: string;
  displayName: string | null;
  isEnabled: boolean;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateWechatRssSourcesInput = {
  rssUrls: string[] | string;
};

export type CreateWechatRssSourcesResult =
  | {
      ok: true;
      created: WechatRssSourceRecord[];
      skippedDuplicateUrls: string[];
    }
  | {
      ok: false;
      reason: "invalid-rss-url" | "empty-rss-url-list";
    };

export type DeleteWechatRssSourceResult =
  | { ok: true; id: number }
  | { ok: false; reason: "invalid-id" | "not-found" };

export type MarkWechatRssSourceFetchResultInput =
  | {
      id: number;
      fetchedAt: string;
      success: true;
      message: string;
      displayName?: string | null;
    }
  | {
      id: number;
      fetchedAt: string;
      success: false;
      error: string;
    };

type WechatRssSourceRow = {
  id: number;
  rss_url: string;
  display_name: string | null;
  is_enabled: number;
  last_fetched_at: string | null;
  last_success_at: string | null;
  last_result: string | null;
  created_at: string;
  updated_at: string;
};

// 公众号 RSS 单独按配置表管理，列表按新增顺序稳定展示，避免和普通 RSS 库存混在一起。
export function listWechatRssSources(db: SqliteDatabase): WechatRssSourceRecord[] {
  const rows = db
    .prepare(
      `
        SELECT id,
               rss_url,
               display_name,
               is_enabled,
               last_fetched_at,
               last_success_at,
               last_result,
               created_at,
               updated_at
        FROM wechat_rss_sources
        ORDER BY id ASC
      `
    )
    .all() as WechatRssSourceRow[];

  return rows.map(mapWechatRssSourceRow);
}

// 批量新增会先在存储层去重，同一批里重复的 URL 和库里已存在的 URL 都不会重复写入。
export function createWechatRssSources(
  db: SqliteDatabase,
  input: CreateWechatRssSourcesInput
): CreateWechatRssSourcesResult {
  const normalizedUrls = normalizeWechatRssUrlList(input.rssUrls);

  if (normalizedUrls.length === 0) {
    return { ok: false, reason: "empty-rss-url-list" };
  }

  if (normalizedUrls.some((entry) => !entry.ok)) {
    return { ok: false, reason: "invalid-rss-url" };
  }

  const allUrls = normalizedUrls.flatMap((entry) => entry.ok ? [entry.url] : []);
  const uniqueUrls = uniqueStrings(allUrls);
  const existingUrls = new Set(
    readExistingWechatRssUrls(db, uniqueUrls)
  );
  const duplicateInBatchUrls = uniqueUrls.filter((url) => allUrls.filter((entry) => entry === url).length > 1);
  const urlsToInsert = uniqueUrls.filter((url) => !existingUrls.has(url));
  const insert = db.transaction((urls: string[]) => {
    const statement = db.prepare(
      `
        INSERT INTO wechat_rss_sources (
          rss_url,
          display_name,
          is_enabled,
          updated_at
        )
        VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      `
    );

    for (const url of urls) {
      statement.run(url, buildInitialDisplayName(url));
    }
  });

  insert(urlsToInsert);

  return {
    ok: true,
    created: listWechatRssSources(db).filter((source) => urlsToInsert.includes(source.rssUrl)),
    skippedDuplicateUrls: uniqueStrings([...duplicateInBatchUrls, ...uniqueUrls.filter((url) => existingUrls.has(url))])
  };
}

// 删除配置不删除历史内容，历史内容仍由内容表保留；是否展示由内容页二级筛选控制。
export function deleteWechatRssSource(db: SqliteDatabase, id: number): DeleteWechatRssSourceResult {
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result = db.prepare("DELETE FROM wechat_rss_sources WHERE id = ?").run(id);

  if (result.changes === 0) {
    return { ok: false, reason: "not-found" };
  }

  return { ok: true, id };
}

// 每条 RSS 记录自己的最近执行状态，便于后台表格直接定位是哪个公众号 feed 异常。
export function markWechatRssSourceFetchResult(
  db: SqliteDatabase,
  input: MarkWechatRssSourceFetchResultInput
): { ok: true; source: WechatRssSourceRecord } | { ok: false; reason: "invalid-id" | "not-found" } {
  if (!Number.isInteger(input.id) || input.id <= 0) {
    return { ok: false, reason: "invalid-id" };
  }

  const result =
    input.success === true
      ? db
          .prepare(
            `
              UPDATE wechat_rss_sources
              SET last_fetched_at = ?,
                  last_success_at = ?,
                  last_result = ?,
                  display_name = COALESCE(NULLIF(TRIM(?), ''), display_name),
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `
          )
          .run(
            input.fetchedAt,
            input.fetchedAt,
            normalizeMessage(input.message),
            input.displayName ?? null,
            input.id
          )
      : db
          .prepare(
            `
              UPDATE wechat_rss_sources
              SET last_fetched_at = ?,
                  last_result = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `
          )
          .run(input.fetchedAt, normalizeMessage(input.error), input.id);

  if (result.changes === 0) {
    return { ok: false, reason: "not-found" };
  }

  return readWechatRssSourceById(db, input.id);
}

function readWechatRssSourceById(
  db: SqliteDatabase,
  id: number
): { ok: true; source: WechatRssSourceRecord } {
  const row = db
    .prepare(
      `
        SELECT id,
               rss_url,
               display_name,
               is_enabled,
               last_fetched_at,
               last_success_at,
               last_result,
               created_at,
               updated_at
        FROM wechat_rss_sources
        WHERE id = ?
        LIMIT 1
      `
    )
    .get(id) as WechatRssSourceRow | undefined;

  if (!row) {
    throw new Error(`Expected wechat_rss_sources row ${id} to exist after write.`);
  }

  return { ok: true, source: mapWechatRssSourceRow(row) };
}

function readExistingWechatRssUrls(db: SqliteDatabase, urls: string[]): string[] {
  if (urls.length === 0) {
    return [];
  }

  const placeholders = urls.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT rss_url AS rssUrl
        FROM wechat_rss_sources
        WHERE rss_url IN (${placeholders})
      `
    )
    .all(...urls) as Array<{ rssUrl: string }>;

  return rows.map((row) => row.rssUrl);
}

function normalizeWechatRssUrlList(value: string[] | string): Array<{ ok: true; url: string } | { ok: false }> {
  const rawValues = Array.isArray(value)
    ? value
    : value.split(/[\n,，]+/);

  return rawValues
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const normalizedUrl = normalizeWechatRssUrl(entry);
      return normalizedUrl ? { ok: true, url: normalizedUrl } : { ok: false };
    });
}

function normalizeWechatRssUrl(value: string): string | null {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function buildInitialDisplayName(urlValue: string): string {
  try {
    const url = new URL(urlValue);
    return `公众号 RSS / ${url.hostname}`;
  } catch {
    return "微信公众号 RSS";
  }
}

function mapWechatRssSourceRow(row: WechatRssSourceRow): WechatRssSourceRecord {
  return {
    id: row.id,
    rssUrl: row.rss_url,
    displayName: row.display_name,
    isEnabled: row.is_enabled === 1,
    lastFetchedAt: row.last_fetched_at,
    lastSuccessAt: row.last_success_at,
    lastResult: row.last_result,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeMessage(value: string): string {
  return value.trim().slice(0, 500);
}
