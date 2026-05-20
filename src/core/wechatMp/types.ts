// 微信公众号模块的类型定义

import type { SqliteDatabase } from "../db/openDatabase.js";

// 数据库行类型（snake_case）
interface WechatMpAccountRow {
  id: number;
  name: string;
  app_id: string;
  encrypted_secret: string;
  secret_last4: string;
  is_enabled: number;
  is_default: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// 完整记录（含加密 secret，仅内部使用）
export interface WechatMpAccountRecord {
  id: number;
  name: string;
  appId: string;
  encryptedSecret: string;
  secretLast4: string;
  isEnabled: boolean;
  isDefault: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// 前端展示用的公开类型（不含 secret）
export type WechatMpAccountPublic = Omit<WechatMpAccountRecord, "encryptedSecret">;

export function mapAccountRow(row: WechatMpAccountRow): WechatMpAccountRecord {
  return {
    id: row.id,
    name: row.name,
    appId: row.app_id,
    encryptedSecret: row.encrypted_secret,
    secretLast4: row.secret_last4,
    isEnabled: row.is_enabled === 1,
    isDefault: row.is_default === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPublic(record: WechatMpAccountRecord): WechatMpAccountPublic {
  const { encryptedSecret: _, ...rest } = record;
  return rest;
}

// 推送记录
export interface DraftPushLogRecord {
  id: number;
  articleId: number;
  accountId: number;
  themeId: string;
  mediaId: string | null;
  status: "pending" | "success" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
  pushedAt: string;
}

// 新增/更新公众号的输入
export interface SaveWechatMpAccountInput {
  id?: number;
  name: string;
  appId: string;
  appSecret?: string;
  notes?: string;
  isDefault?: boolean;
  isEnabled?: boolean;
}

// 推送结果
export interface DraftPushResult {
  ok: boolean;
  mediaId?: string;
  errorCode?: string;
  errorMessage?: string;
  hint?: string;
}

// 微信 API 错误
export interface WechatApiError {
  errcode: number;
  errmsg: string;
}

// 供 Repository 使用的 SELECT 列
export const ACCOUNT_SELECT_COLUMNS = `
  id, name, app_id, encrypted_secret, secret_last4,
  is_enabled, is_default, notes, created_at, updated_at
` as const;

// 微信 API 错误码 → 友好提示映射
export const WECHAT_ERROR_HINTS: Record<number, { message: string; hint: string }> = {
  [-1]: { message: "微信系统繁忙", hint: "请稍后重试" },
  40001: { message: "微信接口认证失败", hint: "请检查 AppID 和 AppSecret 配置是否正确" },
  40004: { message: "媒体类型不合法", hint: "请检查图片格式（封面图需 JPEG，正文图需 PNG）" },
  40009: { message: "图片大小超限", hint: "图片文件不能超过 10MB" },
  41001: { message: "缺少 access_token", hint: "系统错误，请重试" },
  42001: { message: "access_token 已过期", hint: "系统会自动刷新，请重试" },
  43002: { message: "请求方法错误", hint: "系统错误，请联系开发者" },
  45009: { message: "API 调用超过限制", hint: "今日调用次数已达上限，请明天再试" },
  46003: { message: "草稿不存在", hint: "该草稿可能已被发布或删除" },
  48001: { message: "无此接口权限", hint: "请确认公众号已完成认证，且已开通草稿箱接口权限" },
  61004: { message: "access_token 过期", hint: "系统会自动刷新，请重试" },
  40125: { message: "AppSecret 错误", hint: "请检查 AppSecret 配置是否与公众号后台一致" },
  40130: { message: "封面素材无效", hint: "请重新推送，系统会重新上传封面图" },
  45065: { message: "24小时内重复发布", hint: "该内容在24小时内已发布过，请稍后再试" },
  61006: { message: "IP不在白名单中", hint: "IP_WHITELIST" },
};

// 推送接口依赖注入参数
export interface WechatMpDeps {
  db: SqliteDatabase;
  masterKey: string;
}
