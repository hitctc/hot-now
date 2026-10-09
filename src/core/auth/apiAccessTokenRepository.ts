import { createHash, randomBytes } from "node:crypto";
import type { SqliteDatabase } from "../db/openDatabase.js";

const tokenLifetimeMs = 365 * 24 * 60 * 60 * 1000;
const tokenUseWriteIntervalMs = 60 * 1000;

export type ApiAccessTokenRecord = {
  id: number;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type ApiAccessTokenPrincipal = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
  expiresAt: string;
};

/** 为已登录账号签发一年期全权限凭证；数据库只保存摘要，明文仅由返回值交给一次性展示层。 */
export function createApiAccessToken(
  db: SqliteDatabase,
  ownerUsername: string,
  name: string,
  now = new Date()
): ApiAccessTokenRecord & { token: string } {
  const normalizedName = name.trim();
  const normalizedOwner = ownerUsername.trim();
  if (
    !normalizedOwner ||
    !normalizedName ||
    normalizedName.length > 64 ||
    /[\u0000-\u001f\u007f]/.test(normalizedName)
  ) {
    throw new Error("API token owner and a 1-64 character name are required");
  }

  const token = `hn_live_${randomBytes(32).toString("base64url")}`;
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + tokenLifetimeMs).toISOString();
  const result = db.prepare(`
    INSERT INTO admin_api_access_tokens (
      owner_username, name, token_hash, token_prefix, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(normalizedOwner, normalizedName, hashToken(token), token.slice(0, 16), createdAt, expiresAt);

  return {
    id: Number(result.lastInsertRowid),
    name: normalizedName,
    token,
    tokenPrefix: token.slice(0, 16),
    createdAt,
    expiresAt,
    lastUsedAt: null,
    revokedAt: null
  };
}

/** 通过摘要查找有效凭证并返回当前账号角色；最近使用时间最多每分钟写入一次。 */
export function authenticateApiAccessToken(
  db: SqliteDatabase,
  token: string,
  now = new Date()
): ApiAccessTokenPrincipal | null {
  if (!/^hn_live_[A-Za-z0-9_-]{43}$/.test(token)) {
    return null;
  }

  const row = db.prepare(`
    SELECT t.id, p.username, p.display_name, p.role, t.created_at, t.expires_at, t.last_used_at
    FROM admin_api_access_tokens t
    JOIN user_profile p ON p.username = t.owner_username
    WHERE t.token_hash = ? AND t.revoked_at IS NULL
  `).get(hashToken(token)) as {
    id: number;
    username: string;
    display_name: string | null;
    role: string | null;
    created_at: string;
    expires_at: string;
    last_used_at: string | null;
  } | undefined;

  if (!row || Date.parse(row.expires_at) <= now.getTime()) {
    return null;
  }

  const lastUsedAtMs = row.last_used_at ? Date.parse(row.last_used_at) : Number.NEGATIVE_INFINITY;
  if (lastUsedAtMs <= now.getTime() - tokenUseWriteIntervalMs) {
    db.prepare("UPDATE admin_api_access_tokens SET last_used_at = ? WHERE id = ?").run(now.toISOString(), row.id);
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name?.trim() || row.username,
    role: row.role?.trim() || "admin",
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

/** 列出当前账号凭证的非敏感元数据，绝不返回摘要或可用明文。 */
export function listApiAccessTokens(db: SqliteDatabase, ownerUsername?: string): ApiAccessTokenRecord[] {
  const rows = ownerUsername
    ? db.prepare(`
        SELECT id, name, token_prefix, created_at, expires_at, last_used_at, revoked_at
        FROM admin_api_access_tokens WHERE owner_username = ? ORDER BY created_at DESC, id DESC
      `).all(ownerUsername)
    : db.prepare(`
        SELECT id, name, token_prefix, created_at, expires_at, last_used_at, revoked_at
        FROM admin_api_access_tokens ORDER BY created_at DESC, id DESC
      `).all();

  return (rows as ApiAccessTokenRow[]).map(mapApiAccessTokenRow);
}

/** 撤销当前账号的有效凭证；已撤销或不属于该账号的 ID 返回 false。 */
export function revokeApiAccessToken(
  db: SqliteDatabase,
  id: number,
  ownerUsername: string,
  now = new Date()
): boolean {
  const result = db.prepare(`
    UPDATE admin_api_access_tokens SET revoked_at = ?
    WHERE id = ? AND owner_username = ? AND revoked_at IS NULL
  `).run(now.toISOString(), id, ownerUsername);
  return result.changes > 0;
}

/** 读取有效凭证及已发送提醒阶段，供每日通知任务选择唯一当前阶段。 */
export function listApiAccessTokensForExpiryReminder(db: SqliteDatabase): Array<{
  id: number;
  name: string;
  expiresAt: string;
  sentReminderDays: number[];
}> {
  const tokens = db.prepare(`
    SELECT id, name, expires_at FROM admin_api_access_tokens
    WHERE revoked_at IS NULL ORDER BY expires_at ASC
  `).all() as Array<{ id: number; name: string; expires_at: string }>;
  const readSentDays = db.prepare(`
    SELECT reminder_days FROM admin_api_access_token_reminders WHERE token_id = ?
  `);

  return tokens.map((token) => ({
    id: token.id,
    name: token.name,
    expiresAt: token.expires_at,
    sentReminderDays: (readSentDays.all(token.id) as Array<{ reminder_days: number }>).map((row) => row.reminder_days)
  }));
}

/** 在邮件成功发送后记录对应提醒阶段；唯一键保证同一阶段不会重复记账。 */
export function markApiAccessTokenExpiryReminderSent(
  db: SqliteDatabase,
  tokenId: number,
  reminderDays: 7 | 14 | 30,
  sentAt = new Date()
): void {
  db.prepare(`
    INSERT INTO admin_api_access_token_reminders (token_id, reminder_days, sent_at)
    VALUES (?, ?, ?) ON CONFLICT(token_id, reminder_days) DO NOTHING
  `).run(tokenId, reminderDays, sentAt.toISOString());
}

/** 将数据库行映射成可安全返回给设置页面的 camelCase 元数据。 */
function mapApiAccessTokenRow(row: ApiAccessTokenRow): ApiAccessTokenRecord {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at
  };
}

/** 使用 SHA-256 摘要比较高熵随机凭证，避免数据库泄漏直接暴露可用 token。 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type ApiAccessTokenRow = {
  id: number;
  name: string;
  token_prefix: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};
