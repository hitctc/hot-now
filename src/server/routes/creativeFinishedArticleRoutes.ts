import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SqliteDatabase } from "../../core/db/openDatabase.js";
import {
  findCreativeSourceItemByExternalId,
  updateCreativeSourceItemLinkedArticle,
  updateCreativeSourceItemTrendScore,
  updateCreativeSourceItemWritingStatus,
} from "../../core/creative/creativeSourceItemRepository.js";
import {
  editCreativeFinishedArticle,
  findCreativeFinishedArticleById,
  findCreativeFinishedArticleBySourceItemId,
  insertCreativeFinishedArticle,
  restoreFinishedArticle,
  saveArticlePerformanceFeedback,
  softDeleteFinishedArticle,
  togglePinnedFinishedArticle,
  togglePublishable,
  toggleWechatPublished,
  type CreativeFinishedArticleRecord,
} from "../../core/creative/creativeFinishedArticleRepository.js";
import {
  buildInlinePromptSource,
  planInlineImagePlaceholders,
} from "../../core/creative/inlineImagePromptPlanner.js";

export type CreativeFinishedArticleRouteOptions = {
  db?: SqliteDatabase;
  authorizeCreativeApiToken: (request: FastifyRequest, reply: FastifyReply) => boolean;
  hasCreativeApiToken: (request: FastifyRequest) => boolean;
  readSession: (request: FastifyRequest, reply: FastifyReply) => unknown | undefined;
  authorizeStateAction: (request: FastifyRequest, reply: FastifyReply) => boolean;
  pushArticleToWechatDraft?: (
    articleId: number,
    themeId: string,
    wechatHtml?: string,
    onProgress?: (step: string, status: "running" | "done" | "error", detail?: string) => void | Promise<void>
  ) => Promise<{ ok: boolean; mediaId?: string; errorCode?: string; errorMessage?: string; hint?: string; pushCount?: number }>;
  getArticleWechatPushLog?: (articleId: number) => unknown[];
};

type HermesImagePromptResult =
  | { ok: true; status: 200; coverPrompt: string | null; inlinePrompts: Record<string, string> | null }
  | { ok: false; status: number; reason: string };

/**
 * 调用 Hermes 只生成指定范围的提示词；结果不由 Hermes 回写，调用路由负责原子保存。
 */
