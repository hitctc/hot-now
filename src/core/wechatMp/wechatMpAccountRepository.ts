// 公众号配置 CRUD
// 纯函数风格，db 参数优先，与项目其他 Repository 保持一致

import { encryptProviderSecret, decryptProviderSecret } from "../llm/providerSettingsCrypto.js";
import {
  ACCOUNT_SELECT_COLUMNS,
  mapAccountRow,
  toPublic,
  type WechatMpAccountRecord,
  type WechatMpAccountPublic,
  type SaveWechatMpAccountInput,
} from "./types.js";
import type { SqliteDatabase } from "../db/openDatabase.js";

// better-sqlite3 返回的行是普通对象，用 unknown 中转避免类型断言报错
type DbRow = Parameters<typeof mapAccountRow>[0];

/** 获取所有公众号配置（不含 secret） */
export function listWechatMpAccounts(db: SqliteDatabase): WechatMpAccountPublic[] {
  const rows = db.prepare(`SELECT ${ACCOUNT_SELECT_COLUMNS} FROM wechat_mp_accounts ORDER BY is_default DESC, created_at ASC`).all() as unknown[];
  return rows.map((row) => toPublic(mapAccountRow(row as DbRow)));
}

/** 获取默认公众号配置（含 secret，仅内部使用） */
export function findDefaultWechatMpAccount(db: SqliteDatabase): WechatMpAccountRecord | null {
  const row = db.prepare(`SELECT ${ACCOUNT_SELECT_COLUMNS} FROM wechat_mp_accounts WHERE is_default = 1 AND is_enabled = 1`).get() as unknown;
  if (!row) return null;
  return mapAccountRow(row as DbRow);
}

/** 按 ID 获取公众号配置（含 secret，仅内部使用） */
export function findWechatMpAccountById(db: SqliteDatabase, id: number): WechatMpAccountRecord | null {
  const row = db.prepare(`SELECT ${ACCOUNT_SELECT_COLUMNS} FROM wechat_mp_accounts WHERE id = ?`).get(id) as unknown;
  if (!row) return null;
  return mapAccountRow(row as DbRow);
}

/** 解密 secret */
export function decryptAccountSecret(account: WechatMpAccountRecord, masterKey: string): string {
  return decryptProviderSecret(account.encryptedSecret, masterKey);
}

/** 新增或更新公众号配置 */
export function saveWechatMpAccount(
  db: SqliteDatabase,
  input: SaveWechatMpAccountInput,
  masterKey: string
): { ok: boolean; id: number } {
  if (input.id) {
    // 更新
    const sets: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { sets.push("name = ?"); values.push(input.name); }
    if (input.appId !== undefined) { sets.push("app_id = ?"); values.push(input.appId); }
    if (input.notes !== undefined) { sets.push("notes = ?"); values.push(input.notes); }
    if (input.isEnabled !== undefined) { sets.push("is_enabled = ?"); values.push(input.isEnabled ? 1 : 0); }
    if (input.appSecret) {
      const encrypted = encryptProviderSecret(input.appSecret, masterKey);
      sets.push("encrypted_secret = ?");
      sets.push("secret_last4 = ?");
      values.push(encrypted, input.appSecret.slice(-4));
    }

    if (sets.length > 0) {
      sets.push("updated_at = CURRENT_TIMESTAMP");
      values.push(input.id);
      db.prepare(`UPDATE wechat_mp_accounts SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }

    // 如果设置为默认，先清空其他
    if (input.isDefault) {
      setDefaultInternal(db, input.id);
    }

    return { ok: true, id: input.id };
  }

  // 新增
  if (!input.appSecret) throw new Error("新增公众号配置必须提供 appSecret");
  const encrypted = encryptProviderSecret(input.appSecret, masterKey);
  const secretLast4 = input.appSecret.slice(-4);

  const result = db.prepare(`
    INSERT INTO wechat_mp_accounts (name, app_id, encrypted_secret, secret_last4, is_enabled, is_default, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.name,
    input.appId,
    encrypted,
    secretLast4,
    (input.isEnabled ?? true) ? 1 : 0,
    (input.isDefault ?? false) ? 1 : 0,
    input.notes ?? null
  );

  const newId = Number(result.lastInsertRowid);

  // 如果设置为默认，先清空其他
  if (input.isDefault) {
    setDefaultInternal(db, newId);
  }

  return { ok: true, id: newId };
}

/** 删除公众号配置 */
export function deleteWechatMpAccount(db: SqliteDatabase, id: number): boolean {
  const result = db.prepare("DELETE FROM wechat_mp_accounts WHERE id = ?").run(id);
  return result.changes > 0;
}

/** 设置默认公众号 */
export function setDefaultWechatMpAccount(db: SqliteDatabase, id: number): boolean {
  const account = findWechatMpAccountById(db, id);
  if (!account) return false;
  setDefaultInternal(db, id);
  return true;
}

/** 内部：事务内先清空所有 is_default，再设置目标 */
function setDefaultInternal(db: SqliteDatabase, id: number): void {
  db.transaction(() => {
    db.exec("UPDATE wechat_mp_accounts SET is_default = 0");
    db.prepare("UPDATE wechat_mp_accounts SET is_default = 1 WHERE id = ?").run(id);
  })();
}
