import type { ContentCardView } from "./listContentView.js";

export interface ContentSourceDetailRow {
  metadataJson: string | null;
  sourceKind: string;
  sourceName: string;
}

/** 从采集元数据安全生成内容卡片的补充来源或作者信息。 */
export function resolveContentSourceDetail(row: ContentSourceDetailRow): ContentCardView["sourceDetail"] {
  const metadata = parseMetadataRecord(row.metadataJson);

  if (!metadata) return null;

  const collector = readRecord(metadata.collector);

  if (row.sourceKind === "wechat_rss") {
    return buildSourceDetail("来源标题", readString(collector?.displayName), row.sourceName);
  }

  if (row.sourceKind === "twitter_accounts" || row.sourceKind === "twitter_keyword_search") {
    const author = readRecord(metadata.author);
    const authorText = formatTwitterAuthor(
      readString(author?.name),
      readString(author?.username) ?? readString(collector?.username)
    );
    return buildSourceDetail("作者", authorText, row.sourceName);
  }

  if (row.sourceKind === "bilibili_search") return buildSourceDetail("UP主", readString(metadata.author), row.sourceName);
  if (row.sourceKind === "hackernews_search") return buildSourceDetail("作者", readString(metadata.author), row.sourceName);
  return null;
}

/** 非对象或损坏 JSON 必须降级为空，不能阻断内容页。 */
function parseMetadataRecord(rawValue: string | null): Record<string, unknown> | null {
  if (!rawValue) return null;
  try {
    return readRecord(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildSourceDetail(label: string, value: string | null, sourceName: string): ContentCardView["sourceDetail"] {
  return !value || value === sourceName.trim() ? null : { label, value };
}

function formatTwitterAuthor(name: string | null, username: string | null): string | null {
  return name && username ? `${name} @${username}` : name ?? (username ? `@${username}` : null);
}
