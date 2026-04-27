import { createRequire } from "node:module";
import type { RuntimeConfig } from "../types/appConfig.js";

export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

export type SendMail = (message: EmailMessage) => Promise<unknown>;

const require = createRequire(import.meta.url);
const { createTransport } = require("nodemailer") as {
  createTransport: (options: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  }) => { sendMail(message: EmailMessage): Promise<unknown> };
};

// All SMTP callers go through this helper so tests can inject a fake transport without touching network.
export async function sendEmailMessage(config: RuntimeConfig, message: EmailMessage, sendMail?: SendMail) {
  if (sendMail) {
    await sendMail(message);
    return;
  }

  const transport = createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass
    }
  });

  await transport.sendMail(message);
}
