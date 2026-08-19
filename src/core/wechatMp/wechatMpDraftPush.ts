// 草稿推送编排
// 渲染 Markdown → 上传封面图 → 上传正文图片 → 替换图片 URL → 创建草稿 → 记录结果

import { JSDOM } from "jsdom";
import { findDefaultWechatMpAccount } from "./wechatMpAccountRepository.js";
import { getAccessToken } from "./wechatMpAccessToken.js";
import {
  uploadPermanentImage,
  uploadContentImage,
  createDraft,
  prepareWechatImage,
  WechatApiCallError,
} from "./wechatMpApiClient.js";
import { makeWechatCompatible, type WechatThemeId } from "../creative/wechatFormat/wechatCompat.js";
import {
  checkPublishConditions,
  editCreativeFinishedArticle,
  findCreativeFinishedArticleById,
} from "../creative/creativeFinishedArticleRepository.js";
import { type DraftPushResult } from "./types.js";
import type { SqliteDatabase } from "../db/openDatabase.js";

// 推送步骤标识，与前端进度展示一一对应
export type PushStepId = "validate" | "compat" | "token" | "cover" | "images" | "draft" | "status";

// 进度回调：step 标识当前步骤，status 标记状态，detail 用于细化信息（如 "2/5"）
// 支持 async，路由层可在回调中插入视觉延迟
export type PushProgressCallback = (step: PushStepId, status: "running" | "done" | "error", detail?: string) => void | Promise<void>;

interface PushParams {
  db: SqliteDatabase;
  articleId: number;
  themeId: WechatThemeId;
  wechatHtml?: string;
  masterKey: string;
  onProgress?: PushProgressCallback;
}

