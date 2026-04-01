import { requestJson } from "./http";

export type ContentPageKey = "ai-new" | "ai-hot";
export type ContentSortMode = "published_at" | "content_score";
export type ContentReaction = "like" | "dislike" | "none";
export type ContentFeedbackSuggestedEffect = "boost" | "penalize" | "block" | "neutral" | "";
export type ContentFeedbackStrengthLevel = "high" | "medium" | "low" | "";

export type ContentFeedbackEntry = {
  freeText: string | null;
  suggestedEffect: string | null;
  strengthLevel: string | null;
  positiveKeywords: string[];
  negativeKeywords: string[];
};

export type ContentCard = {
  id: number;
  title: string;
  summary: string;
  sourceName: string;
  sourceKind?: string;
  canonicalUrl: string;
  publishedAt: string | null;
  isFavorited: boolean;
  reaction: ContentReaction;
  contentScore: number;
  scoreBadges: string[];
  feedbackEntry?: ContentFeedbackEntry;
};

export type ContentSourceFilter = {
  options: { kind: string; name: string; showAllWhenSelected: boolean; currentPageVisibleCount: number }[];
  selectedSourceKinds: string[];
};

export type ContentPageModel = {
  pageKey: ContentPageKey;
  sourceFilter?: ContentSourceFilter;
  featuredCard: ContentCard | null;
  cards: ContentCard[];
  emptyState: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  } | null;
};

export type ContentFavoriteResponse = {
  ok: true;
  contentItemId: number;
  isFavorited: boolean;
};

export type ContentReactionResponse = {
  ok: true;
  contentItemId: number;
  reaction: ContentReaction;
};

export type ContentFeedbackResponse = {
  ok: true;
  contentItemId: number;
  entryId: number;
};

export type SaveFeedbackPoolEntryPayload = {
  reactionSnapshot: ContentReaction;
  freeText: string;
  suggestedEffect: ContentFeedbackSuggestedEffect;
  strengthLevel: ContentFeedbackStrengthLevel;
  positiveKeywords: string[];
  negativeKeywords: string[];
};

export const CONTENT_SOURCE_STORAGE_KEY = "hot-now-content-sources";
export const CONTENT_SORT_STORAGE_KEY = "hot-now-content-sort";

// 内容筛选偏好只允许 string[]，其他脏数据一律回落到 null，交给页面决定默认行为。
function readPersistedStringArray(key: string): string[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(key);

    if (rawValue === null) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) {
      return null;
    }

    return normalizeSelectedSourceKinds(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return null;
  }
}

function writePersistedStringArray(key: string, values: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // localStorage 不可写时只做静默降级，页面仍然继续使用当前会话内状态。
  }
}

function readPersistedStringValue(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return typeof rawValue === "string" && rawValue.trim() ? rawValue : null;
  } catch {
    return null;
  }
}

function writePersistedStringValue(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage 不可写时只做静默降级，页面仍然继续使用当前会话内状态。
  }
}

function normalizeSelectedSourceKinds(selectedSourceKinds: string[]): string[] {
  return selectedSourceKinds
    .map((kind) => kind.trim())
    .filter((kind, index, array) => kind.length > 0 && array.indexOf(kind) === index);
}

function createContentPageRequestHeaders(
  selectedSourceKinds: string[] | undefined,
  sortMode: ContentSortMode | undefined
): HeadersInit | undefined {
  const headers: Record<string, string> = {};

  if (selectedSourceKinds !== undefined) {
    headers["x-hot-now-source-filter"] = normalizeSelectedSourceKinds(selectedSourceKinds).join(",");
  }

  if (sortMode !== undefined) {
    headers["x-hot-now-content-sort"] = sortMode;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

async function readContentPage(
  path: string,
  selectedSourceKinds?: string[],
  sortMode?: ContentSortMode
): Promise<ContentPageModel> {
  return requestJson<ContentPageModel>(path, {
    headers: createContentPageRequestHeaders(selectedSourceKinds, sortMode)
  });
}

function postContentAction<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export function readStoredContentSourceKinds(): string[] | null {
  return readPersistedStringArray(CONTENT_SOURCE_STORAGE_KEY);
}

export function writeStoredContentSourceKinds(selectedSourceKinds: string[]): void {
  writePersistedStringArray(CONTENT_SOURCE_STORAGE_KEY, normalizeSelectedSourceKinds(selectedSourceKinds));
}

export function readStoredContentSortMode(): ContentSortMode | null {
  const rawValue = readPersistedStringValue(CONTENT_SORT_STORAGE_KEY);
  return rawValue === "published_at" || rawValue === "content_score" ? rawValue : null;
}

export function writeStoredContentSortMode(sortMode: ContentSortMode): void {
  writePersistedStringValue(CONTENT_SORT_STORAGE_KEY, sortMode);
}

export function deriveInitialSelectedSourceKinds(
  options: ContentSourceFilter["options"],
  storedKinds: string[] | null
): string[] {
  if (storedKinds !== null) {
    return normalizeSelectedSourceKinds(storedKinds);
  }

  return options.filter((option) => !option.showAllWhenSelected).map((option) => option.kind);
}

export function readAiNewPage(
  selectedSourceKinds?: string[],
  sortMode: ContentSortMode = "published_at"
): Promise<ContentPageModel> {
  return readContentPage("/api/content/ai-new", selectedSourceKinds, sortMode);
}

export function readAiHotPage(
  selectedSourceKinds?: string[],
  sortMode: ContentSortMode = "published_at"
): Promise<ContentPageModel> {
  return readContentPage("/api/content/ai-hot", selectedSourceKinds, sortMode);
}

export function saveFavorite(contentItemId: number, isFavorited: boolean): Promise<ContentFavoriteResponse> {
  return postContentAction<ContentFavoriteResponse>(`/actions/content/${contentItemId}/favorite`, { isFavorited });
}

export function saveReaction(contentItemId: number, reaction: Exclude<ContentReaction, "none">): Promise<ContentReactionResponse> {
  return postContentAction<ContentReactionResponse>(`/actions/content/${contentItemId}/reaction`, { reaction });
}

export function saveFeedbackPoolEntry(
  contentItemId: number,
  payload: SaveFeedbackPoolEntryPayload
): Promise<ContentFeedbackResponse> {
  return postContentAction<ContentFeedbackResponse>(`/actions/content/${contentItemId}/feedback-pool`, payload);
}