async function requestImagePromptsFromHermes(
  article: CreativeFinishedArticleRecord,
  input: { scope: "cover" | "inline"; content: string; inlineIndex?: number }
): Promise<HermesImagePromptResult> {
  const hermesApiUrl = process.env.HERMES_API_BASE_URL;
  const hermesApiToken = process.env.HERMES_API_TOKEN;
  if (!hermesApiUrl || !hermesApiToken) {
    return { ok: false, status: 503, reason: "hermes-api-not-configured" };
  }

  const titleIndex = Math.min(article.titleIndex ?? 0, Math.max(0, (article.titles?.length ?? 1) - 1));
  const title = article.titles?.[titleIndex] ?? article.titles?.[0] ?? "未命名文章";
  try {
    const response = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/articles/regen-image-prompts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${hermesApiToken}`,
      },
      body: JSON.stringify({
        articleId: article.id,
        scope: input.scope,
        content: input.content,
        title,
        thesis: article.thesis || undefined,
        summary: article.summary100?.[0] || undefined,
        inlineIndex: input.inlineIndex,
        writeBack: false,
      }),
      signal: AbortSignal.timeout(300_000),
    });
    const data = await response.json().catch(() => ({})) as {
      success?: boolean;
      error?: string;
      coverPrompt?: unknown;
      inlinePrompts?: unknown;
    };
    if (!response.ok || !data.success) {
      return {
        ok: false,
        status: response.status >= 500 ? 502 : response.status,
        reason: data.error ?? `Hermes HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      status: 200,
      coverPrompt: typeof data.coverPrompt === "string" ? data.coverPrompt : null,
      inlinePrompts: data.inlinePrompts && typeof data.inlinePrompts === "object"
        ? data.inlinePrompts as Record<string, string>
        : null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      reason: `Hermes 调用失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** 注册成品文章写入、编辑、发布与提示词路由，保持既有 HTTP 契约。 */
export function registerCreativeFinishedArticleRoutes(
  app: FastifyInstance,
  options: CreativeFinishedArticleRouteOptions
): void {
  const { db } = options;

app.post("/api/creative/finished-articles", async (request, reply) => {
  if (!options.authorizeCreativeApiToken(request, reply)) {
    return;
  }

  const body = request.body as Record<string, unknown> | undefined;
  const sourceExternalId = typeof body?.sourceExternalId === "string" ? body.sourceExternalId.trim() : "";
  const collectorAgent = typeof body?.collectorAgent === "string" ? body.collectorAgent.trim() : "";
  const contentMarkdown = typeof body?.contentMarkdown === "string" ? body.contentMarkdown.trim() : "";

  if (!sourceExternalId || !collectorAgent || !contentMarkdown) {
    return reply.code(400).send({ ok: false, reason: "missing-required-fields" });
  }

  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const sourceItem = findCreativeSourceItemByExternalId(db, sourceExternalId, collectorAgent);
  if (!sourceItem) {
    return reply.code(404).send({ ok: false, reason: "source-item-not-found" });
  }

  const existing = findCreativeFinishedArticleBySourceItemId(db, sourceItem.id);
  const allowDuplicate = body?.allowDuplicate === true;
  if (existing && !allowDuplicate) {
    return reply.code(409).send({ ok: false, reason: "article-already-exists" });
  }

  const article = insertCreativeFinishedArticle(db, {
    sourceItemId: sourceItem.id,
    mode: typeof body?.mode === "string" ? (body.mode as "A" | "B") : undefined,
    thesis: typeof body?.thesis === "string" ? body.thesis : undefined,
    intros: Array.isArray(body?.intros) ? body.intros as string[] : undefined,
    contentMarkdown,
    titles: Array.isArray(body?.titles) ? body.titles as string[] : undefined,
    hooks: Array.isArray(body?.hooks) ? body.hooks as string[] : undefined,
    quotes: Array.isArray(body?.quotes) ? body.quotes as string[] : undefined,
    summary100: Array.isArray(body?.summary100) ? body.summary100 as string[] : (typeof body?.summary100 === "string" ? [body.summary100] : undefined),
    images: Array.isArray(body?.images) ? body.images as any[] : undefined,
    coverImage: Array.isArray(body?.coverImage) ? body.coverImage as string[] : (typeof body?.coverImage === "string" ? [body.coverImage] : undefined),
    rawResponseText: typeof body?.rawResponseText === "string" ? body.rawResponseText : undefined,
    coverImagePrompt: typeof body?.coverImagePrompt === "string" ? body.coverImagePrompt : undefined,
    inlineImagePrompts: body?.inlineImagePrompts && typeof body.inlineImagePrompts === "object" ? body.inlineImagePrompts as Record<string, string> : undefined,
    similarityCheck: body?.similarityCheck && typeof body.similarityCheck === "object" ? body.similarityCheck as Record<string, unknown> : undefined,
    needsManualReview: typeof body?.needsManualReview === "boolean" ? body.needsManualReview : undefined,
    manualReviewReason: typeof body?.manualReviewReason === "string" ? body.manualReviewReason : undefined,
    manualReviewReasons: Array.isArray(body?.manualReviewReasons) ? body.manualReviewReasons as string[] : undefined,
    status: typeof body?.status === "string" ? body.status : undefined,
    anomalyReason: typeof body?.anomalyReason === "string" ? body.anomalyReason : undefined,
    stepTrace: Array.isArray(body?.stepTrace) ? body.stepTrace as any[] : undefined,
    currentStep: typeof body?.currentStep === "number" ? body.currentStep : undefined,
    stopStep: typeof body?.stopStep === "number" ? body.stopStep : undefined,
    reasonCode: typeof body?.reasonCode === "string" ? body.reasonCode : undefined,
    reasonText: typeof body?.reasonText === "string" ? body.reasonText : undefined,
    direction: typeof body?.direction === "string" ? body.direction : undefined,
    form: typeof body?.form === "string" ? body.form : undefined,
    reversalScore: typeof body?.reversalScore === "number" ? body.reversalScore : undefined,
    reversalAngle: typeof body?.reversalAngle === "string" ? body.reversalAngle : undefined,
    imagePrompts: Array.isArray(body?.imagePrompts) ? body.imagePrompts as string[] : undefined,
    comments: Array.isArray(body?.comments)
      ? body.comments.filter((c): c is { reader: string; author_reply: string } =>
          !!c && typeof c.reader === "string" && typeof c.author_reply === "string")
      : undefined,
    authorExtensions: Array.isArray(body?.authorExtensions)
      ? body.authorExtensions.filter((s): s is string => typeof s === "string")
      : undefined,
    pipelineVersion: typeof body?.pipelineVersion === "string" ? body.pipelineVersion : undefined,
    readerTask: typeof body?.readerTask === "string" ? body.readerTask : undefined,
    readerRelevance: body?.readerRelevance && typeof body.readerRelevance === "object" ? body.readerRelevance as Record<string, unknown> : undefined,
    evidencePack: body?.evidencePack && typeof body.evidencePack === "object" ? body.evidencePack as Record<string, unknown> : undefined,
    readerValuePlan: body?.readerValuePlan && typeof body.readerValuePlan === "object" ? body.readerValuePlan as Record<string, unknown> : undefined,
    factSkeleton: body?.factSkeleton && typeof body.factSkeleton === "object" ? body.factSkeleton as Record<string, unknown> : undefined,
    oralDraft: typeof body?.oralDraft === "string" ? body.oralDraft : undefined,
    titleCandidates: Array.isArray(body?.titleCandidates) ? body.titleCandidates as any[] : undefined,
    factSourceChecklist: Array.isArray(body?.factSourceChecklist) ? body.factSourceChecklist : undefined,
    titleSelectionConfirmed: typeof body?.titleSelectionConfirmed === "boolean" ? body.titleSelectionConfirmed : undefined,
  });

  // 推送成品文章后，自动将素材写作状态标为 done
  updateCreativeSourceItemLinkedArticle(db, sourceItem.id, article.id);
  updateCreativeSourceItemWritingStatus(db, sourceItem.id, "done");

  return reply.code(201).send({
    id: article.id,
    sourceItemId: sourceItem.id,
    created: true
  });
});
app.patch("/api/creative/finished-articles/:id", async (request, reply) => {
  const hasToken = options.hasCreativeApiToken(request);
  if (!hasToken) {
    const session = options.readSession(request, reply);
    if (session === undefined) { return; }
  }

  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const params = request.params as { id: string };
  const id = parseInt(params.id, 10);
  const body = request.body as Record<string, unknown> | undefined;
  const article = findCreativeFinishedArticleById(db, id);
  if (!article) {
    return reply.code(404).send({ message: "Finished article not found", statusCode: 404 });
  }

  const updatedFields: string[] = [];

  // finished_articles 表字段
  const editInput: Record<string, unknown> = {};
  if (body?.contentMarkdown !== undefined) { editInput.contentMarkdown = body.contentMarkdown; updatedFields.push("contentMarkdown"); }
  if (body?.images !== undefined) { editInput.images = body.images; updatedFields.push("images"); }
  if (body?.coverImage !== undefined) {
    // 兼容字符串和数组两种格式
    editInput.coverImage = Array.isArray(body.coverImage)
      ? body.coverImage as string[]
      : typeof body.coverImage === "string" ? [body.coverImage] : [];
    updatedFields.push("coverImage");
  }
  if (body?.coverImageIndex !== undefined && typeof body.coverImageIndex === "number") {
    editInput.coverImageIndex = body.coverImageIndex;
    updatedFields.push("coverImageIndex");
  }
  if (body?.titleIndex !== undefined && typeof body.titleIndex === "number") {
    editInput.titleIndex = body.titleIndex;
    updatedFields.push("titleIndex");
  }
  if (Array.isArray(body?.titleCandidates)) {
    editInput.titleCandidates = body.titleCandidates;
    updatedFields.push("titleCandidates");
  }
  if (typeof body?.titleSelectionConfirmed === "boolean") {
    editInput.titleSelectionConfirmed = body.titleSelectionConfirmed;
    updatedFields.push("titleSelectionConfirmed");
  }
  if (body?.intros !== undefined) {
    editInput.intros = Array.isArray(body.intros) ? body.intros as string[] : [];
    updatedFields.push("intros");
  }
  if (body?.introIndex !== undefined && typeof body.introIndex === "number") {
    editInput.introIndex = body.introIndex;
    updatedFields.push("introIndex");
  }
  if (body?.titles !== undefined) { editInput.titles = body.titles; updatedFields.push("titles"); }
  if (body?.thesis !== undefined) { editInput.thesis = body.thesis; updatedFields.push("thesis"); }
  if (body?.summary100 !== undefined) {
    editInput.summary100 = Array.isArray(body.summary100) ? body.summary100 as string[] : (typeof body.summary100 === "string" ? [body.summary100] : []);
    updatedFields.push("summary100");
  }
  if (body?.summaryIndex !== undefined && typeof body.summaryIndex === "number") {
    editInput.summaryIndex = body.summaryIndex;
    updatedFields.push("summaryIndex");
  }
  if (body?.status !== undefined) { editInput.status = body.status; updatedFields.push("status"); }
  if (body?.anomalyReason !== undefined) { editInput.anomalyReason = body.anomalyReason; updatedFields.push("anomalyReason"); }
  if (body?.wechatThemeId !== undefined) { editInput.wechatThemeId = body.wechatThemeId; updatedFields.push("wechatThemeId"); }
  if (body?.wechatHtml !== undefined) { editInput.wechatHtml = body.wechatHtml; updatedFields.push("wechatHtml"); }
  if (body?.coverImagePrompt !== undefined) { editInput.coverImagePrompt = body.coverImagePrompt; updatedFields.push("coverImagePrompt"); }
  if (body?.inlineImagePrompts !== undefined) { editInput.inlineImagePrompts = body.inlineImagePrompts; updatedFields.push("inlineImagePrompts"); }
  if (body?.imagePrompts !== undefined) { editInput.imagePrompts = body.imagePrompts; updatedFields.push("imagePrompts"); }
  if (body?.comments !== undefined) { editInput.comments = body.comments; updatedFields.push("comments"); }
  if (body?.authorExtensions !== undefined) { editInput.authorExtensions = body.authorExtensions; updatedFields.push("authorExtensions"); }
  if (body?.similarityCheck !== undefined) { editInput.similarityCheck = body.similarityCheck; updatedFields.push("similarityCheck"); }
  if (body?.needsManualReview !== undefined) { editInput.needsManualReview = body.needsManualReview; updatedFields.push("needsManualReview"); }
  if (body?.manualReviewReason !== undefined) { editInput.manualReviewReason = body.manualReviewReason; updatedFields.push("manualReviewReason"); }
  if (body?.manualReviewReasons !== undefined) { editInput.manualReviewReasons = body.manualReviewReasons; updatedFields.push("manualReviewReasons"); }
  if (body?.stepTrace !== undefined) { editInput.stepTrace = body.stepTrace; updatedFields.push("stepTrace"); }
  if (body?.currentStep !== undefined) { editInput.currentStep = body.currentStep; updatedFields.push("currentStep"); }
  if (body?.stopStep !== undefined) { editInput.stopStep = body.stopStep; updatedFields.push("stopStep"); }
  if (body?.reasonCode !== undefined) { editInput.reasonCode = body.reasonCode; updatedFields.push("reasonCode"); }
  if (body?.reasonText !== undefined) { editInput.reasonText = body.reasonText; updatedFields.push("reasonText"); }

  if (Object.keys(editInput).length > 0) {
    // Hermes token 调用跳过状态转换校验（管线内部自动流转），前端操作需要校验
    const source = hasToken ? "hermes" : undefined;
    const editResult = editCreativeFinishedArticle(db, id, editInput as any, source);
    if (!editResult.ok) {
      return reply.code(400).send({ ok: false, reason: editResult.reason });
    }
  }

  // trendScore / trendBreakdown 存在 source_items 表，需关联更新
  if (body?.trendScore !== undefined || body?.trendBreakdown !== undefined) {
    if (article.sourceItemId === null) {
      return reply.code(400).send({ ok: false, reason: "manual-article-has-no-source-score" });
    }
    if (body?.trendScore !== undefined) updatedFields.push("trendScore");
    if (body?.trendBreakdown !== undefined) updatedFields.push("trendBreakdown");
    const trendScore = typeof body.trendScore === "number" ? body.trendScore : 0;
    const trendBreakdown = (body.trendBreakdown && typeof body.trendBreakdown === "object") ? body.trendBreakdown : {};
    updateCreativeSourceItemTrendScore(db, article.sourceItemId, trendScore, trendBreakdown as any);
  }

  if (updatedFields.length === 0) {
    return reply.code(400).send({ message: "No fields to update", statusCode: 400 });
  }

  const updated = findCreativeFinishedArticleById(db, id);
  return reply.send({
    id,
    updatedFields,
    updatedAt: updated?.updatedAt ?? new Date().toISOString()
  });
});

// 切换成品文章的公众号发布状态
app.post("/api/creative/finished-articles/:id/toggle-published", async (request, reply) => {
  const hasToken = options.hasCreativeApiToken(request);
  if (!hasToken) {
    const session = options.readSession(request, reply);
    if (session === undefined) { return; }
  }

  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const params = request.params as { id: string };
  const id = parseInt(params.id, 10);
  const updated = toggleWechatPublished(db, id);
  if (!updated) {
    return reply.code(404).send({ message: "Finished article not found", statusCode: 404 });
  }
  return reply.send({ ok: true, wechatPublished: updated.wechatPublished });
});

// 公众号发布后效果反馈：只接收前 10 篇试验需要的最小人工指标
app.put("/actions/creative/finished-articles/:id/performance-feedback", async (request, reply) => {
  if (!options.authorizeStateAction(request, reply)) {
    return;
  }
  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const id = parseInt((request.params as { id: string }).id, 10);
  const body = request.body as Record<string, unknown> | undefined;
  const requiredFields = ["deliveredUsers", "readUsers", "shareUsers"] as const;
  const hasInvalidRequiredMetric = requiredFields.some((field) => (
    typeof body?.[field] !== "number"
    || !Number.isInteger(body[field])
    || (body[field] as number) < 0
  ));
  const newFollowers = body?.newFollowers;
  const hasInvalidOptionalMetric = newFollowers !== undefined
    && newFollowers !== null
    && (typeof newFollowers !== "number" || !Number.isInteger(newFollowers) || newFollowers < 0);
  const rewriteLevel = body?.rewriteLevel;

  if (hasInvalidRequiredMetric || hasInvalidOptionalMetric) {
    return reply.code(400).send({ ok: false, reason: "metrics-must-be-non-negative-integers" });
  }
  if (rewriteLevel !== "light" && rewriteLevel !== "medium" && rewriteLevel !== "heavy") {
    return reply.code(400).send({ ok: false, reason: "invalid-rewrite-level" });
  }

  const updated = saveArticlePerformanceFeedback(db, id, {
    deliveredUsers: body!.deliveredUsers as number,
    readUsers: body!.readUsers as number,
    shareUsers: body!.shareUsers as number,
    newFollowers: newFollowers as number | null | undefined,
    rewriteLevel
  });
  if (!updated) {
    return reply.code(404).send({ ok: false, reason: "not-found" });
  }

  return reply.send({
    ok: true,
    performanceRecordedAt: updated.performanceRecordedAt,
    performanceTitleSnapshot: updated.performanceTitleSnapshot,
    performanceTitleGroupSnapshot: updated.performanceTitleGroupSnapshot,
    performanceReaderTaskSnapshot: updated.performanceReaderTaskSnapshot
  });
});

app.post("/api/creative/finished-articles/:id/toggle-publishable", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) { return; }

  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const id = parseInt((request.params as { id: string }).id, 10);
  const updated = togglePublishable(db, id);
  if (!updated) {
    return reply.code(404).send({ message: "Finished article not found", statusCode: 404 });
  }
  return reply.send({ ok: true, publishable: updated.publishable });
});

// 软删除成品文章
app.delete("/api/creative/finished-articles/:id", async (request, reply) => {
  // 支持两种认证：token（外部 Agent）或 session（管理 UI）
  const hasToken = options.hasCreativeApiToken(request);
  if (!hasToken) {
    const session = options.readSession(request, reply);
    if (session === undefined) { return; }
  }

  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const params = request.params as { id: string };
  const id = parseInt(params.id, 10);
  const deleted = softDeleteFinishedArticle(db, id);
  if (!deleted) {
    return reply.code(404).send({ ok: false, reason: "not-found-or-already-deleted" });
  }
  return reply.send({ ok: true });
});

// 恢复已废弃的成品文章
app.post("/actions/creative/finished-articles/:id/restore", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) { return; }

  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const params = request.params as { id: string };
  const id = parseInt(params.id, 10);
  const restored = restoreFinishedArticle(db, id);
  if (!restored) {
    return reply.code(404).send({ ok: false, reason: "not-found-or-not-deleted" });
  }
  return reply.send({ ok: true });
});

// 查询文章缺失图片状态（代理 Hermes API）
app.get("/api/creative/finished-articles/:id/missing-images", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) { return; }

  const hermesApiUrl = process.env.HERMES_API_BASE_URL;
  const hermesApiToken = process.env.HERMES_API_TOKEN;
  if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

  const id = parseInt((request.params as { id: string }).id, 10);
  try {
    const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/articles/missing-images?articleId=${id}`, {
      headers: { "Authorization": `Bearer ${hermesApiToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, detail: body });
    }
    const data = await res.json();
    return reply.send(data);
  } catch (err) {
    return reply.code(502).send({ ok: false, reason: "Hermes 调用失败", detail: (err as Error).message });
  }
});

// 重新生成封面图：后端代理 Hermes API
app.post("/api/creative/finished-articles/:id/regen-cover", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) { return; }

  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const params = request.params as { id: string };
  const id = parseInt(params.id, 10);
  const article = findCreativeFinishedArticleById(db, id);
  if (!article) {
    return reply.code(404).send({ ok: false, reason: "article-not-found" });
  }

  const hermesApiUrl = process.env.HERMES_API_BASE_URL;
  const hermesApiToken = process.env.HERMES_API_TOKEN;
  if (!hermesApiUrl || !hermesApiToken) {
    return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);

    const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/regen-cover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${hermesApiToken}`,
      },
      body: JSON.stringify({ articleId: id }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
      return reply.code(res.status >= 500 ? 502 : res.status).send({
        ok: false,
        reason: `Hermes HTTP ${res.status}`,
        hermesResponse: errorBody,
      });
    }

    const data = await res.json() as { success: boolean; coverUrl?: string; prompt?: string; sourceUrl?: string; provider?: string; model?: string; error?: string };
    if (!data.success || !data.coverUrl) {
      return reply.code(502).send({ ok: false, reason: data.error ?? "封面图生成失败", hermesResponse: JSON.stringify(data) });
    }

    // 将新封面图 prepend 到数组开头
    const updatedCovers = [data.coverUrl, ...article.coverImage];
    editCreativeFinishedArticle(db, id, { coverImage: updatedCovers });

    const updated = findCreativeFinishedArticleById(db, id);
    return reply.send({
      ok: true,
      coverImage: updated?.coverImage ?? updatedCovers,
      prompt: data.prompt,
      sourceUrl: data.sourceUrl ?? "",
      provider: data.provider ?? "",
      model: data.model ?? "",
    });
  } catch (err) {
    const errMessage = (err as Error).message ?? String(err);
    if ((err as Error).name === "AbortError") {
      return reply.code(504).send({ ok: false, reason: "封面图生成超时（>180s），Hermes 未响应", detail: errMessage });
    }
    return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
  }
});

