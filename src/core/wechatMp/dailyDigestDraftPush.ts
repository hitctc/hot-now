// 日报推送编排
// 从 daily_digests 读取标题/封面图 → 渲染 HTML → 上传封面 → 创建草稿 → 更新状态

import { findDefaultWechatMpAccount } from "./wechatMpAccountRepository.js";
import { getAccessToken } from "./wechatMpAccessToken.js";
import { uploadPermanentImage, createDraft, WechatApiCallError } from "./wechatMpApiClient.js";
import { makeWechatCompatible, type WechatThemeId } from "../creative/wechatFormat/wechatCompat.js";
import { findDailyDigestById, updateDailyDigestStatus } from "../dailyDigest/dailyDigestRepository.js";
import type { SqliteDatabase } from "../db/openDatabase.js";

export type DigestPushStepId = "validate" | "compat" | "token" | "cover" | "draft" | "status";

export type DigestPushProgressCallback = (
  step: DigestPushStepId,
  status: "running" | "done" | "error",
  detail?: string
) => void | Promise<void>;

interface DigestPushParams {
  db: SqliteDatabase;
  digestId: number;
  themeId: WechatThemeId;
  wechatHtml: string;
  masterKey: string;
  onProgress?: DigestPushProgressCallback;
}

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`下载图片失败 (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function pushDailyDigestToWechatDraft(params: DigestPushParams): Promise<{
  ok: boolean;
  mediaId?: string;
  errorCode?: string;
  errorMessage?: string;
}> {
  const { db, digestId, themeId, masterKey, onProgress } = params;

  // 步骤 1：校验
  await onProgress?.("validate", "running");
  const account = findDefaultWechatMpAccount(db);
  if (!account) {
    await onProgress?.("validate", "error");
    return { ok: false, errorCode: "no-default-account", errorMessage: "未配置默认公众号" };
  }

  const digest = findDailyDigestById(db, digestId);
  if (!digest) {
    await onProgress?.("validate", "error");
    return { ok: false, errorCode: "digest-not-found", errorMessage: "日报不存在" };
  }
  if (!params.wechatHtml) {
    await onProgress?.("validate", "error");
    return { ok: false, errorCode: "no-html", errorMessage: "缺少渲染 HTML" };
  }
  await onProgress?.("validate", "done");

  // 步骤 2：微信兼容处理
  await onProgress?.("compat", "running");
  let html: string;
  try {
    html = await makeWechatCompatible(params.wechatHtml, { skipImageBase64: true });
  } catch (err) {
    await onProgress?.("compat", "error");
    return { ok: false, errorCode: "render-failed", errorMessage: `渲染失败: ${(err as Error).message}` };
  }
  await onProgress?.("compat", "done");

  // 插入推送记录
  const logResult = db.prepare(`
    INSERT INTO wechat_draft_push_log (article_id, account_id, theme_id, status)
    VALUES (?, ?, ?, 'pending')
  `).run(digestId, account.id, themeId);
  const logId = Number(logResult.lastInsertRowid);

  let currentStep: DigestPushStepId = "token";

  try {
    // 步骤 3：获取 token
    currentStep = "token";
    await onProgress?.("token", "running");
    const token = await getAccessToken(account, masterKey);
    await onProgress?.("token", "done");

    // 步骤 4：上传封面图
    currentStep = "cover";
    await onProgress?.("cover", "running");
    let thumbMediaId = "";
    if (digest.coverImage) {
      const coverBuffer = await downloadImage(digest.coverImage);
      const ext = digest.coverImage.includes(".png") ? "png" : "jpg";
      const coverResult = await uploadPermanentImage(token, coverBuffer, `digest_cover.${ext}`);
      thumbMediaId = coverResult.mediaId;
    }
    await onProgress?.("cover", "done");

    // 步骤 5：创建草稿
    currentStep = "draft";
    await onProgress?.("draft", "running");
    const mediaId = await createDraft(
      token,
      { title: digest.title, thumbMediaId, content: html },
      account.id
    );
    await onProgress?.("draft", "done");

    // 步骤 6：更新状态
    currentStep = "status";
    await onProgress?.("status", "running");
    db.prepare(`
      UPDATE wechat_draft_push_log
      SET status = 'success', media_id = ?, pushed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(mediaId, logId);
    updateDailyDigestStatus(db, digestId, "published");
    await onProgress?.("status", "done");

    return { ok: true, mediaId };
  } catch (err) {
    await onProgress?.(currentStep, "error");

    const wechatErr = err instanceof WechatApiCallError
      ? { errorCode: String(err.errcode), errorMessage: `${err.hint}\n\n错误码: ${err.errcode}\n微信原始信息: ${err.errmsg}` }
      : { errorCode: "unknown", errorMessage: (err as Error).message };

    db.prepare(`
      UPDATE wechat_draft_push_log
      SET status = 'failed', error_code = ?, error_message = ?, pushed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(wechatErr.errorCode, wechatErr.errorMessage, logId);

    updateDailyDigestStatus(db, digestId, "failed");

    return { ok: false, ...wechatErr };
  }
}
