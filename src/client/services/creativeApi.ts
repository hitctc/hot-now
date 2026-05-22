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
  images: string | ArticleImageEntry[] | null;
  coverImage: string[];
  coverImageIndex: number;
  titleIndex: number;
  status: string;
  anomalyReason: string | null;
  rawResponseText: string | null;
  wechatPublished: boolean;
  wechatThemeId: string | null;
  wechatHtml: string | null;
  pushCount: number;
  trendScore: number | null;
  trendBreakdown: TrendBreakdown | null;
  sourceTitle: string | null;
  publishedAt: string | null;
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
  status?: string;
  search?: string;
}): Promise<FinishedArticleListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return requestJson<FinishedArticleListResponse>(`/api/creative/finished-articles${qs ? `?${qs}` : ""}`);
}

export function readCreativeFinishedArticle(id: number): Promise<CreativeFinishedArticle> {
  return requestJson<CreativeFinishedArticle>(`/api/creative/finished-articles/${id}`);
}

// 切换成品文章的公众号发布状态
export function toggleFinishedArticlePublished(id: number): Promise<{ ok: boolean; wechatPublished: boolean }> {
  return requestJson<{ ok: boolean; wechatPublished: boolean }>(`/api/creative/finished-articles/${id}/toggle-published`, {
    method: "POST"
  });
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
    wechatThemeId?: string | null;
    wechatHtml?: string | null;
    coverImageIndex?: number;
    titleIndex?: number;
  }
): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`/actions/creative/finished-articles/${id}`, {
    method: "PUT",
    body: JSON.stringify(fields)
  });
}

// ─── WeChat Format ───

export type WechatThemeId = "bauhaus" | "sunset-film" | "receipt";

export const wechatThemeOptions: { value: WechatThemeId; label: string }[] = [
  { value: "bauhaus", label: "包豪斯" },
  { value: "sunset-film", label: "落日胶片" },
  { value: "receipt", label: "购物小票" }
];

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

// ─── WeChat Draft Push ───

export type PushDraftResult = {
  ok: boolean;
  mediaId?: string;
  errorCode?: string;
  errorMessage?: string;
  pushCount?: number;
};

export type PushStepId = "validate" | "compat" | "token" | "cover" | "images" | "draft" | "status";

export type PushProgressEvent = {
  step: PushStepId | "complete";
  status: "running" | "done" | "error";
  detail?: string;
  mediaId?: string;
  pushCount?: number;
  errorCode?: string;
  errorMessage?: string;
};

/** SSE 流式推送文章到微信草稿箱，逐条返回进度事件，最终返回 PushDraftResult */
export async function streamPushArticleToDraft(
  id: number,
  themeId: WechatThemeId,
  wechatHtml: string | undefined,
  onProgress: (event: PushProgressEvent) => void,
): Promise<PushDraftResult> {
  const response = await fetch(`/api/creative/finished-articles/${id}/push-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ themeId, wechatHtml }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body) throw new Error("ReadableStream 不可用");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: PushDraftResult = { ok: false, errorCode: "no-complete-event", errorMessage: "未收到完成事件" };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 事件以 \n\n 分隔
    const parts = buffer.split("\n\n");
    buffer = parts.pop()!;

    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6)) as PushProgressEvent;
          onProgress(event);
          if (event.step === "complete") {
            finalResult = {
              ok: event.status === "done",
              mediaId: event.mediaId,
              pushCount: event.pushCount,
              errorCode: event.errorCode,
              errorMessage: event.errorMessage,
            };
          }
        } catch { /* 跳过格式异常的事件 */ }
      }
    }
  }

  return finalResult;
}

export type PushLogEntry = {
  id: number;
  article_id: number;
  account_id: number;
  theme_id: string;
  media_id: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  pushed_at: string;
  account_name: string;
};

/** 获取文章推送记录 */
export function readArticlePushLog(id: number): Promise<{ ok: boolean; log: PushLogEntry[] }> {
  return requestJson<{ ok: boolean; log: PushLogEntry[] }>(
    `/api/creative/finished-articles/${id}/push-log`
  );
}

// ─── Cover Image Regen ───

export type RegenCoverResult = {
  ok: boolean;
  coverImage?: string[];
  reason?: string;
};

/** 调用后端代理重新生成封面图，返回更新后的 coverImage 数组 */
export function regenCover(id: number): Promise<RegenCoverResult> {
  return requestJson<RegenCoverResult>(`/api/creative/finished-articles/${id}/regen-cover`, {
    method: "POST",
  });
}

export type RegenTitleResult = {
  ok: boolean;
  titles?: string[];
  reason?: string;
};

/** 调用后端代理重新生成标题，返回更新后的 titles 数组 */
export function regenTitle(id: number): Promise<RegenTitleResult> {
  return requestJson<RegenTitleResult>(`/api/creative/finished-articles/${id}/regen-title`, {
    method: "POST",
  });
}