// 按需生成读者评论+作者回复：代理 Hermes POST /api/generate-comments，hot-now 侧存储
app.post("/api/creative/finished-articles/:id/generate-comments", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) { return; }

  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const params = request.params as { id: string };
  const id = parseInt(params.id, 10);
  const article = findCreativeFinishedArticleById(db, id);
  if (!article) {
    return reply.code(404).send({ ok: false, reason: "article-not-found" });
  }

  const hermesApiUrl = process.env.HERMES_API_BASE_URL;
  const hermesApiToken = process.env.HERMES_API_TOKEN;
  if (!hermesApiUrl || !hermesApiToken) {
    return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
  }

  // 提取标题/正文/形态给 Hermes 生成评论（form 短内容线独有，公众号文章为空）
  const titleList = article.titles ?? [];
  const title = titleList[article.titleIndex] ?? titleList[0] ?? "";
  const contentBody = article.contentMarkdown ?? "";
  const form = article.form ?? undefined;
  if (!title || !contentBody) {
    return reply.code(400).send({ ok: false, reason: "article-missing-title-or-body" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);

    const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/generate-comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${hermesApiToken}`,
      },
      body: JSON.stringify({ title, body: contentBody, form }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
      return reply.code(res.status >= 500 ? 502 : res.status).send({
        ok: false,
        reason: `Hermes HTTP ${res.status}`,
        hermesResponse: errorBody,
      });
    }

    const data = await res.json() as { success: boolean; comments?: { reader: string; author_reply: string }[]; error?: string };
    if (!data.success || !data.comments || data.comments.length === 0) {
      return reply.code(502).send({ ok: false, reason: data.error ?? "评论生成失败", hermesResponse: JSON.stringify(data) });
    }

    // hot-now 侧存储（单一写入点，Hermes 不碰平台 DB）
    editCreativeFinishedArticle(db, id, { comments: data.comments });

    return reply.send({ ok: true, comments: data.comments });
  } catch (err) {
    const errMessage = (err as Error).message ?? String(err);
    if ((err as Error).name === "AbortError") {
      return reply.code(504).send({ ok: false, reason: "评论生成超时（>180s），Hermes 未响应", detail: errMessage });
    }
    return reply.code(502).send({ ok: false, reason: "Hermes 调用失败", detail: errMessage });
  }
});

// 按需生成作者拓展评论：代理 Hermes POST /api/generate-author-extensions，hot-now 侧存储
app.post("/api/creative/finished-articles/:id/generate-author-extensions", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) { return; }

  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const params = request.params as { id: string };
  const id = parseInt(params.id, 10);
  const article = findCreativeFinishedArticleById(db, id);
  if (!article) {
    return reply.code(404).send({ ok: false, reason: "article-not-found" });
  }

  const hermesApiUrl = process.env.HERMES_API_BASE_URL;
  const hermesApiToken = process.env.HERMES_API_TOKEN;
  if (!hermesApiUrl || !hermesApiToken) {
    return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
  }

  // 提取标题/正文/形态给 Hermes 生成作者拓展（form 短内容线独有，公众号文章为空）
  const titleList = article.titles ?? [];
  const title = titleList[article.titleIndex] ?? titleList[0] ?? "";
  const contentBody = article.contentMarkdown ?? "";
  const form = article.form ?? undefined;
  if (!title || !contentBody) {
    return reply.code(400).send({ ok: false, reason: "article-missing-title-or-body" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);

    const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/generate-author-extensions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${hermesApiToken}`,
      },
      body: JSON.stringify({ title, body: contentBody, form }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
      return reply.code(res.status >= 500 ? 502 : res.status).send({
        ok: false,
        reason: `Hermes HTTP ${res.status}`,
        hermesResponse: errorBody,
      });
    }

    const data = await res.json() as { success: boolean; extensions?: string[]; error?: string };
    if (!data.success || !data.extensions || data.extensions.length === 0) {
      return reply.code(502).send({ ok: false, reason: data.error ?? "作者拓展生成失败", hermesResponse: JSON.stringify(data) });
    }

    // hot-now 侧存储（单一写入点，Hermes 不碰平台 DB）
    editCreativeFinishedArticle(db, id, { authorExtensions: data.extensions });

    return reply.send({ ok: true, extensions: data.extensions });
  } catch (err) {
    const errMessage = (err as Error).message ?? String(err);
    if ((err as Error).name === "AbortError") {
      return reply.code(504).send({ ok: false, reason: "作者拓展生成超时（>180s），Hermes 未响应", detail: errMessage });
    }
    return reply.code(502).send({ ok: false, reason: "Hermes 调用失败", detail: errMessage });
  }
});

