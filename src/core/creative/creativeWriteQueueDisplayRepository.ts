import type { SqliteDatabase } from "../db/openDatabase.js";

type QueueDisplaySnapshot = {
  current: unknown | null;
  queue: unknown[];
  recent?: unknown[];
  history?: unknown[];
  day_counts?: Array<{ day_key: string; article_count: number; source_count: number }>;
};

/** 按唯一外部编号补齐短写候选的 HotNow 素材标题和平台编号，不改变 Hermes 排期。 */
export function enrichShortWriteScheduleDisplay(
  db: SqliteDatabase,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (!Array.isArray(data.candidates)) return data;
  const candidates = data.candidates.filter((candidate): candidate is Record<string, unknown> =>
    typeof candidate === "object" && candidate !== null && !Array.isArray(candidate),
  );
  const externalIds = [...new Set(candidates
    .map((candidate) => candidate.source_external_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0))];
  const sources = new Map<string, { id: number; title: string; sourceName: string | null } | null>();

  // 外部编号可能因历史数据重复；只有唯一短素材才关联平台 ID 和可点击标题。
  for (let start = 0; start < externalIds.length; start += 400) {
    const ids = externalIds.slice(start, start + 400);
    const rows = db.prepare(`
      SELECT external_id, COUNT(*) AS match_count, MIN(id) AS source_id,
             MAX(title) AS title, MAX(source_name) AS source_name
      FROM creative_source_items
      WHERE external_id IN (${ids.map(() => "?").join(",")}) AND direction = 'short_content'
      GROUP BY external_id
    `).all(...ids) as Array<{
      external_id: string;
      match_count: number;
      source_id: number;
      title: string;
      source_name: string | null;
    }>;
    for (const row of rows) {
      sources.set(row.external_id, row.match_count === 1
        ? { id: row.source_id, title: row.title, sourceName: row.source_name }
        : null);
    }
  }

  data.candidates = candidates.map((candidate) => {
    const externalId = candidate.source_external_id;
    if (typeof externalId !== "string") return candidate;
    const source = sources.get(externalId);
    return {
      ...candidate,
      hotnow_source_item_id: source?.id ?? null,
      source_item_title: source?.title ?? null,
      source_item_source_name: source?.sourceName ?? null,
    };
  });
  return data;
}

