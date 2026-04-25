export type AiTimelineEventKeyInput = {
  companyKey: string;
  title: string;
  publishedAt: string;
  detectedEntities?: readonly string[];
};

const actionWords = [
  "introducing",
  "announce",
  "announces",
  "announced",
  "release",
  "releases",
  "released",
  "launch",
  "launches",
  "launched",
  "update",
  "updates",
  "updated",
  "new",
  "preview"
];

const chineseActionWords = [
  "正式发布",
  "正式上线",
  "宣布",
  "发布",
  "推出",
  "上线",
  "更新",
  "开源",
  "预览"
];

// 事件 key 只用于合并同一官方事件的多条证据，保守优先：无法稳定归一时返回 null，避免误合并。
export function createAiTimelineEventKey(input: AiTimelineEventKeyInput): string | null {
  const company = toKeySegment(input.companyKey);
  const date = toDateSegment(input.publishedAt);
  const subject = readEntitySubject(input.detectedEntities) ?? toTitleSubject(input.title);

  if (!company || !date || !subject) {
    return null;
  }

  return `${company}:${subject}:${date}`;
}

function readEntitySubject(entities: readonly string[] | undefined): string | null {
  if (!entities) {
    return null;
  }

  for (const entity of entities) {
    const normalized = toKeySegment(entity);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function toTitleSubject(title: string): string | null {
  const withoutEnglishActions = actionWords.reduce(
    (value, word) => value.replace(new RegExp(`\\b${word}\\b`, "gi"), " "),
    title
  );
  const withoutActions = chineseActionWords.reduce(
    (value, word) => value.replaceAll(word, " "),
    withoutEnglishActions
  );

  return toKeySegment(withoutActions).slice(0, 80) || null;
}

function toDateSegment(value: string): string | null {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function toKeySegment(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[._/\\]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