// 重新生成图片提示词：代理 Hermes POST /api/articles/regen-image-prompts（2~3分钟，超时5分钟）
app.post("/api/creative/finished-articles/:id/regen-image-prompts", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) { return; }

  if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

  const id = parseInt((request.params as { id: string }).id, 10);
  const article = findCreativeFinishedArticleById(db, id);
  if (!article) { return reply.code(404).send({ ok: false, reason: "article-not-found" }); }

  const hermesApiUrl = process.env.HERMES_API_BASE_URL;
  const hermesApiToken = process.env.HERMES_API_TOKEN;
  if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

  try {
    const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/articles/regen-image-prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
      body: JSON.stringify({ articleId: id }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
      return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, detail: errorBody });
    }

    const data = await res.json() as { success: boolean; error?: string; [k: string]: unknown };
    if (!data.success) {
      return reply.code(502).send({ ok: false, reason: data.error ?? "图片提示词生成失败" });
    }

    // 提示词重新生成成功后，清理因提示词缺失导致的异常标记；
    // 卡在 queued 的文章（写作已完成但因缺提示词滞留）推进到 generated，否则 UI 一直显示"排队中"。
    // 用 source="hermes" 走管线恢复路径，跳过人工状态变更校验。
    if (article.anomalyReason && article.anomalyReason.startsWith("image_prompt_")) {
      editCreativeFinishedArticle(db, id, {
        anomalyReason: null,
        ...(article.status === "queued" ? { status: "generated" } : {})
      }, "hermes");
    }

    // Hermes 已 PATCH 回平台，重新读取最新数据返回
    const updated = findCreativeFinishedArticleById(db, id);
    return reply.send({
      ok: true,
      articleId: id,
      thesis: data.thesis,
      coverPromptLength: data.coverPromptLength,
      inlinePromptCount: data.inlinePromptCount,
      inlinePromptKeys: data.inlinePromptKeys,
      designPlanImages: data.designPlanImages,
      warnings: data.warnings,
    });
  } catch (err) {
    return reply.code(502).send({ ok: false, reason: "Hermes 调用失败", detail: (err as Error).message });
  }
});

