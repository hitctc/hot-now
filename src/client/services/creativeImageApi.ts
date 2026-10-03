import { requestModelTask as requestJson } from "./modelTaskRequest.js";
import type { ArticleComment, ArticleImageEntry, CreativeFinishedArticle } from "./creativeListApi.js";


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

/** 触发单篇短内容代码制图片，服务端负责幂等、存储、正文回写和封面候选更新。 */
export function generateFinishedArticleCodeImages(
  id: number,
  mode: "missing" | "all" = "missing",
): Promise<{ ok: boolean; status: "running" | "succeeded" | "partial" | "failed"; article?: CreativeFinishedArticle; reason?: string }> {
  return requestJson(`/actions/creative/finished-articles/${id}/code-images`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export type MissingImagesResponse = {
  missingCover?: Array<{ prompt: string }>;
  missingInline?: Array<{ imageIndex: number; prompt: string }>;
};
/** 读取文章缺失的封面与内联图提示词，不发起图片生成。 */
export function fetchMissingImages(id: number): Promise<MissingImagesResponse> {
  return requestJson<MissingImagesResponse>(`/api/creative/finished-articles/${id}/missing-images`);
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
/** 在浏览器读取本地文件并返回去掉数据前缀的 Base64；读取失败时拒绝。 */
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

// ─── Cover Image Regen ───

export type RegenCoverResult = {
  ok: boolean;
  coverImage?: string[];
  updatedAt?: string;
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
  taskId?: string;
  comments?: ArticleComment[];
  reason?: string;
};

export type RegenInlineImageResult = {
  ok: boolean;
  imageUrl?: string;
  imageIndex?: number;
  contentMarkdown?: string;
  images?: unknown[];
  updatedAt?: string;
  prompt?: string;
  reason?: string;
};
/** 提交指定内联图重生成请求，返回图片与回写版本。 */
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

// ─── GPT Luna 独立生图 ───

export type LunaImageTarget = "cover" | "inline";
export type LunaImageJobStatus = "queued" | "running" | "succeeded" | "failed" | "skipped" | "cancelled";

export type LunaImageJob = {
  jobId: string;
  articleId: number;
  target: LunaImageTarget;
  targetKey: string;
  imageIndex?: number | null;
  mode: "manual" | "auto-missing";
  status: LunaImageJobStatus;
  provider: "codex";
  model: "gpt-5.6-luna";
  imageUrl?: string;
  coverImage?: string[];
  images?: unknown[];
  contentMarkdown?: string;
  humanMarkdown?: string | null;
  error?: string;
  reason?: string;
  optimized?: boolean;
  sourceBytes?: number;
  uploadedBytes?: number;
  usage?: Record<string, number> | null;
  createdAt: string;
  updatedAt: string;
};

export type LunaImageJobResponse = {
  ok: boolean;
  eligible?: boolean;
  job?: LunaImageJob;
  reason?: string;
};

export type LunaImageJobsResponse = {
  ok: boolean;
  eligible?: boolean;
  jobs: LunaImageJob[];
  reason?: string;
};

/** 独立提交一个 Luna 图片提示词；提示词由服务端从文章读取。 */
export function enqueueLunaImageJob(
  articleId: number,
  target: LunaImageTarget,
  imageIndex?: number,
): Promise<LunaImageJobResponse> {
  const body: Record<string, unknown> = { target };
  if (target === "inline" && imageIndex != null) body.imageIndex = imageIndex;
  return requestJson<LunaImageJobResponse>(`/api/creative/finished-articles/${articleId}/luna-image`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** 读取当前文章每个 Luna 图片目标的异步任务状态。 */
export function fetchLunaImageJobs(articleId: number): Promise<LunaImageJobsResponse> {
  return requestJson<LunaImageJobsResponse>(`/api/creative/finished-articles/${articleId}/luna-image-jobs`);
}

// ─── 重新生成图片提示词 ───

export type RegenImagePromptsResult = {
  ok: boolean;
  taskId?: string;
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