/** 补齐队列展示的北京时间统计、历史成品和平台素材关联；修改调用方拥有的快照，不修改任务或数据库。 */
export function enrichWriteQueueDisplay<T extends QueueDisplaySnapshot>(db: SqliteDatabase, data: T): T {
  // 队列日期带必须读取数据库全量日统计，不能从有限的历史记录反推文章和素材数量。
  const articleDayRows = db.prepare(`
    SELECT date(datetime(created_at), '+8 hours') AS day_key, COUNT(*) AS article_count
    FROM creative_finished_articles
    WHERE deleted_at IS NULL
    GROUP BY day_key
  `).all() as Array<{ day_key: string; article_count: number }>;
  const sourceDayRows = db.prepare(`
    SELECT date(datetime(COALESCE(collector_timestamp, created_at)), '+8 hours') AS day_key, COUNT(*) AS source_count
    FROM creative_source_items
    GROUP BY day_key
  `).all() as Array<{ day_key: string; source_count: number }>;
  const dayCounts = new Map<string, { day_key: string; article_count: number; source_count: number }>();
  for (const row of articleDayRows) {
    dayCounts.set(row.day_key, { ...row, source_count: 0 });
  }
  for (const row of sourceDayRows) {
    const current = dayCounts.get(row.day_key) ?? { day_key: row.day_key, article_count: 0, source_count: 0 };
    current.source_count = row.source_count;
    dayCounts.set(row.day_key, current);
  }
  data.day_counts = [...dayCounts.values()].sort((left, right) => right.day_key.localeCompare(left.day_key));

  const history = Array.isArray(data.history) ? data.history as Array<Record<string, unknown>> : [];
  const knownArticleIds = new Set(
    history.map((task) => Number(task.finished_article_id)).filter((id) => Number.isFinite(id) && id > 0),
  );
  const legacyArticles = db.prepare(`
    SELECT id, source_item_id, created_at
    FROM creative_finished_articles
    WHERE origin_type = 'pipeline'
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 500
  `).all() as Array<{ id: number; source_item_id: number | null; created_at: string }>;
  for (const article of legacyArticles) {
    if (knownArticleIds.has(article.id)) continue;
    history.push({
      task_id: `article-${article.id}`,
      label: `历史成品 · #${article.id}`,
      priority: "normal",
      source_item_id: article.source_item_id,
      status: "done",
      submitted_at: article.created_at,
      started_at: article.created_at,
      finished_at: article.created_at,
      finished_article_id: article.id,
    });
  }
  data.history = history;

  // 从队列中收集所有 source_item_id，批量查本地素材表补充标题和来源
  const tasks = [
    data.current,
    ...(data.queue ?? []),
    ...(data.recent ?? []),
    ...(data.history ?? []),
  ].filter(Boolean) as Array<Record<string, unknown>>;
  // 自动短内容没有平台 ID，不能拿 Hermes 本地编号打开平台素材；历史记录从成品补回关联。
  const articleIds = [...new Set(tasks.map((task) => Number(task.finished_article_id || task.article_id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  const articles = articleIds.length ? db.prepare(`SELECT id, source_item_id FROM creative_finished_articles WHERE id IN (${articleIds.map(() => "?").join(",")})`).all(...articleIds) as Array<{ id: number; source_item_id: number | null }> : [];
  const articleSources = new Map(articles.map((article) => [article.id, article.source_item_id]));
  const externalIds = [...new Set(tasks
    .filter((task) => !task.source_item_id && !articleSources.get(Number(task.finished_article_id || task.article_id)))
    .map((task) => task.source_external_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0))];
  const externalSources = new Map<string, number | null>();
  // 同一外部标识只查询一次；分段限制绑定参数，歧义标识仍不关联任何平台素材。
  for (let start = 0; start < externalIds.length; start += 400) {
    const ids = externalIds.slice(start, start + 400);
    const rows = db.prepare(`
      SELECT external_id, CASE WHEN COUNT(*) = 1 THEN MIN(id) ELSE NULL END AS source_id
      FROM creative_source_items
      WHERE external_id IN (${ids.map(() => "?").join(",")}) AND direction = 'short_content'
      GROUP BY external_id
    `).all(...ids) as Array<{ external_id: string; source_id: number | null }>;
    for (const row of rows) externalSources.set(row.external_id, row.source_id);
  }
  for (const task of tasks) {
    if (task.source_item_id) continue;
    const articleSource = articleSources.get(Number(task.finished_article_id || task.article_id));
    if (articleSource) {
      task.source_item_id = articleSource;
    } else if (typeof task.source_external_id === "string" && task.source_external_id) {
      const sourceId = externalSources.get(task.source_external_id);
      if (sourceId != null) task.source_item_id = sourceId;
    }
  }
  const sourceItemIds = [...new Set(tasks.map((task) => Number(task.source_item_id)).filter(Boolean))];
  if (sourceItemIds.length > 0) {
    const placeholders = sourceItemIds.map(() => "?").join(",");
    const rows = db.prepare(
      `SELECT id, title, source_name FROM creative_source_items WHERE id IN (${placeholders})`
    ).all(...sourceItemIds) as { id: number; title: string; source_name: string | null }[];
    const lookup = new Map(rows.map((row) => [row.id, row]));
    for (const task of tasks) {
      const sourceItemId = Number(task.source_item_id);
      if (sourceItemId && lookup.has(sourceItemId)) {
        const info = lookup.get(sourceItemId)!;
        task.source_item_title = info.title ?? null;
        task.source_item_source_name = info.source_name ?? null;
      }
    }
  }
  return data;
}
