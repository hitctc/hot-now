import {
  editCreativeFinishedArticle,
  findCreativeFinishedArticleById,
} from "../../core/creative/creativeFinishedArticleRepository.js";
import type { CreativeFinishedArticleRouteContext } from "./creativeFinishedArticleRouteShared.js";
import { articleUsesGptLuna, readLunaPrompt } from "./creativeFinishedArticleRouteShared.js";

/** 注册成品文章的Image路由，保持既有 HTTP 契约。 */
export function registerCreativeFinishedArticleImageRoutes(context: CreativeFinishedArticleRouteContext): void {
  const { app, options, db } = context;

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

  // ─── GPT Luna 独立生图：每次只提交一个提示词 ───
  app.post("/api/creative/finished-articles/:id/luna-image", async (request, reply) => {
    const session = options.readSession(request, reply);
    if (session === undefined) return;
    if (!db) return reply.code(503).send({ ok: false, reason: "database-not-available" });

    const id = parseInt((request.params as { id: string }).id, 10);
    const article = findCreativeFinishedArticleById(db, id);
    if (!article) return reply.code(404).send({ ok: false, reason: "article-not-found" });
    if (!articleUsesGptLuna(article)) {
      return reply.code(409).send({ ok: false, eligible: false, reason: "article-writing-model-is-not-gpt-5.6-luna" });
    }

    const body = request.body as { target?: unknown; imageIndex?: unknown } | undefined;
    const target = body?.target === "cover" || body?.target === "inline" ? body.target : undefined;
    const imageIndex = typeof body?.imageIndex === "number" && Number.isInteger(body.imageIndex)
      ? body.imageIndex
      : undefined;
    if (!target) return reply.code(400).send({ ok: false, reason: "target must be cover or inline" });
    if (target === "inline" && (imageIndex == null || imageIndex < 1)) {
      return reply.code(400).send({ ok: false, reason: "imageIndex must start at 1" });
    }
    if (!readLunaPrompt(article, target, imageIndex)) {
      return reply.code(400).send({ ok: false, reason: "target-image-prompt-is-empty" });
    }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) {
      return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
    }

    try {
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/luna-image-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${hermesApiToken}` },
        body: JSON.stringify({ articleId: id, target, imageIndex, mode: "manual" }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; job?: unknown; error?: string };
      if (!res.ok || !data.success) {
        return reply.code(res.status >= 500 ? 502 : res.status).send({
          ok: false,
          reason: data.error ?? `Hermes HTTP ${res.status}`,
        });
      }
      return reply.code(202).send({ ok: true, eligible: true, job: data.job });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return reply.code(504).send({ ok: false, reason: "Luna 生图任务提交超时" });
      }
      return reply.code(502).send({ ok: false, reason: `Hermes 调用失败: ${(error as Error).message}` });
    }
  });

  // 查询 Luna 独立生图状态；状态由 Hermes 本机任务存储维护。
  app.get("/api/creative/finished-articles/:id/luna-image-jobs", async (request, reply) => {
    const session = options.readSession(request, reply);
    if (session === undefined) return;
    if (!db) return reply.code(503).send({ ok: false, reason: "database-not-available" });

    const id = parseInt((request.params as { id: string }).id, 10);
    const article = findCreativeFinishedArticleById(db, id);
    if (!article) return reply.code(404).send({ ok: false, reason: "article-not-found" });
    if (!articleUsesGptLuna(article)) {
      return reply.send({ ok: true, eligible: false, jobs: [] });
    }

    const hermesApiUrl = process.env.HERMES_API_BASE_URL;
    const hermesApiToken = process.env.HERMES_API_TOKEN;
    if (!hermesApiUrl || !hermesApiToken) {
      return reply.code(503).send({ ok: false, reason: "hermes-api-not-configured" });
    }
    try {
      const res = await fetch(`${hermesApiUrl.replace(/\/+$/, "")}/api/luna-image-jobs?articleId=${id}`, {
        headers: { "Authorization": `Bearer ${hermesApiToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; jobs?: unknown[]; error?: string };
      if (!res.ok || !data.success) {
        return reply.code(res.status >= 500 ? 502 : res.status).send({ ok: false, reason: data.error ?? `Hermes HTTP ${res.status}` });
      }
      return reply.send({ ok: true, eligible: true, jobs: data.jobs ?? [] });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return reply.code(504).send({ ok: false, reason: "Luna 生图状态查询超时" });
      }
      return reply.code(502).send({ ok: false, reason: `Hermes 调用失败: ${(error as Error).message}` });
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
}
