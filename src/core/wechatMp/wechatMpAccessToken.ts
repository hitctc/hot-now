// access_token 获取与内存缓存
// 微信 access_token 有效期 7200 秒，全局唯一，需缓存避免频繁获取

import { decryptAccountSecret } from "./wechatMpAccountRepository.js";
import type { WechatMpAccountRecord, WechatApiError } from "./types.js";

interface CachedToken {
  token: string;
  expiresAt: number;
}

// 按账号 ID 缓存，内存 Map，重启时自动清空
const tokenCache = new Map<number, CachedToken>();

// 提前 5 分钟过期，避免使用即将过期的 token
const EXPIRE_BUFFER_MS = 5 * 60 * 1000;

/** 获取 access_token，优先使用缓存 */
export async function getAccessToken(
  account: WechatMpAccountRecord,
  masterKey: string
): Promise<string> {
  const cached = tokenCache.get(account.id);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const secret = decryptAccountSecret(account, masterKey);
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${account.appId}&secret=${secret}`;

  const response = await fetch(url);
  const data = await response.json() as { access_token?: string; expires_in?: number } & WechatApiError;

  if (data.errcode) {
    throw Object.assign(
      new Error(`获取 access_token 失败: ${data.errmsg}`),
      { errcode: data.errcode, errmsg: data.errmsg }
    );
  }

  const token = data.access_token;
  if (!token) throw new Error("获取 access_token 失败: 返回数据无 access_token");

  const expiresIn = data.expires_in ?? 7200;
  tokenCache.set(account.id, {
    token,
    expiresAt: Date.now() + expiresIn * 1000 - EXPIRE_BUFFER_MS,
  });

  return token;
}

/** 强制清除某账号的缓存（token 过期时调用） */
export function clearTokenCache(accountId: number): void {
  tokenCache.delete(accountId);
}

/** 清除全部缓存 */
export function clearAllTokenCache(): void {
  tokenCache.clear();
}
