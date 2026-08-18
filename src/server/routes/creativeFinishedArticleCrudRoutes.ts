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
} from "../../core/creative/creativeFinishedArticleRepository.js";
import type { CreativeFinishedArticleRouteContext } from "./creativeFinishedArticleRouteShared.js";

/** 注册成品文章的Crud路由，保持既有 HTTP 契约。 */
export function registerCreativeFinishedArticleCrudRoutes(context: CreativeFinishedArticleRouteContext): void {
  const { app, options, db } = context;

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
      humanMarkdown: typeof body?.humanMarkdown === "string" ? body.humanMarkdown : (body?.humanMarkdown === null ? null : undefined),
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
      titleIndex: typeof body?.titleIndex === "number" ? body.titleIndex : undefined,
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
    if (typeof body?.humanMarkdown === "string" || body?.humanMarkdown === null) {
      editInput.humanMarkdown = body.humanMarkdown;
      updatedFields.push("humanMarkdown");
    }
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
}
