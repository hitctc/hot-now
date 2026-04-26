import { requestJson } from "./http";

export type ContentPageKey = "ai-new" | "ai-hot";
export type ContentSortMode = "published_at" | "content_score";
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
  sourceDetail?: {
    label: string;
    value: string;
  } | null;
  sourceKind?: string;
  canonicalUrl: string;
  publishedAt: string | null;
  contentScore: number;
  scoreBadges: string[];
  feedbackEntry?: ContentFeedbackEntry;
};

export type ContentSourceFilter = {
  options: { kind: string; name: string; showAllWhenSelected: boolean; currentPageVisibleCount: number }[];
  selectedSourceKinds: string[];
};

export type ContentTwitterAccountFilter = {
  options: { id: number; label: string; username: string }[];
  selectedAccountIds: number[];
};

export type ContentTwitterKeywordFilter = {
  options: { id: number; label: string }[];
  selectedKeywordIds: number[];
};

export type ContentWechatRssFilter = {
  options: { id: number; label: string; rssUrl: string }[];
  selectedSourceIds: number[];
};

export type ContentPageModel = {
  pageKey: ContentPageKey;
  sourceFilter?: ContentSourceFilter;
  twitterAccountFilter?: ContentTwitterAccountFilter;
  twitterKeywordFilter?: ContentTwitterKeywordFilter;
  wechatRssFilter?: ContentWechatRssFilter;
  featuredCard: ContentCard | null;
  cards: ContentCard[];
  strategySummary: {
    pageKey: ContentPageKey;
    items: string[];
  };
  pagination: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
  } | null;
  emptyState: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  } | null;
};

export type ContentFeedbackResponse = {
  ok: true;
  contentItemId: number;
  entryId: number;
};

export type SaveFeedbackPoolEntryPayload = {
  freeText: string;
  suggestedEffect: ContentFeedbackSuggestedEffect;
  strengthLevel: ContentFeedbackStrengthLevel;
  positiveKeywords: string[];
  negativeKeywords: string[];
};

export const CONTENT_SOURCE_STORAGE_KEY = "hot-now-content-sources";
export const CONTENT_SOURCE_STORAGE_VERSION_KEY = "hot-now-content-sources-version";
export const CONTENT_SORT_STORAGE_KEY = "hot-now-content-sort";
export const CONTENT_SEARCH_STORAGE_KEY = "hot-now-content-search";
export const CONTENT_TWITTER_ACCOUNT_STORAGE_KEY = "hot-now-twitter-account-filter";
export const CONTENT_TWITTER_KEYWORD_STORAGE_KEY = "hot-now-twitter-keyword-filter";
export const CONTENT_WECHAT_RSS_STORAGE_KEY = "hot-now-wechat-rss-filter";
const contentSourceStorageVersion = "2";

export type ReadContentPageOptions = {
  selectedSourceKinds?: string[];
  selectedTwitterAccountIds?: number[];
  selectedTwitterKeywordIds?: number[];
  selectedWechatRssSourceIds?: number[];
  sortMode?: ContentSortMode;
  page?: number;
  searchKeyword?: string;
};

// AI 新讯和 AI 热点的浏览偏好必须互不影响；旧共享 key 只作为迁移兜底读取。
function buildPageScopedStorageKey(key: string, pageKey?: ContentPageKey): string {
  return pageKey ? `${key}:${pageKey}` : key;
}

function hasPersistedValue(key: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

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

function readScopedPersistedStringArray(key: string, pageKey?: ContentPageKey): string[] | null {
  const scopedKey = buildPageScopedStorageKey(key, pageKey);

  if (pageKey && hasPersistedValue(scopedKey)) {
    return readPersistedStringArray(scopedKey);
  }

  return readPersistedStringArray(key);
}

function readPersistedNumberArray(key: string): number[] | null {
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

    return normalizeSelectedEntityIds(parsed.filter((value): value is number => typeof value === "number"));
  } catch {
    return null;
  }
}

function writePersistedNumberArray(key: string, values: number[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // localStorage 不可写时只做静默降级，页面仍然继续使用当前会话内状态。
  }
}