// 单独生成封面提示词，不触碰正文、正文配图位置或已有图片。
app.post("/actions/creative/finished-articles/:id/generate-cover-prompt", async (request, reply) => {
  if (!options.authorizeStateAction(request, reply)) {
    return;
  }
  if (!db) return reply.code(503).send({ ok: false, reason: "database-not-available" });

  const id = parseInt((request.params as { id: string }).id, 10);
  const article = findCreativeFinishedArticleById(db, id);
  if (!article) return reply.code(404).send({ ok: false, reason: "article-not-found" });

  const generated = await requestImagePromptsFromHermes(article, {
    scope: "cover",
    content: article.humanMarkdown || article.contentMarkdown,
  });
  if (!generated.ok) {
    return reply.code(generated.status).send({ ok: false, reason: generated.reason });
  }
  if (!generated.coverPrompt) {
    return reply.code(502).send({ ok: false, reason: "封面提示词生成失败" });
  }

  editCreativeFinishedArticle(db, id, { coverImagePrompt: generated.coverPrompt });
  return reply.send({ ok: true, article: findCreativeFinishedArticleById(db, id) });
});

// 正文配图提示词成功后才把提示词和首次规划的占位符一次性落库。
app.post("/actions/creative/finished-articles/:id/generate-inline-prompts", async (request, reply) => {
  if (!options.authorizeStateAction(request, reply)) {
    return;
  }
  if (!db) return reply.code(503).send({ ok: false, reason: "database-not-available" });

  const id = parseInt((request.params as { id: string }).id, 10);
  const article = findCreativeFinishedArticleById(db, id);
  if (!article) return reply.code(404).send({ ok: false, reason: "article-not-found" });

  const body = request.body as { index?: unknown } | undefined;
  const inlineIndex = typeof body?.index === "number" && Number.isInteger(body.index) && body.index > 0
    ? body.index
    : undefined;
  const formalMarkdown = article.humanMarkdown || article.contentMarkdown;
  if (!formalMarkdown.trim()) {
    return reply.code(400).send({ ok: false, reason: "formal-content-required" });
  }

  const planned = planInlineImagePlaceholders(
    formalMarkdown,
    article.direction === "short_content" ? "short_content" : "article"
  );
  if (planned.count === 0) {
    return reply.code(400).send({ ok: false, reason: "no-suitable-inline-image-position" });
  }

  const generated = await requestImagePromptsFromHermes(article, {
    scope: "inline",
    content: buildInlinePromptSource(planned.markdown),
    inlineIndex,
  });
  if (!generated.ok) {
    return reply.code(generated.status).send({ ok: false, reason: generated.reason });
  }
  if (!generated.inlinePrompts || Object.keys(generated.inlinePrompts).length === 0) {
    return reply.code(502).send({ ok: false, reason: "正文配图提示词生成失败" });
  }
  const requiredIndexes = inlineIndex
    ? [inlineIndex]
    : Array.from({ length: planned.count }, (_, index) => index + 1);
  const missingPromptIndexes = requiredIndexes.filter((index) => {
    const prompt = generated.inlinePrompts?.[String(index)];
    return typeof prompt !== "string" || prompt.trim().length === 0;
  });
  if (missingPromptIndexes.length > 0) {
    return reply.code(502).send({
      ok: false,
      reason: `正文配图提示词缺少编号: ${missingPromptIndexes.join(",")}`,
    });
  }

  const inlineImagePrompts = inlineIndex
    ? { ...(article.inlineImagePrompts ?? {}), ...generated.inlinePrompts }
    : generated.inlinePrompts;
  editCreativeFinishedArticle(db, id, {
    inlineImagePrompts,
    ...(planned.changed ? { humanMarkdown: planned.markdown } : {}),
  });
  return reply.send({ ok: true, article: findCreativeFinishedArticleById(db, id) });
});

