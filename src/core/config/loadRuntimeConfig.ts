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
  const fileConfig = parseRuntimeConfigFile(fileText);
  const reportDir = path.resolve(path.dirname(configPath), fileConfig.report.dataDir);
  const smtpPort = parseSmtpPort(required(env.SMTP_PORT, "SMTP_PORT"));
  const smtpSecure = parseSmtpSecure(required(env.SMTP_SECURE, "SMTP_SECURE"));

  return {
    ...fileConfig,
    report: {
      ...fileConfig.report,
      dataDir: reportDir
    },
    smtp: {
      host: required(env.SMTP_HOST, "SMTP_HOST"),
      port: smtpPort,
      secure: smtpSecure,
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

function parseSmtpPort(value: string) {
  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid SMTP_PORT: ${value}`);
  }

  return port;
}

function parseSmtpSecure(value: string) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`Invalid SMTP_SECURE: ${value}`);
}

function parseRuntimeConfigFile(fileText: string): Omit<RuntimeConfig, "smtp"> {
  const parsed = JSON.parse(fileText) as Record<string, unknown>;

  return {
    server: {
      port: requiredConfigNumber(getRequiredObject(parsed.server, "server").port, "server.port")
    },
    schedule: {
      enabled: requiredConfigBoolean(getRequiredObject(parsed.schedule, "schedule").enabled, "schedule.enabled"),
      dailyTime: requiredConfigString(getRequiredObject(parsed.schedule, "schedule").dailyTime, "schedule.dailyTime"),
      timezone: requiredConfigString(getRequiredObject(parsed.schedule, "schedule").timezone, "schedule.timezone")
    },
    report: {
      topN: requiredConfigNumber(getRequiredObject(parsed.report, "report").topN, "report.topN"),
      dataDir: requiredConfigString(getRequiredObject(parsed.report, "report").dataDir, "report.dataDir"),
      allowDegraded: requiredConfigBoolean(
        getRequiredObject(parsed.report, "report").allowDegraded,
        "report.allowDegraded"
      )
    },
    source: {
      rssUrl: requiredConfigString(getRequiredObject(parsed.source, "source").rssUrl, "source.rssUrl")
    },
    manualRun: {
      enabled: requiredConfigBoolean(getRequiredObject(parsed.manualRun, "manualRun").enabled, "manualRun.enabled")
    }
  };
}

function getRequiredObject(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Missing required config field: ${key}`);
  }

  return value as Record<string, unknown>;
}

function requiredConfigString(value: unknown, key: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required config field: ${key}`);
  }

  return value;
}

function requiredConfigNumber(value: unknown, key: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Missing required config field: ${key}`);
  }

  return value;
}

function requiredConfigBoolean(value: unknown, key: string) {
  if (typeof value !== "boolean") {
    throw new Error(`Missing required config field: ${key}`);
  }

  return value;
}