function readScopedPersistedNumberArray(key: string, pageKey?: ContentPageKey): number[] | null {
  const scopedKey = buildPageScopedStorageKey(key, pageKey);

  if (pageKey && hasPersistedValue(scopedKey)) {
    return readPersistedNumberArray(scopedKey);
  }

  return readPersistedNumberArray(key);
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

function readScopedPersistedStringValue(key: string, pageKey?: ContentPageKey): string | null {
  const scopedKey = buildPageScopedStorageKey(key, pageKey);

  if (pageKey && hasPersistedValue(scopedKey)) {
    return readPersistedStringValue(scopedKey);
  }

  return readPersistedStringValue(key);
}

function normalizeSelectedSourceKinds(selectedSourceKinds: string[]): string[] {
  return selectedSourceKinds
    .map((kind) => kind.trim())
    .filter((kind, index, array) => kind.length > 0 && array.indexOf(kind) === index);
}

function normalizeSelectedEntityIds(selectedIds: number[]): number[] {
  return selectedIds.filter((id, index, array) => Number.isInteger(id) && id > 0 && array.indexOf(id) === index);
}

// 搜索词会通过自定义 header 传给内容 API，这里先转成 ASCII 安全格式，避免中文等字符触发 ByteString 异常。
function encodeSearchKeywordHeaderValue(searchKeyword: string): string {
  return encodeURIComponent(searchKeyword);
}

function createContentPageRequestHeaders(
  selectedSourceKinds: string[] | undefined,
  selectedTwitterAccountIds: number[] | undefined,
  selectedTwitterKeywordIds: number[] | undefined,
  selectedWechatRssSourceIds: number[] | undefined,
  sortMode: ContentSortMode | undefined,
  searchKeyword: string | undefined
): HeadersInit | undefined {
  const headers: Record<string, string> = {};

  if (selectedSourceKinds !== undefined) {
    headers["x-hot-now-source-filter"] = normalizeSelectedSourceKinds(selectedSourceKinds).join(",");
  }

  if (sortMode !== undefined) {
    headers["x-hot-now-content-sort"] = sortMode;
  }

  if (selectedTwitterAccountIds !== undefined) {
    headers["x-hot-now-twitter-account-filter"] = normalizeSelectedEntityIds(selectedTwitterAccountIds).join(",");
  }

  if (selectedTwitterKeywordIds !== undefined) {
    headers["x-hot-now-twitter-keyword-filter"] = normalizeSelectedEntityIds(selectedTwitterKeywordIds).join(",");
  }

  if (selectedWechatRssSourceIds !== undefined) {
    headers["x-hot-now-wechat-rss-filter"] = normalizeSelectedEntityIds(selectedWechatRssSourceIds).join(",");
  }

  const normalizedSearchKeyword = typeof searchKeyword === "string" ? searchKeyword.trim() : "";
  if (normalizedSearchKeyword.length > 0) {
    headers["x-hot-now-content-search"] = encodeSearchKeywordHeaderValue(normalizedSearchKeyword);
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function buildContentPagePath(path: string, page: number | undefined): string {
  // 内容页分页状态只保留在 URL query 里，第一页继续回落到无 query 的短路径。
  if (typeof page !== "number" || !Number.isFinite(page) || page <= 1) {
    return path;
  }

  return `${path}?page=${encodeURIComponent(String(Math.floor(page)))}`;
}

async function readContentPage(
  path: string,
  options: ReadContentPageOptions = {}
): Promise<ContentPageModel> {
  return requestJson<ContentPageModel>(path, {
    headers: createContentPageRequestHeaders(
      options.selectedSourceKinds,
      options.selectedTwitterAccountIds,
      options.selectedTwitterKeywordIds,
      options.selectedWechatRssSourceIds,
      options.sortMode,
      options.searchKeyword
    )
  });
}

function postContentAction<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function isContentSourceStorageVersionCurrent(versionKey: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(versionKey) === contentSourceStorageVersion;
  } catch {
    return false;
  }
}

export function readStoredContentSourceKinds(pageKey?: ContentPageKey): string[] | null {
  const scopedStorageKey = buildPageScopedStorageKey(CONTENT_SOURCE_STORAGE_KEY, pageKey);
  const scopedVersionKey = buildPageScopedStorageKey(CONTENT_SOURCE_STORAGE_VERSION_KEY, pageKey);

  if (pageKey && (hasPersistedValue(scopedStorageKey) || hasPersistedValue(scopedVersionKey))) {
    return isContentSourceStorageVersionCurrent(scopedVersionKey)
      ? readPersistedStringArray(scopedStorageKey)
      : null;
  }

  if (!isContentSourceStorageVersionCurrent(CONTENT_SOURCE_STORAGE_VERSION_KEY)) {
    return null;
  }

  return readPersistedStringArray(CONTENT_SOURCE_STORAGE_KEY);
}

export function writeStoredContentSourceKinds(selectedSourceKinds: string[], pageKey?: ContentPageKey): void {
  const scopedStorageKey = buildPageScopedStorageKey(CONTENT_SOURCE_STORAGE_KEY, pageKey);
  const scopedVersionKey = buildPageScopedStorageKey(CONTENT_SOURCE_STORAGE_VERSION_KEY, pageKey);

  writePersistedStringArray(scopedStorageKey, normalizeSelectedSourceKinds(selectedSourceKinds));

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(scopedVersionKey, contentSourceStorageVersion);
    } catch {
      // localStorage 不可写时只影响下次刷新能否记住来源筛选，不影响当前页面渲染。
    }
  }
}