app.post("/api/creative/finished-articles/:id/regen-title", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) { return; }

  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const params = request.params as { id: string };
  const id = parseInt(params.id, 10);
  const article = findCreativeFinishedArticleById(db, id);
  if (!article) {
    return reply.code(404).send({ ok: false, reason: "article-not-found" });
  }

  const hermesApiUrl = process.env.HERMES_API_BASE_URL;
  const hermesApiToken = process.env.HERMES_API_TOKEN;
  if (!hermesApiUrl || !hermesApiToken) {
    return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/regen-title`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${hermesApiToken}`,
      },
      body: JSON.stringify({ articleId: id }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
      return reply.code(res.status >= 500 ? 502 : res.status).send({
        ok: false,
        reason: `Hermes HTTP ${res.status}`,
        hermesResponse: errorBody,
      });
    }

    const data = await res.json() as {
      success: boolean;
      titles?: string[];
      titleCandidates?: unknown[];
      prompt?: string;
      error?: string;
    };
    if (!data.success || !data.titles?.length) {
      return reply.code(502).send({ ok: false, reason: data.error ?? "标题生成失败", hermesResponse: JSON.stringify(data) });
    }

    // Hermes 已通过平台 PATCH 整组回写候选，这里重新读取，避免再次拼接。
    const updated = findCreativeFinishedArticleById(db, id);
    return reply.send({
      ok: true,
      titles: updated?.titles ?? data.titles,
      titleCandidates: updated?.titleCandidates ?? data.titleCandidates ?? [],
      prompt: data.prompt,
    });
  } catch (err) {
    const errMessage = (err as Error).message ?? String(err);
    if ((err as Error).name === "AbortError") {
      return reply.code(504).send({ ok: false, reason: "标题生成超时（>15s），Hermes 未响应", detail: errMessage });
    }
    return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
  }
});

