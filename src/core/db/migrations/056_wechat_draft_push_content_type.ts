import type { SqliteDatabase } from "../openDatabase.js";

/** 为推送日志新增内容类型；旧记录保持 NULL，不能靠 ID 猜测文章或日报归属。 */
export const wechatDraftPushContentTypeMigration = {
  version: 56,
  name: "056_wechat_draft_push_content_type",
  apply(db: SqliteDatabase): void {
    const columns = db.pragma("table_info(wechat_draft_push_log)") as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "content_type")) {
      db.exec("ALTER TABLE wechat_draft_push_log ADD COLUMN content_type TEXT CHECK (content_type IN ('article', 'daily_digest'))");
    }
  }
} as const;
