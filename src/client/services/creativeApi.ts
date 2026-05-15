import { requestJson } from "./http.js";

// ─── Types ───

export type TrendBreakdown = {
  topicPower: number;
  emotionResonance: number;
  infoGap: number;
  socialCurrency: number;
  timingWindow: number;
  audienceBreadth: number;
};

export type CreativeSourceItem = {
  id: number;
  externalId: string;
  collectorAgent: string;
  title: string;
  url: string;
  sourceName: string | null;
  summary: string | null;
  fullContent: string | null;
  author: string | null;
  coverImageUrl: string | null;
  tags: string | null;
  language: string;
  wordCount: number | null;
  contentType: string | null;
  score: number | null;
  publishedAt: string | null;
  collectorTimestamp: string | null;
  writingStatus: string;
  rawPayloadJson: string;
  trendScore: number | null;
  trendBreakdown: TrendBreakdown | null;
  linkedArticleId: number | null;
  createdAt: string;
  updatedAt: string;
};

// images 字段支持两种格式：纯 URL 字符串 或 带元数据的对象
export type ArticleImageEntry = string | {
  url: string;
  purpose?: string;
  alt?: string;
};

export type CreativeFinishedArticle = {
  id: number;
  sourceItemId: number;
  mode: string | null;
  thesis: string | null;
  contentMarkdown: string;
  titles: string | null;
  hooks: string | null;
  quotes: string | null;
  summary100: string | null;
  imagesJson: string | ArticleImageEntry[] | null;
  status: string;
  rawResponseText: string | null;
  trendScore: number | null;
  trendBreakdown: TrendBreakdown | null;
  createdAt: string;
  updatedAt: string;
};

export type SourceItemListResponse = {
  items: CreativeSourceItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type FinishedArticleListResponse = {
  items: CreativeFinishedArticle[];
  total: number;
  page: number;
  pageSize: number;
};

// 图片转存接口类型
export type ImageUploadInput = {
  url: string;
  purpose?: string;
  alt?: string;
};

export type ImageUploadResult = {
  originalUrl: string;
  storedUrl: string;
  purpose: string;
  alt: string;
};

export type ImageUploadResponse = {
  images: ImageUploadResult[];
  failed?: Array<{ url: string; reason: string }>;
};

// ─── Source Items ───

export function readCreativeSourceItems(params?: {
  page?: number;
  pageSize?: number;
  writingStatus?: string;
  collectorAgent?: string;
  search?: string;
}): Promise<SourceItemListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.writingStatus) query.set("writingStatus", params.writingStatus);
  if (params?.collectorAgent) query.set("collectorAgent", params.collectorAgent);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return requestJson<SourceItemListResponse>(`/api/creative/source-items${qs ? `?${qs}` : ""}`);
}

export function readCreativeSourceItem(id: number): Promise<CreativeSourceItem> {
  return requestJson<CreativeSourceItem>(`/api/creative/source-items/${id}`);
}

// ─── Finished Articles ───

export function readCreativeFinishedArticles(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<FinishedArticleListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return requestJson<FinishedArticleListResponse>(`/api/creative/finished-articles${qs ? `?${qs}` : ""}`);
}

export function readCreativeFinishedArticle(id: number): Promise<CreativeFinishedArticle> {
  return requestJson<CreativeFinishedArticle>(`/api/creative/finished-articles/${id}`);
}

// ─── Actions ───

export function updateSourceItemWritingStatus(
  id: number,
  writingStatus: "ready" | "writing" | "done" | "skipped"
): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`/actions/creative/source-items/${id}/writing-status`, {
    method: "POST",
    body: JSON.stringify({ writingStatus })
  });
}

export function editFinishedArticle(
  id: number,
  fields: {
    contentMarkdown?: string;
    thesis?: string;
    titles?: string[];
    hooks?: string[];
    quotes?: string[];
    summary100?: string;
  }
): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`/actions/creative/finished-articles/${id}`, {
    method: "PUT",
    body: JSON.stringify(fields)
  });
}

// ─── WeChat Format ───

export type WechatThemeId = "pure-white" | "warm-oat" | "dark-pro";

export const wechatThemeOptions: { value: WechatThemeId; label: string }[] = [
  { value: "pure-white", label: "纯净白" },
  { value: "warm-oat", label: "燕麦暖色" },
  { value: "dark-pro", label: "暗夜 Pro" }
];

export function renderWechatFormat(
  id: number,
  theme: WechatThemeId
): Promise<{ ok: boolean; html?: string }> {
  return requestJson<{ ok: boolean; html?: string }>(
    `/api/creative/finished-articles/${id}/wechat-format`,
    { method: "POST", body: JSON.stringify({ theme }) }
  );
}

// ─── Image Upload ───

export function uploadImagesByUrl(images: ImageUploadInput[]): Promise<ImageUploadResponse> {
  return requestJson<ImageUploadResponse>("/api/creative/images/upload-by-url", {
    method: "POST",
    body: JSON.stringify({ images })
  });
}

// ─── Images 辅助函数 ───

/** 从 imagesJson 字段解析出标准化的图片条目列表，兼容已解析的数组和原始字符串 */
export function parseArticleImages(imagesJson: string | ArticleImageEntry[] | null): ArticleImageEntry[] {
  if (!imagesJson) return [];
  if (Array.isArray(imagesJson)) return imagesJson;
  try {
    const parsed = JSON.parse(imagesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 从任意格式的图片条目中提取 URL */
export function extractImageUrl(entry: ArticleImageEntry): string {
  return typeof entry === "string" ? entry : entry.url;
}