// ─── regen-intro：重新生成导语 ───
app.post("/api/creative/finished-articles/:id/regen-intro", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) { return; }
  if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

  const id = parseInt((request.params as { id: string }).id, 10);
  const article = findCreativeFinishedArticleById(db, id);
  if (!article) { return reply.code(404).send({ ok: false, reason: "article-not-found" }); }

  const hermesApiUrl = process.env.HERMES_API_BASE_URL;
  const hermesApiToken = process.env.HERMES_API_TOKEN;
  if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/regen-intro`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
      body: JSON.stringify({ articleId: id }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
      return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, hermesResponse: errorBody });
    }

    const data = await res.json() as { success: boolean; intro?: string; prompt?: string; error?: string };
    if (!data.success || !data.intro) {
      return reply.code(502).send({ ok: false, reason: data.error ?? "导语生成失败", hermesResponse: JSON.stringify(data) });
    }

    const existingIntros = article.intros ?? [];
    const updatedIntros = [data.intro, ...existingIntros];
    editCreativeFinishedArticle(db, id, { intros: updatedIntros });

    const updated = findCreativeFinishedArticleById(db, id);
    return reply.send({ ok: true, intros: updated?.intros ?? updatedIntros, prompt: data.prompt });
  } catch (err) {
    const errMessage = (err as Error).message ?? String(err);
    if ((err as Error).name === "AbortError") { return reply.code(504).send({ ok: false, reason: "导语生成超时（>15s），Hermes 未响应", detail: errMessage }); }
    return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
  }
});

// ─── regen-summary：重新生成百字摘要 ───
app.post("/api/creative/finished-articles/:id/regen-summary", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) { return; }
  if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

  const id = parseInt((request.params as { id: string }).id, 10);
  const article = findCreativeFinishedArticleById(db, id);
  if (!article) { return reply.code(404).send({ ok: false, reason: "article-not-found" }); }

  const hermesApiUrl = process.env.HERMES_API_BASE_URL;
  const hermesApiToken = process.env.HERMES_API_TOKEN;
  if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/regen-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
      body: JSON.stringify({ articleId: id }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
      return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, hermesResponse: errorBody });
    }

    const data = await res.json() as { success: boolean; summary100?: string; prompt?: string; error?: string };
    if (!data.success || !data.summary100) {
      return reply.code(502).send({ ok: false, reason: data.error ?? "摘要生成失败", hermesResponse: JSON.stringify(data) });
    }

    const existing = article.summary100 ?? [];
    const updated = [data.summary100, ...existing];
    editCreativeFinishedArticle(db, id, { summary100: updated });

    return reply.send({ ok: true, summary100: updated, prompt: data.prompt });
  } catch (err) {
    const errMessage = (err as Error).message ?? String(err);
    if ((err as Error).name === "AbortError") { return reply.code(504).send({ ok: false, reason: "摘要生成超时（>15s），Hermes 未响应", detail: errMessage }); }
    return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
  }
});

// ─── regen-inline-image：重新生成单张正文配图 ───
app.post("/api/creative/finished-articles/:id/regen-inline-image", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) { return; }
  if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

  const id = parseInt((request.params as { id: string }).id, 10);
  const body = request.body as Record<string, unknown> | undefined;
  const imageIndex = typeof body?.imageIndex === "number" ? body.imageIndex : undefined;
  if (!imageIndex) { return reply.code(400).send({ ok: false, reason: "imageIndex is required" }); }

  const article = findCreativeFinishedArticleById(db, id);
  if (!article) { return reply.code(404).send({ ok: false, reason: "article-not-found" }); }

  const hermesApiUrl = process.env.HERMES_API_BASE_URL;
  const hermesApiToken = process.env.HERMES_API_TOKEN;
  if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/regen-inline-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
      body: JSON.stringify({ articleId: id, imageIndex }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
      return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, hermesResponse: errorBody });
    }

    const data = await res.json() as { success: boolean; imageUrl?: string; imageIndex?: number; prompt?: string; sourceUrl?: string; provider?: string; model?: string; error?: string };
    if (!data.success) {
      return reply.code(502).send({ ok: false, reason: data.error ?? "配图生成失败", hermesResponse: JSON.stringify(data) });
    }

    // Hermes 已回写 contentMarkdown 和 images，重新读取最新数据返回
    const updated = findCreativeFinishedArticleById(db, id);
    return reply.send({
      ok: true,
      imageUrl: data.imageUrl,
      imageIndex: data.imageIndex,
      contentMarkdown: updated?.contentMarkdown ?? article.contentMarkdown,
      images: updated?.images ?? article.images,
      prompt: data.prompt,
      sourceUrl: data.sourceUrl ?? "",
      provider: data.provider ?? "",
      model: data.model ?? "",
    });
  } catch (err) {
    const errMessage = (err as Error).message ?? String(err);
    if ((err as Error).name === "AbortError") { return reply.code(504).send({ ok: false, reason: "配图生成超时（>180s），Hermes 未响应", detail: errMessage }); }
    return reply.code(502).send({ ok: false, reason: `Hermes 调用失败`, detail: errMessage });
  }
});

// ─── 短内容配图：按第 promptIndex 条提示词出图，回写 images[promptIndex]（短内容图后置，不注入正文） ───
app.post("/api/creative/finished-articles/:id/render-short-image", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) { return; }
  if (!db) { return reply.code(503).send({ ok: false, reason: "database-not-available" }); }

  const id = parseInt((request.params as { id: string }).id, 10);
  const body = request.body as Record<string, unknown> | undefined;
  const promptIndex = typeof body?.promptIndex === "number" ? body.promptIndex : undefined;
  if (promptIndex === undefined || promptIndex < 0) {
    return reply.code(400).send({ ok: false, reason: "promptIndex is required" });
  }

  const article = findCreativeFinishedArticleById(db, id);
  if (!article) { return reply.code(404).send({ ok: false, reason: "article-not-found" }); }

  const hermesApiUrl = process.env.HERMES_API_BASE_URL;
  const hermesApiToken = process.env.HERMES_API_TOKEN;
  if (!hermesApiUrl || !hermesApiToken) { return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" }); }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/short/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
      body: JSON.stringify({ aid: id, index: promptIndex }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "") || `Hermes HTTP ${res.status}`;
      return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: `Hermes HTTP ${res.status}`, hermesResponse: errorBody });
    }

    const data = await res.json() as { success: boolean; imageUrl?: string; index?: number; provider?: string; model?: string; error?: string };
    if (!data.success || !data.imageUrl) {
      return reply.code(502).send({ ok: false, reason: data.error ?? "配图生成失败", hermesResponse: JSON.stringify(data) });
    }

    // 短内容 images 为 string[]；读-改-写整列覆盖 images_json[promptIndex]
    const currentImages: unknown[] = Array.isArray(article.images) ? [...article.images] : [];
    while (currentImages.length <= promptIndex) { currentImages.push(""); }
    currentImages[promptIndex] = data.imageUrl;
    editCreativeFinishedArticle(db, id, { images: currentImages });

    const updated = findCreativeFinishedArticleById(db, id);
    return reply.send({
      ok: true,
      imageUrl: data.imageUrl,
      promptIndex,
      images: updated?.images ?? currentImages,
      provider: data.provider ?? "",
      model: data.model ?? "",
    });
  } catch (err) {
    const errMessage = (err as Error).message ?? String(err);
    if ((err as Error).name === "AbortError") { return reply.code(504).send({ ok: false, reason: "配图生成超时（>180s），Hermes 未响应", detail: errMessage }); }
    return reply.code(502).send({ ok: false, reason: "Hermes 调用失败", detail: errMessage });
  }
});
app.put("/actions/creative/finished-articles/:id", async (request, reply) => {
  if (!options.authorizeStateAction(request, reply)) {
    return;
  }

  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const params = request.params as { id: string };
  const body = request.body as Record<string, unknown> | undefined;
  const id = parseInt(params.id, 10);
  const source = typeof body?._source === "string" ? body._source : undefined;
  const result = editCreativeFinishedArticle(db, id, {
    contentMarkdown: typeof body?.contentMarkdown === "string" ? body.contentMarkdown : undefined,
    humanMarkdown: typeof body?.humanMarkdown === "string" ? body.humanMarkdown : (body?.humanMarkdown === null ? null : undefined),
    thesis: typeof body?.thesis === "string" ? body.thesis : undefined,
    titles: Array.isArray(body?.titles) ? body.titles as string[] : undefined,
    hooks: Array.isArray(body?.hooks) ? body.hooks as string[] : undefined,
    quotes: Array.isArray(body?.quotes) ? body.quotes as string[] : undefined,
    summary100: Array.isArray(body?.summary100) ? body.summary100 as string[] : (typeof body?.summary100 === "string" ? [body.summary100] : undefined),
    images: Array.isArray(body?.images) ? body.images as any[] : undefined,
    coverImage: Array.isArray(body?.coverImage) ? body.coverImage as string[] : undefined,
    coverImagePrompt: typeof body?.coverImagePrompt === "string" ? body.coverImagePrompt : undefined,
    inlineImagePrompts: body?.inlineImagePrompts && typeof body.inlineImagePrompts === "object"
      ? body.inlineImagePrompts as Record<string, string>
      : undefined,
    imagePrompts: Array.isArray(body?.imagePrompts) ? body.imagePrompts.filter((item): item is string => typeof item === "string") : undefined,
    wechatThemeId: typeof body?.wechatThemeId === "string" ? body.wechatThemeId : (body?.wechatThemeId === null ? null : undefined),
    wechatHtml: typeof body?.wechatHtml === "string" ? body.wechatHtml : (body?.wechatHtml === null ? null : undefined),
    coverImageIndex: typeof body?.coverImageIndex === "number" ? body.coverImageIndex : undefined,
    titleIndex: typeof body?.titleIndex === "number" ? body.titleIndex : undefined,
    titleCandidates: Array.isArray(body?.titleCandidates) ? body.titleCandidates as any[] : undefined,
    titleSelectionConfirmed: typeof body?.titleSelectionConfirmed === "boolean" ? body.titleSelectionConfirmed : undefined,
    intros: Array.isArray(body?.intros) ? body.intros as string[] : undefined,
    introIndex: typeof body?.introIndex === "number" ? body.introIndex : undefined,
    status: typeof body?.status === "string" ? body.status : undefined,
    anomalyReason: typeof body?.anomalyReason === "string" ? body.anomalyReason : undefined,
  }, source);
  if (!result.ok && result.reason === "article not found") {
    return reply.code(404).send({ ok: false, reason: "not-found" });
  }
  if (!result.ok) {
    return reply.code(400).send({ ok: false, reason: result.reason });
  }
  return reply.send({ ok: true });
});

// 手动成品直接进入编辑器，不创建素材，也不经过写作管线。
app.post("/actions/creative/finished-articles/manual", async (request, reply) => {
  if (!options.authorizeStateAction(request, reply)) {
    return;
  }
  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const body = request.body as { title?: unknown; direction?: unknown; form?: unknown } | undefined;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const direction = body?.direction === "short_content" ? "short_content" : body?.direction === "article" ? "article" : "";
  const form = body?.form === "tuwen" || body?.form === "duanwen" ? body.form : undefined;
  if (!title) {
    return reply.code(400).send({ ok: false, reason: "title-required" });
  }
  if (!direction || (direction === "short_content" && !form)) {
    return reply.code(400).send({ ok: false, reason: "invalid-manual-article-type" });
  }

  const article = insertCreativeFinishedArticle(db, {
    sourceItemId: null,
    contentMarkdown: "",
    humanMarkdown: `# ${title}\n\n`,
    titles: [title],
    status: "manual_draft",
    originType: "manual",
    direction,
    form: direction === "short_content" ? form : undefined,
    titleSelectionConfirmed: true,
  });
  return reply.code(201).send(article);
});

