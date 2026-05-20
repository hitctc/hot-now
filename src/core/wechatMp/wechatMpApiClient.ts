// 微信公众号 API 封装
// 封装图片上传和草稿创建等核心接口

import { clearTokenCache } from "./wechatMpAccessToken.js";
import { WECHAT_ERROR_HINTS, type WechatApiError } from "./types.js";

// 微信 API 调用失败时抛出的结构化错误
export class WechatApiCallError extends Error {
  constructor(
    public readonly errcode: number,
    public readonly errmsg: string,
    public readonly hint: string
  ) {
    super(`微信 API 调用失败 (${errcode}): ${errmsg}`);
    this.name = "WechatApiCallError";
  }
}

// 检查微信 API 响应是否报错，有错则抛出
function checkWechatResponse<T extends WechatApiError>(
  data: T,
  accountId?: number
): void {
  if (!data.errcode || data.errcode === 0) return;

  // access_token 过期时清除缓存，下次调用会重新获取
  if ([40001, 42001, 61004].includes(data.errcode) && accountId) {
    clearTokenCache(accountId);
  }

  const hintInfo = WECHAT_ERROR_HINTS[data.errcode] ?? {
    message: `微信返回错误 (${data.errcode})`,
    hint: "请稍后重试，如持续失败请联系开发者",
  };

  throw new WechatApiCallError(data.errcode, data.errmsg, hintInfo.hint);
}

/** 上传封面图为微信永久素材，返回 media_id */
export async function uploadPermanentImage(
  accessToken: string,
  imageBuffer: Buffer,
  filename: string
): Promise<{ mediaId: string; url: string }> {
  const url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=image`;

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)]);
  formData.append("media", blob, filename);

  const response = await fetch(url, { method: "POST", body: formData });
  const data = await response.json() as { media_id?: string; url?: string } & WechatApiError;

  checkWechatResponse(data);

  if (!data.media_id) throw new Error("上传封面图失败：未返回 media_id");
  return { mediaId: data.media_id, url: data.url ?? "" };
}

/** 上传正文图片，返回微信 CDN URL */
export async function uploadContentImage(
  accessToken: string,
  imageBuffer: Buffer,
  filename: string
): Promise<string> {
  const url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${accessToken}`;

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)]);
  formData.append("media", blob, filename);

  const response = await fetch(url, { method: "POST", body: formData });
  const data = await response.json() as { url?: string } & WechatApiError;

  checkWechatResponse(data);

  if (!data.url) throw new Error("上传正文图片失败：未返回 url");
  return data.url;
}

/** 创建草稿 */
export async function createDraft(
  accessToken: string,
  params: {
    title: string;
    thumbMediaId: string;
    content: string;
    digest?: string;
  },
  accountId?: number
): Promise<string> {
  const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`;

  const body = {
    articles: [
      {
        title: params.title,
        thumb_media_id: params.thumbMediaId,
        content: params.content,
        digest: params.digest ?? "",
        content_source_url: "",
        need_open_comment: 0,
        only_fans_can_comment: 0,
      },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as { media_id?: string } & WechatApiError;

  checkWechatResponse(data, accountId);

  if (!data.media_id) throw new Error("创建草稿失败：未返回 media_id");
  return data.media_id;
}
