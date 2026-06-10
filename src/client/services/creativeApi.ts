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
  tracedSources: TracedSource[] | null;
  writable: boolean;
  writeCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TracedSource = {
  title: string;
  url: string;
  source_name: string;
  published_at?: string;
  relevance_score?: number;
  reason?: string;
};

// images 字段支持两种格式：纯 URL 字符串 或 带元数据的对象
export type ArticleImageEntry = string | {
  url: string;
  purpose?: string;
  alt?: string;
};

// 写作流程单步追踪
export type StepTraceEntry = {
  step: number;
  stepName: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  summary?: string;
  error?: string;
  meta?: Record<string, unknown>;
};

export type CreativeFinishedArticle = {
  id: number;
  sourceItemId: number;
  mode: string | null;
  thesis: string | null;
  intros: string[] | null;
  contentMarkdown: string;
  titles: string | null;
  hooks: string | null;
  quotes: string | null;
  summary100: string[] | null;
  imagesJson: string | ArticleImageEntry[] | null;
  images: string | ArticleImageEntry[] | null;
  coverImage: string[];
  coverImageIndex: number;
  titleIndex: number;
  introIndex: number;
  summaryIndex: number;
  status: string;
  anomalyReason: string | null;
  rawResponseText: string | null;
  wechatPublished: boolean;
  publishable: boolean;
  coverImagePrompt: string | null;
  inlineImagePrompts: Record<string, string> | null;
  similarityCheck: Record<string, unknown> | null;
  needsManualReview: boolean;
  manualReviewReason: string | null;
  manualReviewReasons: string[] | null;
  stepTrace: StepTraceEntry[] | null;
  currentStep: number | null;
  stopStep: number | null;
  reasonCode: string | null;
  reasonText: string | null;
  deletedAt: string | null;
  wechatThemeId: string | null;
  wechatHtml: string | null;
  pushCount: number;
  trendScore: number | null;
  trendBreakdown: TrendBreakdown | null;
  sourceTitle: string | null;
  sourceName: string | null;
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
  sourceName?: string;
  writable?: boolean;
  search?: string;
}): Promise<SourceItemListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.writingStatus) query.set("writingStatus", params.writingStatus);
  if (params?.collectorAgent) query.set("collectorAgent", params.collectorAgent);
  if (params?.sourceName) query.set("sourceName", params.sourceName);
  if (params?.writable) query.set("writable", "1");
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return requestJson<SourceItemListResponse>(`/api/creative/source-items${qs ? `?${qs}` : ""}`);
}

export function readCreativeSourceItem(id: number): Promise<CreativeSourceItem> {
  return requestJson<CreativeSourceItem>(`/api/creative/source-items/${id}`);
}

export function fetchSourceNames(): Promise<string[]> {
  return requestJson<string[]>("/api/creative/source-names");
}

export function toggleSourceItemWritable(id: number): Promise<{ ok: boolean; writable: boolean }> {
  return requestJson<{ ok: boolean; writable: boolean }>(`/actions/creative/source-items/${id}/toggle-writable`, { method: "POST" });
}

// ─── Finished Articles ───

export function readCreativeFinishedArticles(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  publishable?: string;
  includeDeleted?: string;
}): Promise<FinishedArticleListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.publishable) query.set("publishable", params.publishable);
  if (params?.includeDeleted) query.set("includeDeleted", params.includeDeleted);
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

export function toggleFinishedArticlePublishable(id: number): Promise<{ ok: boolean; publishable: boolean }> {
  return requestJson<{ ok: boolean; publishable: boolean }>(`/api/creative/finished-articles/${id}/toggle-publishable`, {
    method: "POST"
  });
}

export type MissingImagesResponse = {
  missingCover?: Array<{ prompt: string }>;
  missingInline?: Array<{ imageIndex: number; prompt: string }>;
};

// 软删除成品文章
export function deleteFinishedArticle(id: number): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`/api/creative/finished-articles/${id}`, {
    method: "DELETE"
  });
}

// 恢复已废弃的成品文章
export function restoreFinishedArticle(id: number): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`/actions/creative/finished-articles/${id}/restore`, {
    method: "POST"
  });
}