// 置顶状态使用时间戳持久化，刷新或重新登录后仍保持同一排序。
app.post("/actions/creative/finished-articles/:id/toggle-pin", async (request, reply) => {
  if (!options.authorizeStateAction(request, reply)) {
    return;
  }
  if (!db) {
    return reply.code(503).send({ ok: false, reason: "database-not-available" });
  }

  const id = parseInt((request.params as { id: string }).id, 10);
  const article = togglePinnedFinishedArticle(db, id);
  if (!article) {
    return reply.code(404).send({ ok: false, reason: "not-found" });
  }
  return reply.send(article);
});

// ─── 微信公众号：推送到草稿箱（session 鉴权） ───

app.post("/api/creative/finished-articles/:id/push-draft", async (request, reply) => {
  if (!options.authorizeStateAction(request, reply)) {
    return;
  }
  if (!options.pushArticleToWechatDraft) {
    return reply.code(503).send({ ok: false, reason: "wechat-push-not-configured" });
  }

  const params = request.params as { id: string };
  const body = request.body as { themeId?: string; wechatHtml?: string } | undefined;
  const id = parseInt(params.id, 10);
  const themeId = body?.themeId ?? "bauhaus";
  const wechatHtml = body?.wechatHtml;

  // 接管响应，用 SSE 流式推送进度
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  // 禁用 TCP Nagle 算法，确保每次 write 立即发送
  res.socket?.setNoDelay(true);

  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const onProgress = async (step: string, status: "running" | "done" | "error", detail?: string) => {
    const event: Record<string, unknown> = { step, status };
    if (detail) event.detail = detail;
    sendEvent(event);
    // 每个状态变化后短暂停顿，让前端用户能看到步骤过渡
    if (status === "done" || status === "running") {
      await new Promise(r => setTimeout(r, 100));
    }
  };

  try {
    const result = await options.pushArticleToWechatDraft(id, themeId, wechatHtml, onProgress);
    if (result.ok) {
      sendEvent({ step: "complete", status: "done", mediaId: result.mediaId, pushCount: result.pushCount });
    } else {
      sendEvent({ step: "complete", status: "error", errorCode: result.errorCode, errorMessage: result.errorMessage });
    }
  } catch (err) {
    sendEvent({ step: "complete", status: "error", errorMessage: (err as Error).message });
  } finally {
    res.end();
  }
});

// 获取文章推送记录
app.get("/api/creative/finished-articles/:id/push-log", async (request, reply) => {
  const session = options.readSession(request, reply);
  if (session === undefined) return;

  if (!options.getArticleWechatPushLog) {
    return reply.code(503).send({ ok: false, reason: "wechat-push-not-configured" });
  }

  const params = request.params as { id: string };
  const id = parseInt(params.id, 10);
  const log = options.getArticleWechatPushLog(id);
  return reply.send({ ok: true, log });
});
}
