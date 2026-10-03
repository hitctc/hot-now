import { requestModelTask as requestJson } from "./modelTaskRequest.js";
import type { ArticleRewriteLevel, ArticleTitleCandidate, CreativeFinishedArticle } from "./creativeListApi.js";


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

// 切换成品文章的公众号发布状态
export function toggleFinishedArticlePublished(id: number): Promise<{ ok: boolean; wechatPublished: boolean }> {
  return requestJson<{ ok: boolean; wechatPublished: boolean }>(`/api/creative/finished-articles/${id}/toggle-published`, {
    method: "POST"
  });
}
/** 切换文章可发布标记，返回服务端最终值，不创建写作任务。 */
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
/** 保存指定文章的编辑字段；业务拒绝时抛错，禁止将失败显示为已保存。 */
export async function editFinishedArticle(
  id: number,
  fields: {
    expectedUpdatedAt?: string;
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
): Promise<{ ok: boolean; updatedAt?: string }> {
  const result = await requestJson<{ ok: boolean; updatedAt?: string }>(`/actions/creative/finished-articles/${id}`, {
    method: "PUT",
    body: JSON.stringify(fields)
  });
  // 兼容代理返回 2xx 但业务失败的情况，禁止自动保存把假成功显示给用户。
  if (result?.ok !== true) throw new Error("finished article edit was not accepted");
  return result;
}
