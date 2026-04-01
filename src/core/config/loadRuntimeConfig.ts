import { readFile } from "node:fs/promises";
import path from "node:path";
import { RuntimeConfig } from "../types/appConfig.js";

const defaultDatabaseFile = "./data/hot-now.sqlite";

type Options = {
  configPath?: string;
  env?: Record<string, string | undefined>;
};

export async function loadRuntimeConfig(options: Options = {}): Promise<RuntimeConfig> {
  // Runtime config is split between the checked-in JSON file and required secrets from env,
  // so startup resolves both sides here into one object the rest of the app can trust.
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? path.resolve("config/hot-now.config.json");
  const fileText = await readFile(configPath, "utf8");
  const fileConfig = parseRuntimeConfigFile(fileText);
  const reportDir = path.resolve(path.dirname(configPath), fileConfig.report.dataDir);
  const databaseFile = path.resolve(path.dirname(configPath), fileConfig.database.file);
  const smtpPort = parseSmtpPort(required(env.SMTP_PORT, "SMTP_PORT"));
  const smtpSecure = parseSmtpSecure(required(env.SMTP_SECURE, "SMTP_SECURE"));

  return {
    ...fileConfig,
    database: {
      ...fileConfig.database,
      file: databaseFile
    },
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
    },
    auth: {
      // Unified shell auth is enabled in the real entry point, so credentials and session secret
      // must be explicit env values instead of silent development defaults.
      username: required(env.AUTH_USERNAME, "AUTH_USERNAME"),
      password: required(env.AUTH_PASSWORD, "AUTH_PASSWORD"),
      sessionSecret: required(env.SESSION_SECRET, "SESSION_SECRET")
    },
    llm: {
      // Provider API keys still need encrypted storage in local mode, so explicit LLM master keys
      // override the shared session secret while missing env falls back to SESSION_SECRET.
      settingsMasterKey: env.LLM_SETTINGS_MASTER_KEY ?? required(env.SESSION_SECRET, "SESSION_SECRET")
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

function parseRuntimeConfigFile(fileText: string): Omit<RuntimeConfig, "smtp" | "auth"> {
  // The config file keeps deploy-time knobs only; secrets stay out of JSON and are injected later.
  const parsed = JSON.parse(fileText) as Record<string, unknown>;
  const server = getRequiredObject(parsed.server, "server");
  const collectionSchedule = getRequiredObject(parsed.collectionSchedule, "collectionSchedule");
  const mailSchedule = getRequiredObject(parsed.mailSchedule, "mailSchedule");
  const manualActions = getRequiredObject(parsed.manualActions, "manualActions");
  const report = getRequiredObject(parsed.report, "report");
  const source = getRequiredObject(parsed.source, "source");
  const database = getOptionalObject(parsed.database, "database");
  const parsedMailSchedule = {
    enabled: requiredConfigBoolean(mailSchedule.enabled, "mailSchedule.enabled"),
    dailyTime: requiredMailScheduleDailyTime(mailSchedule.dailyTime, "mailSchedule.dailyTime"),
    timezone: requiredConfigString(mailSchedule.timezone, "mailSchedule.timezone")
  };
  const parsedCollectionSchedule = {
    enabled: requiredConfigBoolean(collectionSchedule.enabled, "collectionSchedule.enabled"),
    intervalMinutes: requiredCollectionIntervalMinutes(
      collectionSchedule.intervalMinutes,
      "collectionSchedule.intervalMinutes"
    )
  };
  const parsedManualActions = {
    collectEnabled: requiredConfigBoolean(manualActions.collectEnabled, "manualActions.collectEnabled"),
    sendLatestEmailEnabled: requiredConfigBoolean(
      manualActions.sendLatestEmailEnabled,
      "manualActions.sendLatestEmailEnabled"
    )
  };

  return {
    server: {
      port: requiredRunnablePort(server.port, "server.port")
    },
    collectionSchedule: parsedCollectionSchedule,
    mailSchedule: parsedMailSchedule,
    manualActions: parsedManualActions,
    report: {
      topN: requiredPositiveInteger(report.topN, "report.topN"),
      dataDir: requiredConfigString(report.dataDir, "report.dataDir"),
      allowDegraded: requiredConfigBoolean(report.allowDegraded, "report.allowDegraded")
    },
    source: {
      rssUrl: requiredConfigString(source.rssUrl, "source.rssUrl")
    },
    database: {
      file: requiredConfigString(database?.file ?? defaultDatabaseFile, "database.file")
    }
  };
}

function getRequiredObject(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Missing required config field: ${key}`);
  }

  return value as Record<string, unknown>;
}

function getOptionalObject(value: unknown, key: string) {
  // Legacy config files may not know about new sections yet, so callers can opt into
  // newer blocks without breaking older checked-in JSON.
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
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

function requiredRunnablePort(value: unknown, key: string) {
  const port = requiredConfigNumber(value, key);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${key}: ${port}`);
  }

  return port;
}

function requiredPositiveInteger(value: unknown, key: string) {
  const number = requiredConfigNumber(value, key);

  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Invalid ${key}: ${number}`);
  }

  return number;
}

function requiredCollectionIntervalMinutes(value: unknown, key: string) {
  const intervalMinutes = requiredConfigNumber(value, key);

  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes >= 60 || 60 % intervalMinutes !== 0) {
    throw new Error(`Invalid ${key}: ${intervalMinutes}`);
  }

  return intervalMinutes;
}

function requiredMailScheduleDailyTime(value: unknown, key: string) {
  const dailyTime = requiredConfigString(value, key);

  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(dailyTime)) {
    throw new Error(`Invalid ${key}: ${dailyTime}`);
  }

  return dailyTime;
}
