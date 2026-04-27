import { readFile } from "node:fs/promises";
import path from "node:path";
import { defaultSessionMaxAgeSeconds } from "../auth/session.js";
import { RuntimeConfig } from "../types/appConfig.js";

const defaultDatabaseFile = "./data/hot-now.sqlite";
const defaultAiTimelineFeedFile = "./data/feeds/ai-timeline-feed.md";
const defaultAiTimelineFeedUrl = "https://now.achuan.cc/feeds/ai-timeline-feed.md";
const defaultAiTimelineFeedMaxFallbackVersions = 10;
const defaultAiTimelineAlertIntervalMinutes = 5;

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
  const configDir = path.dirname(configPath);
  const reportDir = resolveRuntimePath(configDir, fileConfig.report.dataDir, env.HOT_NOW_REPORT_DATA_DIR);
  const databaseFile = resolveRuntimePath(configDir, fileConfig.database.file, env.HOT_NOW_DATABASE_FILE);
  const aiTimelineFeedFile = resolveRuntimePath(
    configDir,
    fileConfig.aiTimelineFeed.file,
    env.AI_TIMELINE_FEED_FILE
  );
  const aiTimelineFeedManifestFile = resolveRuntimePath(
    configDir,
    fileConfig.aiTimelineFeed.manifestFile ?? deriveAiTimelineFeedManifestFile(aiTimelineFeedFile),
    env.AI_TIMELINE_FEED_MANIFEST_FILE
  );
  const smtpPort = parseSmtpPort(required(env.SMTP_PORT, "SMTP_PORT"));
  const smtpSecure = parseSmtpSecure(required(env.SMTP_SECURE, "SMTP_SECURE"));
  const wechatResolverBaseUrl = env.WECHAT_RESOLVER_BASE_URL?.trim();
  const wechatResolverToken = env.WECHAT_RESOLVER_TOKEN?.trim();

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
    aiTimelineFeed: {
      ...fileConfig.aiTimelineFeed,
      url: normalizeOptionalUrl(env.AI_TIMELINE_FEED_URL, fileConfig.aiTimelineFeed.url),
      file: aiTimelineFeedFile,
      manifestFile: aiTimelineFeedManifestFile,
      maxFallbackVersions: parseAiTimelineFeedMaxFallbackVersions(
        env.AI_TIMELINE_FEED_MAX_FALLBACK_VERSIONS,
        fileConfig.aiTimelineFeed.maxFallbackVersions
      )
    },
    aiTimelineAlerts: {
      ...fileConfig.aiTimelineAlerts,
      feishuWebhookUrl: normalizeOptionalUrl(env.FEISHU_ALERT_WEBHOOK_URL, null)
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
      sessionSecret: required(env.SESSION_SECRET, "SESSION_SECRET"),
      sessionTtlSeconds: parseAuthSessionTtlSeconds(env.AUTH_SESSION_TTL_SECONDS)
    },
    llm: {
      // Provider API keys still need encrypted storage in local mode, so explicit LLM master keys
      // override the shared session secret while missing env falls back to SESSION_SECRET.
      settingsMasterKey: env.LLM_SETTINGS_MASTER_KEY ?? required(env.SESSION_SECRET, "SESSION_SECRET")
    },
    wechatResolver:
      // Wechat source resolution stays optional: RSS sources still work when the internal resolver
      // is not configured in the current environment.
      wechatResolverBaseUrl && wechatResolverToken
        ? {
            baseUrl: wechatResolverBaseUrl,
            token: wechatResolverToken
          }
        : null
  };
}

