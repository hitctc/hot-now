import { requestModelTask as requestJson } from "./modelTaskRequest.js";
import type { ArticleTitleCandidate, CreativeFinishedArticle } from "./creativeListApi.js";
import type { GenerateCommentsResult } from "./creativeImageApi.js";


export function generateFinishedArticleCoverPrompt(
  id: number
): Promise<{ ok: boolean; taskId?: string; article?: CreativeFinishedArticle; reason?: string }> {
  return requestJson(`/api/creative/finished-articles/${id}/manual-text/cover-prompts`, {
    method: "POST"
  });
}

export function generateFinishedArticleInlinePrompts(
  id: number,
  index?: number
): Promise<{ ok: boolean; taskId?: string; article?: CreativeFinishedArticle; reason?: string }> {
  return requestJson(`/api/creative/finished-articles/${id}/manual-text/inline-prompts`, {
    method: "POST",
    body: JSON.stringify(index ? { index } : {})
  });
}

/** 调用后端代理按需生成读者评论+作者回复，返回更新后的 comments 数组 */
export function generateComments(id: number): Promise<GenerateCommentsResult> {
  return requestJson<GenerateCommentsResult>(`/api/creative/finished-articles/${id}/manual-text/comments`, {
    method: "POST",
  });
}

export type GenerateAuthorExtensionsResult = {
  ok: boolean;
  taskId?: string;
  extensions?: string[];
  reason?: string;
};

/** 调用后端代理按需生成作者拓展评论，返回更新后的 extensions 数组 */
export function generateAuthorExtensions(id: number): Promise<GenerateAuthorExtensionsResult> {
  return requestJson<GenerateAuthorExtensionsResult>(`/api/creative/finished-articles/${id}/manual-text/extensions`, {
    method: "POST",
  });
}

export type RegenTitleResult = {
  ok: boolean;
  taskId?: string;
  status?: "queued" | "writing" | "done" | "failed" | "stopped";
  article?: CreativeFinishedArticle;
  titles?: string[];
  titleCandidates?: ArticleTitleCandidate[];
  prompt?: string;
  reason?: string;
};

/** 提交人工标题任务，立即返回编号；候选在后台完成并回写。 */
export function regenTitle(id: number): Promise<RegenTitleResult> {
  return requestJson<RegenTitleResult>(`/api/creative/finished-articles/${id}/manual-text/title`, {
    method: "POST",
  });
}

export type RegenIntroResult = {
  ok: boolean;
  taskId?: string;
  status?: "queued" | "writing" | "done" | "failed" | "stopped";
  intros?: string[];
  updatedAt?: string;
  prompt?: string;
  reason?: string;
};

/** 提交导语任务；排队时立即返回 taskId，旧版同步接口仍可返回 intros。 */
export function regenIntro(id: number): Promise<RegenIntroResult> {
  return requestJson<RegenIntroResult>(`/api/creative/finished-articles/${id}/regen-intro`, {
    method: "POST",
  });
}

/** 查询指定文章的导语任务；完成后由 HotNow 返回已保存的导语及最新版本。 */
export function getRegenIntroStatus(id: number, taskId: string): Promise<RegenIntroResult> {
  return requestJson<RegenIntroResult>(`/api/creative/finished-articles/${id}/regen-intro/status?taskId=${encodeURIComponent(taskId)}`);
}

export type RegenSummaryResult = {
  ok: boolean;
  summary100?: string[];
  prompt?: string;
  reason?: string;
};
/** 提交当前文章摘要生成请求，返回现役接口的结果。 */
export function regenSummary(id: number): Promise<RegenSummaryResult> {
  return requestJson<RegenSummaryResult>(`/api/creative/finished-articles/${id}/regen-summary`, {
    method: "POST",
  });
}

export type RegenCodeImageKeywordsResult = {
  ok: boolean;
  taskId?: string;
  status?: "queued" | "writing" | "done" | "failed" | "stopped";
  keywords?: string[];
  article?: CreativeFinishedArticle;
  reason?: string;
};

/**
 * 提交成品标签任务并立即返回编号，不在 HTTP 请求内等待模型。
 * 后台按文章版本覆盖回写，完成后查询最新标签及图片过期状态。
 */
export function regenCodeImageKeywords(id: number): Promise<RegenCodeImageKeywordsResult> {
  return requestJson<RegenCodeImageKeywordsResult>(`/api/creative/finished-articles/${id}/manual-text/keywords`, {
    method: "POST",
  });
}

export type ManualModelOperation = "title" | "keywords" | "comments" | "extensions" | "summary" | "cover-prompts" | "inline-prompts" | "image-prompts";
export type ManualTextTaskResult = RegenTitleResult & RegenCodeImageKeywordsResult & GenerateCommentsResult & GenerateAuthorExtensionsResult;

/** 查询既有文案任务，完成后返回文章状态；查询不会再次提交或调用模型。 */
export function getManualTextTaskStatus(id: number, operation: ManualModelOperation, taskId: string): Promise<ManualTextTaskResult> {
  return requestJson<ManualTextTaskResult>(`/api/creative/finished-articles/${id}/manual-text/${operation}/status?taskId=${encodeURIComponent(taskId)}`);
}

/** 请求取消指定文章任务；执行中仅标记待取消，不能据响应提前宣布模型已停止。 */
export function cancelManualTextTask(id: number, taskId: string): Promise<{ ok: boolean; status?: string; reason?: string }> {
  return requestJson(`/api/creative/finished-articles/${id}/manual-text/cancel`, { method: "POST", body: JSON.stringify({ taskId }) });
}
