import type { RuntimeConfig } from "../types/appConfig.js";
import { sendEmailMessage, type SendMail } from "./sendEmailMessage.js";

/** 发送不含凭证明文的到期提醒；收件人沿用生产邮件配置中的 MAIL_TO。 */
export async function sendApiAccessTokenExpiryReminderEmail(
  config: RuntimeConfig,
  input: { name: string; expiresAt: string; reminderDays: 7 | 14 | 30 },
  sendMail?: SendMail
): Promise<void> {
  const profileUrl = escapeHtml(new URL("/settings/profile", config.publicBaseUrl).toString());
  const name = escapeHtml(input.name);
  const expiresAt = escapeHtml(input.expiresAt);

  await sendEmailMessage(
    config,
    {
      from: config.smtp.user,
      to: config.smtp.to,
      subject: `HotNow API 凭证到期提醒（${input.reminderDays} 天）`,
      html: `<!doctype html><html lang="zh-CN"><body><h1>HotNow API 凭证到期提醒</h1><p>凭证「${name}」将在 ${input.reminderDays} 天内到期。</p><p>到期时间：${expiresAt}</p><p><a href="${profileUrl}">打开账号资料页管理凭证</a></p><p>邮件不会包含凭证明文；如需继续使用，请登录后签发新凭证并撤销旧凭证。</p></body></html>`
    },
    sendMail
  );
}

/** 转义账号自定义名称，避免它被解释为提醒邮件中的 HTML。 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