function resolveRuntimePath(configDir: string, configValue: string, overrideValue: string | undefined) {
  // Production deploys move mutable files out of the code tree, so explicit path overrides
  // win when present while blank env values safely fall back to checked-in config defaults.
  const trimmedOverride = overrideValue?.trim();

  if (trimmedOverride) {
    return path.resolve(trimmedOverride);
  }

  return path.resolve(configDir, configValue);
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
  const aiTimelineFeed = getOptionalObject(parsed.aiTimelineFeed, "aiTimelineFeed");
  const aiTimelineAlerts = getOptionalObject(parsed.aiTimelineAlerts, "aiTimelineAlerts");
  const aiTimelineAlertChannels = getOptionalObject(aiTimelineAlerts?.channels, "aiTimelineAlerts.channels");
  const aiTimelineFeedFile =
    optionalConfigString(aiTimelineFeed?.file, "aiTimelineFeed.file") ?? defaultAiTimelineFeedFile;
  const aiTimelineFeedUrl = optionalConfigString(aiTimelineFeed?.url, "aiTimelineFeed.url") ?? defaultAiTimelineFeedUrl;
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
  const parsedAiTimelineAlerts = {
    enabled: optionalConfigBoolean(aiTimelineAlerts?.enabled, "aiTimelineAlerts.enabled") ?? false,
    intervalMinutes:
      optionalScheduleIntervalMinutes(aiTimelineAlerts?.intervalMinutes, "aiTimelineAlerts.intervalMinutes") ??
      defaultAiTimelineAlertIntervalMinutes,
    channels: {
      feishu: optionalConfigBoolean(aiTimelineAlertChannels?.feishu, "aiTimelineAlerts.channels.feishu") ?? false,
      email: optionalConfigBoolean(aiTimelineAlertChannels?.email, "aiTimelineAlerts.channels.email") ?? false
    },
    feishuWebhookUrl: null
  };

  return {
    server: {
      port: requiredRunnablePort(server.port, "server.port")
    },
    collectionSchedule: parsedCollectionSchedule,
    mailSchedule: parsedMailSchedule,
    aiTimelineAlerts: parsedAiTimelineAlerts,
    manualActions: parsedManualActions,
    report: {
      topN: requiredPositiveInteger(report.topN, "report.topN"),
      dataDir: requiredConfigString(report.dataDir, "report.dataDir"),
      allowDegraded: requiredConfigBoolean(report.allowDegraded, "report.allowDegraded")
    },
    aiTimelineFeed: {
      url: aiTimelineFeedUrl,
      file: aiTimelineFeedFile,
      manifestFile:
        optionalConfigString(aiTimelineFeed?.manifestFile, "aiTimelineFeed.manifestFile") ??
        deriveAiTimelineFeedManifestFile(aiTimelineFeedFile),
      maxFallbackVersions:
        optionalPositiveInteger(aiTimelineFeed?.maxFallbackVersions, "aiTimelineFeed.maxFallbackVersions") ??
        defaultAiTimelineFeedMaxFallbackVersions
    },
    source: {
      rssUrl: requiredConfigString(source.rssUrl, "source.rssUrl")
    },
    database: {
      file: requiredConfigString(database?.file ?? defaultDatabaseFile, "database.file")
    }
  };
}

function normalizeOptionalUrl(overrideValue: string | undefined, configValue: string | null) {
  const trimmedOverride = overrideValue?.trim();

  if (trimmedOverride) {
    return trimmedOverride;
  }

  return configValue?.trim() || null;
}

function deriveAiTimelineFeedManifestFile(feedFile: string) {
  const parsedPath = path.parse(feedFile);
  return path.join(parsedPath.dir, `${parsedPath.name}-manifest.json`);
}

function parseAiTimelineFeedMaxFallbackVersions(value: string | undefined, configValue: number) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return configValue;
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`Invalid AI_TIMELINE_FEED_MAX_FALLBACK_VERSIONS: ${value}`);
  }

  return parsedValue;
}

function parseAuthSessionTtlSeconds(value: string | undefined) {
  // Login sessions keep a fixed lifetime per token; this setting changes only that duration.
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return defaultSessionMaxAgeSeconds;
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`Invalid AUTH_SESSION_TTL_SECONDS: ${value}`);
  }

  return parsedValue;
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

function optionalConfigString(value: unknown, key: string) {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${key}`);
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

function optionalConfigBoolean(value: unknown, key: string) {
  // Optional feature blocks default safely when absent, but reject misspelled boolean values early.
  if (value == null) {
    return undefined;
  }

  return requiredConfigBoolean(value, key);
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

function optionalPositiveInteger(value: unknown, key: string) {
  if (value == null) {
    return undefined;
  }

  return requiredPositiveInteger(value, key);
}

function requiredCollectionIntervalMinutes(value: unknown, key: string) {
  const intervalMinutes = requiredConfigNumber(value, key);

  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes >= 60 || 60 % intervalMinutes !== 0) {
    throw new Error(`Invalid ${key}: ${intervalMinutes}`);
  }

  return intervalMinutes;
}

function optionalScheduleIntervalMinutes(value: unknown, key: string) {
  // Alert polling uses the same cron-friendly interval shape as collection polling.
  if (value == null) {
    return undefined;
  }

  return requiredCollectionIntervalMinutes(value, key);
}

function requiredMailScheduleDailyTime(value: unknown, key: string) {
  const dailyTime = requiredConfigString(value, key);

  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(dailyTime)) {
    throw new Error(`Invalid ${key}: ${dailyTime}`);
  }

  return dailyTime;
}
