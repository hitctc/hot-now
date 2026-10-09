import type { SqliteDatabase } from "../db/openDatabase.js";
import { isWriteQueuePreferences, type WriteQueuePreferences } from "./userPreferences.js";

type UserProfilePreferencesRow = { preferences_json: string };

/** 读取单一账号当前保存的文章队列偏好；没有保存记录时返回 null 供客户端迁移旧状态。 */
export function readWriteQueuePreferences(db: SqliteDatabase): WriteQueuePreferences | null {
  const row = db.prepare("SELECT preferences_json FROM user_profile WHERE id = 1")
    .get() as UserProfilePreferencesRow | undefined;
  if (!row) return null;

  const preferences = parseUserPreferences(row.preferences_json);
  const queuePreferences = preferences?.writeQueue;
  return isWriteQueuePreferences(queuePreferences) ? queuePreferences : null;
}

/** 更新队列偏好并保留同一账号 JSON 中其他设置；非法状态或损坏 JSON 不会覆盖原值。 */
export function saveWriteQueuePreferences(
  db: SqliteDatabase,
  queuePreferences: WriteQueuePreferences,
): void {
  if (!isWriteQueuePreferences(queuePreferences)) throw new Error("invalid-write-queue-preferences");

  const row = db.prepare("SELECT preferences_json FROM user_profile WHERE id = 1")
    .get() as UserProfilePreferencesRow | undefined;
  if (!row) throw new Error("user-profile-not-found");

  const current = parseUserPreferences(row.preferences_json);
  if (!current) throw new Error("invalid-user-profile-preferences");

  db.prepare(`
    UPDATE user_profile
    SET preferences_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(JSON.stringify({ ...current, writeQueue: queuePreferences }));
}

/** 只接受可合并的 JSON 对象；损坏或非对象值返回 null，供写入端拒绝覆盖。 */
function parseUserPreferences(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
