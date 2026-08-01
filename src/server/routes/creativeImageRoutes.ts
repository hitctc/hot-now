import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  downloadAndStoreImage,
  readStoredImage,
  readStoredImageThumbnail,
  storeImageBuffer
} from "../../core/storage/imageStore.js";

export type CreativeImageRouteOptions = {
  creativeImageDir?: string;
  publicBaseUrl: string;
  authorizeCreativeApiToken: (request: FastifyRequest, reply: FastifyReply) => boolean;
  authorizeSessionAction: (request: FastifyRequest, reply: FastifyReply) => boolean;
};

/** 注册图片转存、上传和公开读取路由，保持 Agent 与前端的原有接口契约。 */
export function registerCreativeImageRoutes(
  app: FastifyInstance,
  options: CreativeImageRouteOptions
): void {
  const { creativeImageDir, publicBaseUrl } = options;

  // ─── Creative: 图片转存接口（token 鉴权） ───

  app.post("/api/creative/images/upload-by-url", async (request, reply) => {
    if (!options.authorizeCreativeApiToken(request, reply)) {
      return;
    }

    if (!creativeImageDir) {
      return reply.code(503).send({ ok: false, reason: "image-dir-not-configured" });
    }

    const body = request.body as { images?: unknown[] } | undefined;
    const images = Array.isArray(body?.images) ? body.images : [];

    if (images.length === 0) {
      return reply.code(400).send({ ok: false, reason: "missing-images" });
    }

    if (images.length > 9) {
      return reply.code(400).send({ ok: false, reason: "too-many-images" });
    }

    const results: Array<{
      originalUrl: string;
      storedUrl: string;
      purpose: string;
      alt: string;
      sourceUrl: string;
      model: string;
    }> = [];
    const failed: Array<{ url: string; reason: string }> = [];

    for (const img of images) {
      // 兼容 string 和 object 两种格式
      const url = typeof img === "string" ? img : (img as Record<string, unknown>)?.url;
      const purpose = typeof img === "object" && img !== null
        ? String((img as Record<string, unknown>).purpose ?? "cover")
        : "cover";
      const alt = typeof img === "object" && img !== null
        ? String((img as Record<string, unknown>).alt ?? "")
        : "";
      // 透传 Hermes 传入的原始临时地址和生图模型，方便排查
      const sourceUrl = typeof img === "object" && img !== null
        ? String((img as Record<string, unknown>).sourceUrl ?? url ?? "")
        : String(url ?? "");
      const model = typeof img === "object" && img !== null
        ? String((img as Record<string, unknown>).model ?? "")
        : "";

      if (typeof url !== "string" || !url.trim()) {
        failed.push({ url: String(url), reason: "invalid-url" });
        continue;
      }

      try {
        const stored = await downloadAndStoreImage(creativeImageDir, url.trim());
        results.push({
          originalUrl: url.trim(),
          storedUrl: publicBaseUrl ? `${publicBaseUrl}${stored.urlPath}` : stored.urlPath,
          purpose,
          alt,
          sourceUrl: sourceUrl.trim(),
          model: model.trim()
        });
      } catch (err) {
        request.log.warn({ err, url }, "Image download/store failed");
        failed.push({ url: url.trim(), reason: "download_failed" });
      }
    }

    if (results.length === 0) {
      return reply.code(500).send({ error: "all_uploads_failed", details: failed });
    }

    const response: Record<string, unknown> = { images: results };
    if (failed.length > 0) {
      response.failed = failed;
    }
    return reply.send(response);
  });

  // ─── Creative: 图片文件上传（Hermes 下载后直传，避免 hot-now 出境下载） ───
  app.post("/api/creative/images/upload-image", { bodyLimit: 15 * 1024 * 1024 }, async (request, reply) => {
    if (!options.authorizeCreativeApiToken(request, reply)) {
      return;
    }

    if (!creativeImageDir) {
      return reply.code(503).send({ ok: false, reason: "image-dir-not-configured" });
    }

    const body = request.body as {
      images?: Array<{
        data: string;       // base64 编码的图片数据
        filename?: string;  // 原始文件名，用于推断扩展名
        contentType?: string;
        purpose?: string;
        alt?: string;
        sourceUrl?: string;
        provider?: string;
        model?: string;
      }>;
    } | undefined;

    const images = Array.isArray(body?.images) ? body.images : [];
    if (images.length === 0) {
      return reply.code(400).send({ ok: false, reason: "missing-images" });
    }
    if (images.length > 9) {
      return reply.code(400).send({ ok: false, reason: "too-many-images" });
    }

    const results: Array<{
      storedUrl: string;
      purpose: string;
      alt: string;
      sourceUrl: string;
      provider: string;
      model: string;
    }> = [];
    const failed: Array<{ index: number; reason: string }> = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img.data) {
        failed.push({ index: i, reason: "missing-data" });
        continue;
      }

      try {
        const buffer = Buffer.from(img.data, "base64");
        const ext = resolveExtFromFilename(img.filename) ?? resolveExtFromContentType(img.contentType);
        const stored = await storeImageBuffer(creativeImageDir, buffer, ext);
        results.push({
          storedUrl: publicBaseUrl ? `${publicBaseUrl}${stored.urlPath}` : stored.urlPath,
          purpose: img.purpose ?? "cover",
          alt: img.alt ?? "",
          sourceUrl: img.sourceUrl ?? "",
          provider: img.provider ?? "",
          model: img.model ?? ""
        });
      } catch (err) {
        request.log.warn({ err, index: i }, "Image upload/store failed");
        failed.push({ index: i, reason: (err as Error).message ?? "store_failed" });
      }
    }

    if (results.length === 0) {
      return reply.code(500).send({ error: "all_uploads_failed", details: failed });
    }

    const response: Record<string, unknown> = { images: results };
    if (failed.length > 0) {
      response.failed = failed;
    }
    return reply.send(response);
  });

  // ─── Creative: 前端手动上传图片（session 鉴权） ───

  app.post("/actions/creative/images/upload", { bodyLimit: 15 * 1024 * 1024 }, async (request, reply) => {
    if (!options.authorizeSessionAction(request, reply)) {
      return;
    }

    if (!creativeImageDir) {
      return reply.code(503).send({ ok: false, reason: "image-dir-not-configured" });
    }

    const body = request.body as {
      images?: Array<{
        data: string;       // base64 编码的图片数据
        filename?: string;
        contentType?: string;
        purpose?: string;   // "cover" | "inline"
        alt?: string;
      }>;
    } | undefined;

    const images = Array.isArray(body?.images) ? body.images : [];
    if (images.length === 0) {
      return reply.code(400).send({ ok: false, reason: "missing-images" });
    }
    if (images.length > 9) {
      return reply.code(400).send({ ok: false, reason: "too-many-images" });
    }

    const results: Array<{ storedUrl: string; purpose: string; alt: string }> = [];
    const failed: Array<{ index: number; reason: string }> = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img.data) {
        failed.push({ index: i, reason: "missing-data" });
        continue;
      }

      try {
        const buffer = Buffer.from(img.data, "base64");
        const ext = resolveExtFromFilename(img.filename) ?? resolveExtFromContentType(img.contentType);
        const stored = await storeImageBuffer(creativeImageDir, buffer, ext);
        results.push({
          storedUrl: publicBaseUrl ? `${publicBaseUrl}${stored.urlPath}` : stored.urlPath,
          purpose: img.purpose ?? "cover",
          alt: img.alt ?? "",
        });
      } catch (err) {
        request.log.warn({ err, index: i }, "Image upload/store failed");
        failed.push({ index: i, reason: (err as Error).message ?? "store_failed" });
      }
    }

    if (results.length === 0) {
      return reply.code(500).send({ ok: false, reason: "all_uploads_failed", details: failed });
    }

    const response: Record<string, unknown> = { ok: true, images: results };
    if (failed.length > 0) {
      response.failed = failed;
    }
    return reply.send(response);
  });

  // ─── Creative: 图片文件服务（公开访问，无需鉴权） ───

  app.get("/api/creative/images/:date/:file", async (request, reply) => {
    if (!creativeImageDir) {
      return reply.code(404).type("text/plain").send("Not Found");
    }

    const params = request.params as { date: string; file: string };
    const query = request.query as { variant?: string };
    const dateDir = params.date;
    const fileName = params.file;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) {
      return reply.code(400).type("text/plain").send("Invalid date");
    }

    const isThumbnail = query.variant === "thumbnail";
    const result = isThumbnail
      ? await readStoredImageThumbnail(creativeImageDir, dateDir, fileName)
      : await readStoredImage(creativeImageDir, dateDir, fileName);
    if (!result) {
      return reply.code(404).type("text/plain").send("Not Found");
    }

    return reply
      .type(result.contentType)
      .header("x-hot-now-image-variant", isThumbnail ? "thumbnail" : "original")
      .header("cache-control", "public, max-age=31536000, immutable")
      .send(result.buffer);
  });
}

/** 从原始文件名中提取与旧上传接口一致的安全图片扩展名。 */
function resolveExtFromFilename(filename: string | undefined): string | null {
  if (!filename) return null;
  const ext = filename.includes(".") ? `.${filename.split(".").pop()!.toLowerCase()}` : null;
  if (ext && [".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return null;
}

/** 从上传的 MIME 类型中提取与旧上传接口一致的图片扩展名。 */
function resolveExtFromContentType(contentType: string | undefined): string | null {
  if (!contentType) return null;
  const normalized = contentType.toLowerCase().split(";", 1)[0];
  return ({
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp"
  } as Record<string, string>)[normalized] ?? null;
}
