// 草稿推送编排
// 渲染 Markdown → 上传封面图 → 上传正文图片 → 替换图片 URL → 创建草稿 → 记录结果

import { findDefaultWechatMpAccount } from "./wechatMpAccountRepository.js";
import { getAccessToken } from "./wechatMpAccessToken.js";
import { uploadPermanentImage, uploadContentImage, createDraft, WechatApiCallError } from "./wechatMpApiClient.js";
import { formatForWechat, type WechatThemeId } from "../creative/wechatFormat/index.js";
import { findCreativeFinishedArticleById } from "../creative/creativeFinishedArticleRepository.js";
import { WECHAT_ERROR_HINTS, type DraftPushResult } from "./types.js";
import type { SqliteDatabase } from "../db/openDatabase.js";

interface PushParams {
  db: SqliteDatabase;
  articleId: number;
  themeId: WechatThemeId;
  masterKey: string;
}

// 下载远程图片，返回 Buffer
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`下载图片失败 (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

// 从 images 数组中提取图片 URL（支持纯字符串和带元数据的对象）
function extractImageUrls(images: unknown[]): string[] {
  return images
    .map((img) => {
      if (typeof img === "string") return img;
      if (img && typeof img === "object" && "url" in img) return (img as { url: string }).url;
      return null;
    })
    .filter((url): url is string => typeof url === "string" && url.length > 0);
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
  const { db, articleId, themeId, masterKey } = params;

  // 1. 查找默认公众号
  const account = findDefaultWechatMpAccount(db);
  if (!account) {
    return { ok: false, errorCode: "no-default-account", errorMessage: "未配置默认公众号" };
  }

  // 2. 读取文章
  const article = findCreativeFinishedArticleById(db, articleId);
  if (!article) {
    return { ok: false, errorCode: "article-not-found", errorMessage: "文章不存在" };
  }
  if (!article.contentMarkdown) {
    return { ok: false, errorCode: "no-content", errorMessage: "文章无 Markdown 内容" };
  }

  // 3. 渲染 HTML
  let html: string;
  try {
    html = await formatForWechat(article.contentMarkdown, themeId);
  } catch (err) {
    return { ok: false, errorCode: "render-failed", errorMessage: `渲染失败: ${(err as Error).message}` };
  }

  // 插入推送记录（pending 状态）
  const logResult = db.prepare(`
    INSERT INTO wechat_draft_push_log (article_id, account_id, theme_id, status)
    VALUES (?, ?, ?, 'pending')
  `).run(articleId, account.id, themeId);
  const logId = Number(logResult.lastInsertRowid);

  try {
    // 4. 获取 access_token
    const token = await getAccessToken(account, masterKey);

    // 5. 上传封面图
    let thumbMediaId = "";
    if (article.coverImage) {
      const coverBuffer = await downloadImage(article.coverImage);
      const ext = article.coverImage.includes(".png") ? "png" : "jpg";
      const coverResult = await uploadPermanentImage(token, coverBuffer, `cover.${ext}`);
      thumbMediaId = coverResult.mediaId;
    }

    // 6. 上传正文图片并替换 URL
    if (article.images && Array.isArray(article.images) && article.images.length > 0) {
      const imageUrls = extractImageUrls(article.images);
      const cdnUrls: string[] = [];

      for (let i = 0; i < imageUrls.length; i++) {
        try {
          const imgBuffer = await downloadImage(imageUrls[i]);
          const ext = imageUrls[i].includes(".png") ? "png" : "jpg";
          const cdnUrl = await uploadContentImage(token, imgBuffer, `image_${i}.${ext}`);
          cdnUrls.push(cdnUrl);
        } catch (err) {
          // 单张图片上传失败不阻塞整体流程，保留原始 URL
          cdnUrls.push(imageUrls[i]);
        }
      }

      html = replaceImageUrls(html, imageUrls, cdnUrls);
    }

    // 7. 提取标题
    const title = article.titles?.[0] ?? "未命名文章";

    // 8. 创建草稿
    const mediaId = await createDraft(
      token,
      { title, thumbMediaId, content: html },
      account.id
    );

    // 9. 更新推送记录为成功
    db.prepare(`
      UPDATE wechat_draft_push_log
      SET status = 'success', media_id = ?, pushed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(mediaId, logId);

    return { ok: true, mediaId };
  } catch (err) {
    const wechatErr = err instanceof WechatApiCallError
      ? { errorCode: String(err.errcode), errorMessage: `${err.hint}\n\n错误码: ${err.errcode}\n微信原始信息: ${err.errmsg}` }
      : { errorCode: "unknown", errorMessage: (err as Error).message };

    // 更新推送记录为失败
    db.prepare(`
      UPDATE wechat_draft_push_log
      SET status = 'failed', error_code = ?, error_message = ?, pushed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(wechatErr.errorCode, wechatErr.errorMessage, logId);

    return { ok: false, ...wechatErr };
  }
}
