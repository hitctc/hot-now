import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SqliteDatabase } from "../../core/db/openDatabase.js";
import {
  type CreativeFinishedArticleRecord,
} from "../../core/creative/creativeFinishedArticleRepository.js";

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

export type CreativeFinishedArticleRouteContext = {
  app: FastifyInstance;
  options: CreativeFinishedArticleRouteOptions;
  db: SqliteDatabase | undefined;
};

export type HermesImagePromptResult =
  | { ok: true; status: 200; coverPrompt: string | null; inlinePrompts: Record<string, string> | null }
  | { ok: false; status: number; reason: string };

/**
 * 调用 Hermes 只生成指定范围的提示词；结果不由 Hermes 回写，调用路由负责原子保存。
 */
export async function requestImagePromptsFromHermes(
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

/** 只认可文章最终写作 trace 中明确记录的 GPT Luna，不用当前环境变量推断。 */
export function articleUsesGptLuna(article: CreativeFinishedArticleRecord): boolean {
  const trace = article.stepTrace;
  if (!Array.isArray(trace)) return false;
  return trace.some((entry) => {
    const meta = entry.meta;
    if (meta?.writingProvider === "codex" && meta.writingModel === "gpt-5.6-luna") {
      return true;
    }
    // 短内容 trace 将实际模型写在“短内容写作”步骤顶层，兼容其既有留痕格式。
    const shortTrace = entry as typeof entry & { provider?: string; model?: string };
    return entry.stepName === "短内容写作"
      && shortTrace.provider === "codex"
      && shortTrace.model === "gpt-5.6-luna";
  });
}

/** 从服务端文章字段读取目标提示词，前端只传目标位置，不传提示词内容。 */
export function readLunaPrompt(
  article: CreativeFinishedArticleRecord,
  target: "cover" | "inline",
  imageIndex?: number,
): string {
  if (target === "cover") {
    return typeof article.coverImagePrompt === "string" ? article.coverImagePrompt.trim() : "";
  }
  if (article.direction === "short_content") {
    if (imageIndex == null || imageIndex < 1 || !article.imagePrompts) return "";
    return typeof article.imagePrompts[imageIndex - 1] === "string"
      ? article.imagePrompts[imageIndex - 1].trim()
      : "";
  }
  if (imageIndex == null || !article.inlineImagePrompts) return "";
  const prompt = article.inlineImagePrompts[String(imageIndex)];
  return typeof prompt === "string" ? prompt.trim() : "";
}