export function readStoredTwitterAccountIds(pageKey?: ContentPageKey): number[] | null {
  return readScopedPersistedNumberArray(CONTENT_TWITTER_ACCOUNT_STORAGE_KEY, pageKey);
}

export function writeStoredTwitterAccountIds(selectedAccountIds: number[], pageKey?: ContentPageKey): void {
  writePersistedNumberArray(
    buildPageScopedStorageKey(CONTENT_TWITTER_ACCOUNT_STORAGE_KEY, pageKey),
    normalizeSelectedEntityIds(selectedAccountIds)
  );
}

export function readStoredTwitterKeywordIds(pageKey?: ContentPageKey): number[] | null {
  return readScopedPersistedNumberArray(CONTENT_TWITTER_KEYWORD_STORAGE_KEY, pageKey);
}

export function writeStoredTwitterKeywordIds(selectedKeywordIds: number[], pageKey?: ContentPageKey): void {
  writePersistedNumberArray(
    buildPageScopedStorageKey(CONTENT_TWITTER_KEYWORD_STORAGE_KEY, pageKey),
    normalizeSelectedEntityIds(selectedKeywordIds)
  );
}

export function readStoredWechatRssSourceIds(pageKey?: ContentPageKey): number[] | null {
  return readScopedPersistedNumberArray(CONTENT_WECHAT_RSS_STORAGE_KEY, pageKey);
}

export function writeStoredWechatRssSourceIds(selectedSourceIds: number[], pageKey?: ContentPageKey): void {
  writePersistedNumberArray(
    buildPageScopedStorageKey(CONTENT_WECHAT_RSS_STORAGE_KEY, pageKey),
    normalizeSelectedEntityIds(selectedSourceIds)
  );
}

export function readStoredContentSortMode(pageKey?: ContentPageKey): ContentSortMode | null {
  const rawValue = readScopedPersistedStringValue(CONTENT_SORT_STORAGE_KEY, pageKey);
  return rawValue === "published_at" || rawValue === "content_score" ? rawValue : null;
}

export function writeStoredContentSortMode(sortMode: ContentSortMode, pageKey?: ContentPageKey): void {
  writePersistedStringValue(buildPageScopedStorageKey(CONTENT_SORT_STORAGE_KEY, pageKey), sortMode);
}

// 搜索词按内容页独立保存，避免 AI 新讯和 AI 热点互相带入上一次搜索。
export function readStoredContentSearchKeyword(pageKey?: ContentPageKey): string | null {
  return readScopedPersistedStringValue(CONTENT_SEARCH_STORAGE_KEY, pageKey);
}

// 持久化前会裁掉首尾空白，避免空格关键词污染 header 与本地偏好。
export function writeStoredContentSearchKeyword(keyword: string, pageKey?: ContentPageKey): void {
  writePersistedStringValue(buildPageScopedStorageKey(CONTENT_SEARCH_STORAGE_KEY, pageKey), keyword.trim());
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

export function deriveInitialSelectedEntityIds(
  options: Array<{ id: number }>,
  storedIds: number[] | null
): number[] {
  if (storedIds !== null) {
    return normalizeSelectedEntityIds(storedIds).filter((id) => options.some((option) => option.id === id));
  }

  return options.map((option) => option.id);
}

export function readAiNewPage(
  options: ReadContentPageOptions = {}
): Promise<ContentPageModel> {
  return readContentPage(buildContentPagePath("/api/content/ai-new", options.page), {
    selectedSourceKinds: options.selectedSourceKinds,
    selectedTwitterAccountIds: options.selectedTwitterAccountIds,
    selectedTwitterKeywordIds: options.selectedTwitterKeywordIds,
    selectedWechatRssSourceIds: options.selectedWechatRssSourceIds,
    sortMode: options.sortMode ?? "published_at",
    searchKeyword: options.searchKeyword
  });
}

export function readAiHotPage(
  options: ReadContentPageOptions = {}
): Promise<ContentPageModel> {
  return readContentPage(buildContentPagePath("/api/content/ai-hot", options.page), {
    selectedSourceKinds: options.selectedSourceKinds,
    selectedTwitterAccountIds: options.selectedTwitterAccountIds,
    selectedTwitterKeywordIds: options.selectedTwitterKeywordIds,
    selectedWechatRssSourceIds: options.selectedWechatRssSourceIds,
    sortMode: options.sortMode ?? "published_at",
    searchKeyword: options.searchKeyword
  });
}

export function saveFeedbackPoolEntry(
  contentItemId: number,
  payload: SaveFeedbackPoolEntryPayload
): Promise<ContentFeedbackResponse> {
  return postContentAction<ContentFeedbackResponse>(`/actions/content/${contentItemId}/feedback-pool`, payload);
}
