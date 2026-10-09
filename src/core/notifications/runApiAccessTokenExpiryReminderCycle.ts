import type { SqliteDatabase } from "../db/openDatabase.js";
import { sendApiAccessTokenExpiryReminderEmail } from "../mail/sendApiAccessTokenExpiryReminderEmail.js";
import type { SendMail } from "../mail/sendEmailMessage.js";
import type { RuntimeConfig } from "../types/appConfig.js";
import {
  listApiAccessTokensForExpiryReminder,
  markApiAccessTokenExpiryReminderSent
} from "../auth/apiAccessTokenRepository.js";

const dayMs = 24 * 60 * 60 * 1000;

/** 每日检查有效凭证并对当前到期阶段发一次邮件；SMTP 失败时不记录阶段，留待后续重试。 */
export async function runApiAccessTokenExpiryReminderCycle(
  db: SqliteDatabase,
  config: RuntimeConfig,
  sendMail?: SendMail,
  now = new Date()
): Promise<{ sentCount: number }> {
  let sentCount = 0;
  const tokens = listApiAccessTokensForExpiryReminder(db);

  for (const token of tokens) {
    const remainingDays = Math.ceil((Date.parse(token.expiresAt) - now.getTime()) / dayMs);
    const reminderDays = resolveReminderStage(remainingDays);
    if (!reminderDays || token.sentReminderDays.includes(reminderDays)) {
      continue;
    }

    await sendApiAccessTokenExpiryReminderEmail(config, {
      name: token.name,
      expiresAt: token.expiresAt,
      reminderDays
    }, sendMail);
    markApiAccessTokenExpiryReminderSent(db, token.id, reminderDays, now);
    sentCount += 1;
  }

  return { sentCount };
}

/** 只选择离到期最近的已到提醒节点，避免停机恢复后补发多封过期阶段邮件。 */
function resolveReminderStage(remainingDays: number): 7 | 14 | 30 | null {
  if (remainingDays < 1 || remainingDays > 30) return null;
  if (remainingDays <= 7) return 7;
  if (remainingDays <= 14) return 14;
  return 30;
}