// 下载远程图片，返回 Buffer
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`下载图片失败 (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

// 从渲染后的 HTML 中收集需要上传到微信 CDN 的图片 URL
// 跳过：data: 内联图、已经落在微信 CDN（mmbiz.qpic.cn）的图，避免重复上传
// 去重：同一张图在 HTML 出现多次只上传一次，替换时全量替换
export function collectImageUrlsFromHtml(html: string): string[] {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const seen = new Set<string>();
  const urls: string[] = [];
  dom.window.document.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (!src) return;
    if (src.startsWith("data:")) return;
    if (src.includes("mmbiz.qpic.cn")) return;
    if (seen.has(src)) return;
    seen.add(src);
    urls.push(src);
  });
  return urls;
}

// 替换 HTML 中正文图片的 src 为微信 CDN URL
function replaceImageUrls(html: string, originalUrls: string[], cdnUrls: string[]): string {
  let result = html;
  for (let i = 0; i < originalUrls.length && i < cdnUrls.length; i++) {
    // 转义 URL 中的特殊字符用于正则
    const escaped = originalUrls[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), cdnUrls[i]);
  }
  return result;
}

// 获取推送记录
export function getArticlePushLog(db: SqliteDatabase, articleId: number) {
  return db.prepare(`
    SELECT
      l.id, l.article_id, l.account_id, l.theme_id,
      l.media_id, l.status, l.error_code, l.error_message, l.pushed_at,
      a.name as account_name
    FROM wechat_draft_push_log l
    LEFT JOIN wechat_mp_accounts a ON a.id = l.account_id
    WHERE l.article_id = ?
    ORDER BY l.pushed_at DESC
  `).all(articleId);
}

// 获取文章的推送次数
export function getArticlePushCount(db: SqliteDatabase, articleId: number): number {
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM wechat_draft_push_log WHERE article_id = ? AND status = 'success'"
  ).get(articleId) as { count: number } | undefined;
  return row?.count ?? 0;
}

/** 推送文章到微信公众号草稿箱 */
export async function pushArticleToWechatDraft(params: PushParams): Promise<DraftPushResult> {
  const { db, articleId, themeId, masterKey, onProgress } = params;

  // SSE 心跳：图片下载/上传等耗时操作期间每 5 秒发一次心跳，防止浏览器或代理判定空闲超时断开
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const startHeartbeat = () => {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      Promise.resolve(onProgress?.("images", "running", "uploading")).catch(() => {});
    }, 5000);
  };
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  try {
  // ─── 步骤 1：校验文章数据和公众号配置 ───
  await onProgress?.("validate", "running");
  const account = findDefaultWechatMpAccount(db);
  if (!account) {
    await onProgress?.("validate", "error");
    return { ok: false, errorCode: "no-default-account", errorMessage: "未配置默认公众号" };
  }

  const article = findCreativeFinishedArticleById(db, articleId);
  if (!article) {
    await onProgress?.("validate", "error");
    return { ok: false, errorCode: "article-not-found", errorMessage: "文章不存在" };
  }
  const allowedStatuses = article.originType === "manual"
    ? ["manual_draft", "wechat_draft"]
    : ["ready_for_publish", "wechat_draft"];
  if (!allowedStatuses.includes(article.status)) {
    await onProgress?.("validate", "error");
    return { ok: false, errorCode: "invalid-status", errorMessage: `当前状态「${article.status}」不允许推送` };
  }
  const publishConditions = checkPublishConditions(article);
  if (!publishConditions.qualified) {
    await onProgress?.("validate", "error");
    return { ok: false, errorCode: "missing-content", errorMessage: publishConditions.missing.join("、") };
  }
  if (!params.wechatHtml) {
    await onProgress?.("validate", "error");
    return { ok: false, errorCode: "no-html", errorMessage: "缺少渲染 HTML，无法推送" };
  }
  await onProgress?.("validate", "done");

  // ─── 步骤 2：微信兼容处理 ───
  await onProgress?.("compat", "running");
  let html: string;
  try {
    html = await makeWechatCompatible(params.wechatHtml, { skipImageBase64: true });
  } catch (err) {
    await onProgress?.("compat", "error");
    return { ok: false, errorCode: "render-failed", errorMessage: `渲染失败: ${(err as Error).message}` };
  }
  await onProgress?.("compat", "done");

  // 插入推送记录（pending 状态）
  const logResult = db.prepare(`
    INSERT INTO wechat_draft_push_log (article_id, account_id, theme_id, status)
    VALUES (?, ?, ?, 'pending')
  `).run(articleId, account.id, themeId);
  const logId = Number(logResult.lastInsertRowid);

  // 用 currentStep 追踪当前步骤，catch 中标记失败
  let currentStep: PushStepId = "token";

  try {
    // ─── 步骤 3：获取 access_token ───
    currentStep = "token";
    await onProgress?.("token", "running");
    const token = await getAccessToken(account, masterKey);
    await onProgress?.("token", "done");

    // ─── 步骤 4：上传封面图 ───
    currentStep = "cover";
    await onProgress?.("cover", "running");
    startHeartbeat();
    let thumbMediaId = "";
    // 从 coverImage 数组中取用户选中的封面（coverImageIndex），回退到第 0 张
    const selectedCoverIdx = Math.min(article.coverImageIndex ?? 0, article.coverImage.length - 1);
    const coverUrl = article.coverImage.length > 0 ? article.coverImage[selectedCoverIdx >= 0 ? selectedCoverIdx : 0] : null;
    if (coverUrl) {
      const coverBuffer = await downloadImage(coverUrl);
      const coverImage = await prepareWechatImage(coverBuffer, "cover", "cover");
      const coverResult = await uploadPermanentImage(token, coverImage, account.id);
      thumbMediaId = coverResult.mediaId;
      if (coverResult.url) {
        html = replaceImageUrls(html, [coverUrl], [coverResult.url]);
      }
    }
    stopHeartbeat();
    await onProgress?.("cover", "done");

    // ─── 步骤 5：逐张上传正文图片 ───
    // 以渲染后 HTML 中的 <img> 为准（覆盖配图占位符 + Markdown 手写图两类来源），
    // 跳过 data: 与已是微信 CDN 的 src，避免重复上传。每张图只调一次 uploadContentImage。
    currentStep = "images";
    const imageUrls = collectImageUrlsFromHtml(html);
    if (imageUrls.length > 0) {
      await onProgress?.("images", "running", `0/${imageUrls.length}`);
      startHeartbeat();
      const cdnUrls: string[] = [];

      for (let i = 0; i < imageUrls.length; i++) {
        await onProgress?.("images", "running", `${i + 1}/${imageUrls.length}`);
        const imgBuffer = await downloadImage(imageUrls[i]);
        const image = await prepareWechatImage(imgBuffer, `image_${i}`, "content");
        const cdnUrl = await uploadContentImage(token, image);
        cdnUrls.push(cdnUrl);
      }

      html = replaceImageUrls(html, imageUrls, cdnUrls);
    }
    stopHeartbeat();
    await onProgress?.("images", "done");

    // ─── 步骤 6：创建草稿 ───
    currentStep = "draft";
    await onProgress?.("draft", "running");
    const titleIdx = Math.min(article.titleIndex ?? 0, (article.titles?.length ?? 1) - 1);
    const title = article.titles?.[titleIdx >= 0 ? titleIdx : 0] ?? "未命名文章";
    const mediaId = await createDraft(
      token,
      { title, thumbMediaId, content: html },
      account.id
    );
    await onProgress?.("draft", "done");

    // ─── 步骤 7：更新文章状态 ───
    currentStep = "status";
    await onProgress?.("status", "running");
    db.prepare(`
      UPDATE wechat_draft_push_log
      SET status = 'success', media_id = ?, pushed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(mediaId, logId);
    editCreativeFinishedArticle(db, articleId, { status: "wechat_draft" }, "push");
    const pushCount = getArticlePushCount(db, articleId);
    await onProgress?.("status", "done");

    return { ok: true, mediaId, pushCount };
  } catch (err) {
    // 标记当前步骤为失败
    await onProgress?.(currentStep, "error");

    const wechatErr = err instanceof WechatApiCallError
      ? { errorCode: String(err.errcode), errorMessage: `${err.hint}\n\n错误码: ${err.errcode}\n微信原始信息: ${err.errmsg}` }
      : { errorCode: "unknown", errorMessage: (err as Error).message };

    db.prepare(`
      UPDATE wechat_draft_push_log
      SET status = 'failed', error_code = ?, error_message = ?, pushed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(wechatErr.errorCode, wechatErr.errorMessage, logId);

    return { ok: false, ...wechatErr };
  }
  } finally {
    stopHeartbeat();
  }
}
