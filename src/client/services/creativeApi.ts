import { requestJson } from "./http.js";
import type {
  AccountFitDetails,
  AccountFitLevel,
  ArticleComment,
  ArticleImageEntry,
  ArticleRewriteLevel,
  ArticleTitleCandidate,
  CreativeFinishedArticle
} from "./creativeListApi.js";

// 保留原服务文件的公开出口，现有页面无需随模块拆分修改导入路径。
export * from "./creativeListApi.js";

// 图片转存属于成品编辑动作，不放进只读列表服务。
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

/** 切换素材可写状态并返回服务端最终值。 */
export function toggleSourceItemWritable(id: number): Promise<{ ok: boolean; writable: boolean }> {
  return requestJson<{ ok: boolean; writable: boolean }>(`/actions/creative/source-items/${id}/toggle-writable`, {
    method: "POST"
  });
}

/** 新建不经过素材库和写作管线的手动成品。 */
export function createManualFinishedArticle(input: {
  title: string;
  direction: "article" | "short_content";
  form?: "tuwen" | "duanwen";
}): Promise<CreativeFinishedArticle> {
  return requestJson<CreativeFinishedArticle>("/actions/creative/finished-articles/manual", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

/** 切换持久置顶状态，服务端返回更新后的完整记录。 */
export function toggleFinishedArticlePin(id: number): Promise<CreativeFinishedArticle> {
  return requestJson<CreativeFinishedArticle>(`/actions/creative/finished-articles/${id}/toggle-pin`, {
    method: "POST"
  });
}

export function generateFinishedArticleCoverPrompt(
  id: number
): Promise<{ ok: boolean; article: CreativeFinishedArticle }> {
  return requestJson(`/actions/creative/finished-articles/${id}/generate-cover-prompt`, {
    method: "POST"
  });
}

export function generateFinishedArticleInlinePrompts(
  id: number,
  index?: number
): Promise<{ ok: boolean; article: CreativeFinishedArticle }> {
  return requestJson(`/actions/creative/finished-articles/${id}/generate-inline-prompts`, {
    method: "POST",
    body: JSON.stringify(index ? { index } : {})
  });
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

/**
 * 保存公众号发布约三天后的最小效果数据。
 * 最终标题快照由服务端根据文章当前选择自动生成，不要求用户重复填写。
 */
export function saveArticlePerformanceFeedback(
  id: number,
  input: {
    deliveredUsers: number;
    readUsers: number;
    shareUsers: number;
    newFollowers?: number | null;
    rewriteLevel: ArticleRewriteLevel;
  }
): Promise<{ ok: boolean; performanceRecordedAt: string; performanceTitleSnapshot: string | null }> {
  return requestJson(`/actions/creative/finished-articles/${id}/performance-feedback`, {
    method: "PUT",
    body: JSON.stringify(input)
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
  writingStatus: "pending" | "ready" | "queued" | "writing" | "done" | "skipped" | "excluded" | "failed"
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
    humanMarkdown?: string | null;
    thesis?: string;
    titles?: string[];
    hooks?: string[];
    quotes?: string[];
    wechatThemeId?: string | null;
    wechatHtml?: string | null;
    coverImage?: string[];
    coverImageIndex?: number;
    titleIndex?: number;
    titleCandidates?: ArticleTitleCandidate[];
    titleSelectionConfirmed?: boolean;
    intros?: string[];
    introIndex?: number;
    summary100?: string[];
    summaryIndex?: number;
    coverImagePrompt?: string;
    inlineImagePrompts?: Record<string, string>;
    imagePrompts?: string[];
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

export type WechatThemeId = "classic" | "bauhaus" | "sunset-film" | "receipt" | "black-gold";

export const wechatThemeOptions: { value: WechatThemeId; label: string }[] = [
  { value: "classic", label: "默认" },
  { value: "bauhaus", label: "包豪斯" },
  { value: "sunset-film", label: "落日胶片" },
  { value: "receipt", label: "购物小票" },
  { value: "black-gold", label: "黑金主题" }
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

export type GenerateCommentsResult = {
  ok: boolean;
  comments?: ArticleComment[];
  reason?: string;
};

/** 调用后端代理按需生成读者评论+作者回复，返回更新后的 comments 数组 */
export function generateComments(id: number): Promise<GenerateCommentsResult> {
  return requestJson<GenerateCommentsResult>(`/api/creative/finished-articles/${id}/generate-comments`, {
    method: "POST",
  });
}

export type GenerateAuthorExtensionsResult = {
  ok: boolean;
  extensions?: string[];
  reason?: string;
};

/** 调用后端代理按需生成作者拓展评论，返回更新后的 extensions 数组 */
export function generateAuthorExtensions(id: number): Promise<GenerateAuthorExtensionsResult> {
  return requestJson<GenerateAuthorExtensionsResult>(`/api/creative/finished-articles/${id}/generate-author-extensions`, {
    method: "POST",
  });
}

export type RegenTitleResult = {
  ok: boolean;
  titles?: string[];
  titleCandidates?: ArticleTitleCandidate[];
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

export type RenderShortImageResult = {
  ok: boolean;
  imageUrl?: string;
  promptIndex?: number;
  images?: unknown[];
  provider?: string;
  model?: string;
  reason?: string;
};

/** 短内容配图：按第 promptIndex 条提示词出图，返回更新后的 images 数组（图后置，不注入正文） */
export function renderShortImage(id: number, promptIndex: number): Promise<RenderShortImageResult> {
  return requestJson<RenderShortImageResult>(`/api/creative/finished-articles/${id}/render-short-image`, {
    method: "POST",
    body: JSON.stringify({ promptIndex }),
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
  taskId?: string;
  reason?: string;
};

/** 调用 Hermes v2 write-article API（异步），只允许人工锁定核心立意。 */
export function writeSourceItemArticle(id: number, thesis?: string, forceAccountFit = false): Promise<WriteArticleResult> {
  const body: Record<string, unknown> = {};
  if (thesis) body.thesis = thesis;
  if (forceAccountFit) body.forceAccountFit = true;
  return requestJson<WriteArticleResult>(`/api/creative/source-items/${id}/write-article`, {
    method: "POST",
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
}

export type EvaluateAccountFitResult = {
  ok: boolean;
  accountFit?: {
    level: AccountFitLevel;
    reason: string;
    details: AccountFitDetails;
    ruleVersion: string;
  };
  reason?: string;
};

/** 立即评估并持久化单条素材的账号适配度。 */
export function evaluateSourceItemAccountFit(id: number): Promise<EvaluateAccountFitResult> {
  return requestJson<EvaluateAccountFitResult>(`/api/creative/source-items/${id}/evaluate-account-fit`, {
    method: "POST"
  });
}

/** 调用 Hermes /api/short/write 写短内容成品（tuwen/duanwen），异步。externalId 定位素材 */
export function writeSourceItemShort(id: number, externalId: string, form: "tuwen" | "duanwen" | "auto"): Promise<WriteArticleResult> {
  return requestJson<WriteArticleResult>(`/api/creative/source-items/${id}/write-short`, {
    method: "POST",
    body: JSON.stringify({ externalId, form }),
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
  status: "writing" | "queued" | "done" | "stopped" | "failed";
  submitted_at: string;
  started_at: string | null;
  finished_at?: string | null;
  stop_step?: number;
  stop_step_name?: string;
  reason_text?: string;
  error?: string;
  /** 后端代理从本地素材表补充 */
  source_item_title?: string | null;
  source_item_source_name?: string | null;
};

export type WriteQueueStats = {
  total_submitted: number;
  total_completed: number;
  total_failed: number;
  total_stopped?: number;
};

export type WriteQueueStatus = {
  current: WriteQueueTask | null;
  queue_length: number;
  queue: WriteQueueTask[];
  recent?: WriteQueueTask[];
  stats: WriteQueueStats;
  /** 本次队列运行首次开始执行的时间（Hermes 提供，暂未上线时为 undefined） */
  run_started_at?: string | null;
};

/** 查询 Hermes 写作队列状态 */
const WRITE_QUEUE_STATUS_CACHE_MS = 2_000;
let writeQueueStatusCache: { value: WriteQueueStatus; expiresAt: number } | null = null;
let writeQueueStatusRequest: Promise<WriteQueueStatus> | null = null;

/** 合并同一时刻的队列轮询，并用两秒短缓存吸收多个页面组件的重复请求。 */
export function fetchWriteQueueStatus(): Promise<WriteQueueStatus> {
  const now = Date.now();
  if (writeQueueStatusCache && writeQueueStatusCache.expiresAt > now) {
    return Promise.resolve(writeQueueStatusCache.value);
  }
  if (writeQueueStatusRequest) return writeQueueStatusRequest;

  writeQueueStatusRequest = requestJson<WriteQueueStatus>("/api/creative/write-queue/status")
    .then((value) => {
      writeQueueStatusCache = {
        value,
        expiresAt: Date.now() + WRITE_QUEUE_STATUS_CACHE_MS
      };
      return value;
    })
    .finally(() => {
      writeQueueStatusRequest = null;
    });

  return writeQueueStatusRequest;
}

// ─── 手动输入内容写文章 ───

export type ManualWriteRequest = {
  title?: string;
  content: string;
  contentType: "viewpoint" | "article";
  /** 短内容页面的兼容字段；公众号 v2 页面不再传递。 */
  mode?: "A" | "B" | "C";
  /** 可选：指定文章的核心观点/立意，锁定后不会被自动替换 */
  thesis?: string;
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
