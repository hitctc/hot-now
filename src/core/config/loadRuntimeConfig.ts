import { readFile } from "node:fs/promises";
import path from "node:path";
import { RuntimeConfig } from "../types/appConfig.js";

type Options = {
  configPath?: string;
  env?: Record<string, string | undefined>;
};

export async function loadRuntimeConfig(options: Options = {}): Promise<RuntimeConfig> {
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? path.resolve("config/hot-now.config.json");
  const fileText = await readFile(configPath, "utf8");
  const fileConfig = JSON.parse(fileText) as Omit<RuntimeConfig, "smtp">;

  return {
    ...fileConfig,
    report: {
      ...fileConfig.report,
      dataDir: path.resolve(path.dirname(configPath), fileConfig.report.dataDir)
    },
    smtp: {
      host: required(env.SMTP_HOST, "SMTP_HOST"),
      port: Number(required(env.SMTP_PORT, "SMTP_PORT")),
      secure: required(env.SMTP_SECURE, "SMTP_SECURE") === "true",
      user: required(env.SMTP_USER, "SMTP_USER"),
      pass: required(env.SMTP_PASS, "SMTP_PASS"),
      to: required(env.MAIL_TO, "MAIL_TO"),
      baseUrl: required(env.BASE_URL, "BASE_URL")
    }
  };
}

function required(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }

  return value;
}
