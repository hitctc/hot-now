import {
  editCreativeFinishedArticle,
  findCreativeFinishedArticleById,
} from "../../core/creative/creativeFinishedArticleRepository.js";
import {
  buildInlinePromptSource,
  planInlineImagePlaceholders,
} from "../../core/creative/inlineImagePromptPlanner.js";
import type { CreativeFinishedArticleRouteContext } from "./creativeFinishedArticleRouteShared.js";
import { requestImagePromptsFromHermes } from "./creativeFinishedArticleRouteShared.js";

/** 注册成品文章的Generation路由，保持既有 HTTP 契约。 */
export function registerCreativeFinishedArticleGenerationRoutes(context: CreativeFinishedArticleRouteContext): void {
  const { app, options, db } = context;

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

      // Hermes 已 PATCH 回平台，返回本次生成结果的摘要，避免重复传输整篇文章。
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
}
