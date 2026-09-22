const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

const dayKeyFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: SHANGHAI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: SHANGHAI_TIME_ZONE,
  weekday: "long",
});

/** 将时间转换为北京时间日期键；无效时间返回 null，避免错误分组。 */
export function toShanghaiDayKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = dayKeyFormatter.formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${readPart("year")}-${readPart("month")}-${readPart("day")}`;
}

/** 根据北京时间日期键计算前一天，用于稳定判断“昨天”。 */
function previousDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return [
    previous.getUTCFullYear(),
    String(previous.getUTCMonth() + 1).padStart(2, "0"),
    String(previous.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export type TableDayCounts = {
  articleCount: number;
  sourceCount: number;
};

/** 生成人类可读的日期分组标题，今天和昨天使用相对称呼；可选追加当天文章和素材数量。 */
export function formatTableDayLabel(
  value: string | Date | null | undefined,
  now: Date = new Date(),
  counts?: TableDayCounts,
): string {
  const dayKey = toShanghaiDayKey(value);
  const todayKey = toShanghaiDayKey(now);
  if (!dayKey || !todayKey) return "";
  const [, month, day] = dayKey.split("-").map(Number);
  const dateLabel = `${month}月${day}日`;
  let label: string;
  if (dayKey === todayKey) label = `今天 · ${dateLabel}`;
  else if (dayKey === previousDayKey(todayKey)) label = `昨天 · ${dateLabel}`;
  else {
    // 日期键中午对应北京时间同一天，可避开跨时区解析日期字符串的偏移。
    const date = new Date(`${dayKey}T12:00:00+08:00`);
    label = `${dateLabel} · ${weekdayFormatter.format(date)}`;
  }
  if (!counts) return label;
  return `${label} · 文章 ${counts.articleCount} · 素材 ${counts.sourceCount}`;
}

/** 判断当前记录是否是当前页中的日期组首行；首条有效记录始终展示分组标题。 */
export function isTableDayStart<T>(
  rows: readonly T[],
  index: number,
  getTimestamp: (row: T) => string | Date | null | undefined,
): boolean {
  const currentKey = toShanghaiDayKey(getTimestamp(rows[index]));
  if (!currentKey) return false;
  if (index === 0) return true;
  return currentKey !== toShanghaiDayKey(getTimestamp(rows[index - 1]));
}