export function fetchMissingImages(id: number): Promise<MissingImagesResponse> {
  return requestJson<MissingImagesResponse>(`/api/creative/finished-articles/${id}/missing-images`);
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
    wechatThemeId?: string | null;
    wechatHtml?: string | null;
    coverImage?: string[];
    coverImageIndex?: number;
    titleIndex?: number;
    intros?: string[];
    introIndex?: number;
    summary100?: string[];
    summaryIndex?: number;
    coverImagePrompt?: string;
    inlineImagePrompts?: Record<string, string>;
    similarityCheck?: Record<string, unknown>;
    needsManualReview?: boolean;
    manualReviewReason?: string;
    manualReviewReasons?: string[];
    status?: string;
    anomalyReason?: string;
  }
): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`/actions/creative/finished-articles/${id}`, {
    method: "PUT",
    body: JSON.stringify(fields)
  });
}

// ─── 手动上传图片 ──

export type UploadedImage = {
  storedUrl: string;
  purpose: string;
  alt: string;
};

/** 将本地文件上传到服务端图片存储，返回可访问的 URL */
export async function uploadImages(
  files: File[],
  purpose: "cover" | "inline" = "cover",
): Promise<UploadedImage[]> {
  const images = await Promise.all(
    files.map(async (file) => {
      const data = await fileToBase64(file);
      return {
        data,
        filename: file.name,
        contentType: file.type,
        purpose,
      };
    }),
  );
  const res = await requestJson<{ ok: boolean; images: UploadedImage[]; failed?: Array<{ index: number; reason: string }> }>(
    "/actions/creative/images/upload",
    { method: "POST", body: JSON.stringify({ images }) },
  );
  return res.images;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 去掉 "data:image/png;base64," 前缀
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ─── WeChat Format ───

export type WechatThemeId = "classic" | "bauhaus" | "sunset-film" | "receipt";

export const wechatThemeOptions: { value: WechatThemeId; label: string }[] = [
  { value: "classic", label: "默认" },
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
  prompt?: string;
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
  prompt?: string;
  reason?: string;
};

/** 调用后端代理重新生成标题，返回更新后的 titles 数组 */
export function regenTitle(id: number): Promise<RegenTitleResult> {
  return requestJson<RegenTitleResult>(`/api/creative/finished-articles/${id}/regen-title`, {
    method: "POST",
  });
}

export type RegenIntroResult = {
  ok: boolean;
  intros?: string[];
  prompt?: string;
  reason?: string;
};

export function regenIntro(id: number): Promise<RegenIntroResult> {
  return requestJson<RegenIntroResult>(`/api/creative/finished-articles/${id}/regen-intro`, {
    method: "POST",
  });
}

export type RegenSummaryResult = {
  ok: boolean;
  summary100?: string[];
  prompt?: string;
  reason?: string;
};

export function regenSummary(id: number): Promise<RegenSummaryResult> {
  return requestJson<RegenSummaryResult>(`/api/creative/finished-articles/${id}/regen-summary`, {
    method: "POST",
  });
}

export type RegenInlineImageResult = {
  ok: boolean;
  imageUrl?: string;
  imageIndex?: number;
  contentMarkdown?: string;
  images?: unknown[];
  prompt?: string;
  reason?: string;
};

export function regenInlineImage(id: number, imageIndex: number): Promise<RegenInlineImageResult> {
  return requestJson<RegenInlineImageResult>(`/api/creative/finished-articles/${id}/regen-inline-image`, {
    method: "POST",
    body: JSON.stringify({ imageIndex }),
  });
}

// ─── 手动生图 API（始终可用，不受 image_gen_mode 限制） ───

export type ImageGenAction =
  | "fill-all" | "replace-all"
  | "fill-cover" | "replace-cover"
  | "fill-inline-all" | "replace-inline-all"
  | "fill-inline" | "replace-inline";

export type ImageGenResultItem = {
  type: "cover" | "inline";
  action: string;
  status: "success" | "failed" | "skipped";
  imageIndex?: number;
  coverUrl?: string;
  imageUrl?: string;
  error?: string;
  reason?: string;
};

export type ImageGenResponse = {
  success: boolean;
  articleId?: number;
  action?: string;
  results?: ImageGenResultItem[];
  summary?: { total: number; success: number; skipped: number; failed: number };
  error?: string;
};

/** 服务商手动生图（任何自动模式下都可调用） */
export function providerGenerateImage(articleId: number, action: ImageGenAction, imageIndex?: number): Promise<ImageGenResponse> {
  const body: Record<string, unknown> = { articleId, action };
  if (imageIndex != null) body.imageIndex = imageIndex;
  return requestJson<ImageGenResponse>("/api/provider/generate-image", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Codex 手动生图（任何自动模式下都可调用） */
export function codexGenerateImage(articleId: number, action: ImageGenAction, imageIndex?: number): Promise<ImageGenResponse> {
  const body: Record<string, unknown> = { articleId, action };
  if (imageIndex != null) body.imageIndex = imageIndex;
  return requestJson<ImageGenResponse>("/api/codex/generate-image-tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── 素材库写文章 ───

export type WriteArticleResult = {
  ok: boolean;
  status?: string;
  reason?: string;
};

/** 调用 Hermes write-article API（异步），可指定写作模式 */
export function writeSourceItemArticle(id: number, mode?: string): Promise<WriteArticleResult> {
  const body: Record<string, unknown> = {};
  if (mode) body.mode = mode;
  return requestJson<WriteArticleResult>(`/api/creative/source-items/${id}/write-article`, {
    method: "POST",
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
}

/** 修复图片提示词（代理 Hermes repair-image-prompts） */
export function repairImagePrompts(articleId: number): Promise<{ ok: boolean; error?: string }> {
  return requestJson(`/api/creative/finished-articles/${articleId}/repair-image-prompts`, {
    method: "POST",
  });
}

// ─── 重新生成图片提示词 ───

export type RegenImagePromptsResult = {
  ok: boolean;
  articleId?: number;
  thesis?: string;
  coverPromptLength?: number;
  inlinePromptCount?: number;
  /** 内联图序号列表 */
  inlinePromptKeys?: number[];
  designPlanImages?: number;
  warnings?: string[];
  reason?: string;
};

/** 根据当前正文重新生成所有图片提示词（覆盖旧值） */
export function regenImagePrompts(articleId: number): Promise<RegenImagePromptsResult> {
  return requestJson<RegenImagePromptsResult>(`/api/creative/finished-articles/${articleId}/regen-image-prompts`, {
    method: "POST",
  });
}

// ─── 写作队列状态 ───

export type WriteQueueTask = {
  task_id: string;
  label: string;
  priority: "high" | "normal";
  source_item_id: number;
  status: "writing" | "queued";
  submitted_at: string;
  started_at: string | null;
  /** 后端代理从本地素材表补充 */
  source_item_title?: string | null;
  source_item_source_name?: string | null;
};

export type WriteQueueStats = {
  total_submitted: number;
  total_completed: number;
  total_failed: number;
};

export type WriteQueueStatus = {
  current: WriteQueueTask | null;
  queue_length: number;
  queue: WriteQueueTask[];
  stats: WriteQueueStats;
  /** 本次队列运行首次开始执行的时间（Hermes 提供，暂未上线时为 undefined） */
  run_started_at?: string | null;
};

/** 查询 Hermes 写作队列状态 */
export function fetchWriteQueueStatus(): Promise<WriteQueueStatus> {
  return requestJson<WriteQueueStatus>("/api/creative/write-queue/status");
}

// ─── 手动输入内容写文章 ───

export type ManualWriteRequest = {
  title?: string;
  content: string;
  contentType: "viewpoint" | "article";
  mode?: "A" | "B" | "C";
};

export type ManualWriteResult = {
  ok: boolean;
  sourceItemId?: number;
  reason?: string;
};

/** 手动输入内容创建素材并触发写作 */
export function submitManualWrite(req: ManualWriteRequest): Promise<ManualWriteResult> {
  return requestJson<ManualWriteResult>("/actions/creative/source-items/manual-write", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ─── 素材溯源 ───

export function traceSourceItem(id: number): Promise<{ ok: boolean; status?: string; reason?: string }> {
  return requestJson("/actions/creative/source-items/" + id + "/trace", {
    method: "POST",
    body: "{}",
  });
}
