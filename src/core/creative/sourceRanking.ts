export type SourceRanking = {
  board: string;
  rank: number | null;
  capturedAt: string;
  kind: "ranking" | "listing" | "selection";
};

// 列表仅提取小快照，不把原始采集包和全文带到客户端。
export const SOURCE_RANKING_SQL = "CASE WHEN direction = 'short_content' AND json_valid(raw_payload_json) THEN json_extract(raw_payload_json, '$.sourceRanking') ELSE NULL END";

/** 校验外部榜单快照并返回规范值；无效或缺失返回null，不推算历史排名。 */
export function parseSourceRanking(value: unknown): SourceRanking | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  if (typeof snapshot.board !== "string" || !snapshot.board.trim() || snapshot.board.length > 120
    || typeof snapshot.capturedAt !== "string" || !/T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(snapshot.capturedAt) || !Number.isFinite(Date.parse(snapshot.capturedAt))) return null;
  if (snapshot.kind !== "ranking" && snapshot.kind !== "listing" && snapshot.kind !== "selection") return null;
  if (snapshot.kind === "selection" ? snapshot.rank !== null : typeof snapshot.rank !== "number" || !Number.isSafeInteger(snapshot.rank) || snapshot.rank < 1) return null;
  return { board: snapshot.board.trim(), rank: snapshot.rank as number | null, capturedAt: snapshot.capturedAt, kind: snapshot.kind };
}

/** 读取SQLite提取的快照JSON；旧数据和损坏JSON按缺失处理，无写入副作用。 */
export function readSourceRanking(value: string | null | undefined): SourceRanking | null {
  try { return value ? parseSourceRanking(JSON.parse(value)) : null; }
  catch { return null; }
}
