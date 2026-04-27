import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "../../src/core/config/loadRuntimeConfig.js";
import { listReportDates, readTextFile, writeJsonFile, writeTextFile } from "../../src/core/storage/reportStore.js";

const baseEnv = {
  SMTP_HOST: "smtp.qq.com",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_USER: "sender@qq.com",
  SMTP_PASS: "secret",
  MAIL_TO: "receiver@example.com",
  BASE_URL: "http://127.0.0.1:3030",
  AUTH_USERNAME: "admin",
  AUTH_PASSWORD: "super-secret",
  SESSION_SECRET: "session-secret-value"
} satisfies Record<string, string>;

describe("loadRuntimeConfig", () => {
  it("resolves the default report dataDir from the config file directory", async () => {
    const config = await loadRuntimeConfig({
      configPath: path.resolve("config/hot-now.config.json"),
      env: baseEnv
    });

    expect(config.report.dataDir).toBe(path.resolve("data/reports"));
    expect(config.collectionSchedule).toEqual({
      enabled: true,
      intervalMinutes: 10
    });
    expect(config.mailSchedule).toEqual({
      enabled: false,
      dailyTime: "10:00",
      timezone: "Asia/Shanghai"
    });
    expect(config.aiTimelineAlerts).toEqual({
      enabled: true,
      intervalMinutes: 5,
      channels: { feishu: true, email: true },
      feishuWebhookUrl: null
    });
    expect(config.manualActions).toEqual({
      collectEnabled: true,
      sendLatestEmailEnabled: true
    });
    expect(config.aiTimelineFeed).toEqual({
      url: "https://now.achuan.cc/feeds/ai-timeline-feed.md",
      file: path.resolve("data/feeds/ai-timeline-feed.md"),
      manifestFile: path.resolve("data/feeds/ai-timeline-feed-manifest.json"),
      maxFallbackVersions: 10
    });
  });

  it("allows HOT_NOW_* paths to override resolved runtime paths", async () => {
    const config = await loadRuntimeConfig({
      configPath: path.resolve("config/hot-now.config.json"),
      env: {
        ...baseEnv,
        HOT_NOW_DATABASE_FILE: "/srv/hot-now/shared/data/hot-now.sqlite",
        HOT_NOW_REPORT_DATA_DIR: "/srv/hot-now/shared/data/reports",
        AI_TIMELINE_FEED_URL: "https://example.com/ai-timeline-feed.md",
        AI_TIMELINE_FEED_FILE: "/srv/hot-now/shared/data/feeds/ai-timeline-feed.md",
        AI_TIMELINE_FEED_MANIFEST_FILE: "/srv/hot-now/shared/data/feeds/ai-timeline-feed-manifest.json",
        AI_TIMELINE_FEED_MAX_FALLBACK_VERSIONS: "7",
        FEISHU_ALERT_WEBHOOK_URL: "https://open.feishu.cn/open-apis/bot/v2/hook/test"
      }
    });

    expect(config.database.file).toBe("/srv/hot-now/shared/data/hot-now.sqlite");
    expect(config.report.dataDir).toBe("/srv/hot-now/shared/data/reports");
    expect(config.aiTimelineFeed).toEqual({
      url: "https://example.com/ai-timeline-feed.md",
      file: "/srv/hot-now/shared/data/feeds/ai-timeline-feed.md",
      manifestFile: "/srv/hot-now/shared/data/feeds/ai-timeline-feed-manifest.json",
      maxFallbackVersions: 7
    });
    expect(config.aiTimelineAlerts.feishuWebhookUrl).toBe("https://open.feishu.cn/open-apis/bot/v2/hook/test");
  });

  it("ignores blank HOT_NOW_* overrides and falls back to config paths", async () => {
    const config = await loadRuntimeConfig({
      configPath: path.resolve("config/hot-now.config.json"),
      env: {
        ...baseEnv,
        HOT_NOW_DATABASE_FILE: "   ",
        HOT_NOW_REPORT_DATA_DIR: ""
      }
    });

    expect(config.database.file).toBe(path.resolve("data/hot-now.sqlite"));
    expect(config.report.dataDir).toBe(path.resolve("data/reports"));
  });

  it("throws when AUTH env values are missing", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3030 },
        collectionSchedule: { enabled: true, intervalMinutes: 10 },
        mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        report: { topN: 10, dataDir: "./data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(
      loadRuntimeConfig({
        configPath,
        env: {
          SMTP_HOST: baseEnv.SMTP_HOST,
          SMTP_PORT: baseEnv.SMTP_PORT,
          SMTP_SECURE: baseEnv.SMTP_SECURE,
          SMTP_USER: baseEnv.SMTP_USER,
          SMTP_PASS: baseEnv.SMTP_PASS,
          MAIL_TO: baseEnv.MAIL_TO,
          BASE_URL: baseEnv.BASE_URL
        }
      })
    ).rejects.toThrow("Missing required env: AUTH_USERNAME");
  });

  it("throws when AUTH_PASSWORD is missing", async () => {
    await expect(
      loadRuntimeConfig({
        configPath: path.resolve("config/hot-now.config.json"),
        env: { ...baseEnv, AUTH_PASSWORD: undefined }
      })
    ).rejects.toThrow("Missing required env: AUTH_PASSWORD");
  });

  it("throws when SESSION_SECRET is missing", async () => {
    await expect(
      loadRuntimeConfig({
        configPath: path.resolve("config/hot-now.config.json"),
        env: { ...baseEnv, SESSION_SECRET: undefined }
      })
    ).rejects.toThrow("Missing required env: SESSION_SECRET");
  });

  it("loads config file values plus database and auth settings", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3030 },
        collectionSchedule: { enabled: true, intervalMinutes: 10 },
        mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        report: { topN: 10, dataDir: path.join(tempDir, "reports"), allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    const config = await loadRuntimeConfig({
      configPath,
      env: {
        ...baseEnv
      }
    });

    expect(config.report.topN).toBe(10);
    expect(config.smtp.user).toBe("sender@qq.com");
    expect(config.report.dataDir).toContain("reports");
    expect(config.database.file).toBe(path.resolve(tempDir, "data/hot-now.sqlite"));
    expect(config.collectionSchedule).toEqual({
      enabled: true,
      intervalMinutes: 10
    });
    expect(config.mailSchedule).toEqual({
      enabled: true,
      dailyTime: "10:00",
      timezone: "Asia/Shanghai"
    });
    expect(config.manualActions).toEqual({
      collectEnabled: true,
      sendLatestEmailEnabled: true
    });
    expect(config.aiTimelineAlerts).toEqual({
      enabled: false,
      intervalMinutes: 5,
      channels: { feishu: false, email: false },
      feishuWebhookUrl: null
    });
    expect(config.auth).toEqual({
      username: "admin",
      password: "super-secret",
      sessionSecret: "session-secret-value",
      sessionTtlSeconds: 60 * 60 * 24 * 7
    });
  });

  it("allows AUTH_SESSION_TTL_SECONDS to override the fixed login session ttl", async () => {
    const config = await loadRuntimeConfig({
      configPath: path.resolve("config/hot-now.config.json"),
      env: { ...baseEnv, AUTH_SESSION_TTL_SECONDS: String(60 * 60 * 24 * 3) }
    });

    expect(config.auth.sessionTtlSeconds).toBe(60 * 60 * 24 * 3);
  });

  it("loads optional llm master key when provided", async () => {
    const config = await loadRuntimeConfig({
      configPath: path.resolve("config/hot-now.config.json"),
      env: { ...baseEnv, LLM_SETTINGS_MASTER_KEY: "master-key-123" }
    });

    expect(config.llm).toEqual({ settingsMasterKey: "master-key-123" });
  });

  it("falls back to SESSION_SECRET when llm master key env is missing", async () => {
    const config = await loadRuntimeConfig({
      configPath: path.resolve("config/hot-now.config.json"),
      env: baseEnv
    });

    expect(config.llm).toEqual({ settingsMasterKey: "session-secret-value" });
  });

  it("loads optional wechat resolver env values when provided", async () => {
    const config = await loadRuntimeConfig({
      configPath: path.resolve("config/hot-now.config.json"),
      env: {
        ...baseEnv,
        WECHAT_RESOLVER_BASE_URL: "https://resolver.example.test",
        WECHAT_RESOLVER_TOKEN: "resolver-secret"
      }
    });

    expect(config.wechatResolver).toEqual({
      baseUrl: "https://resolver.example.test",
      token: "resolver-secret"
    });
  });

  it("keeps wechat resolver config null when env values are missing", async () => {
    const config = await loadRuntimeConfig({
      configPath: path.resolve("config/hot-now.config.json"),
      env: baseEnv
    });

    expect(config.wechatResolver).toBeNull();
  });

  it("throws when a required SMTP env value is missing", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3030 },
        collectionSchedule: { enabled: true, intervalMinutes: 10 },
        mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        report: { topN: 10, dataDir: "./data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(
      loadRuntimeConfig({
        configPath,
        env: {
          ...baseEnv,
          SMTP_PASS: undefined
        }
      })
    ).rejects.toThrow("Missing required env: SMTP_PASS");
  });

  it("throws when SMTP_PORT is not numeric", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3030 },
        collectionSchedule: { enabled: true, intervalMinutes: 10 },
        mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        report: { topN: 10, dataDir: "./data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(
      loadRuntimeConfig({
        configPath,
        env: {
          ...baseEnv,
          SMTP_PORT: "not-a-number"
        }
      })
    ).rejects.toThrow("Invalid SMTP_PORT: not-a-number");
  });

  it("throws when SMTP_SECURE is not a strict boolean string", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3030 },
        collectionSchedule: { enabled: true, intervalMinutes: 10 },
        mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        report: { topN: 10, dataDir: "./data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(
      loadRuntimeConfig({
        configPath,
        env: {
          ...baseEnv,
          SMTP_SECURE: "yes"
        }
      })
    ).rejects.toThrow("Invalid SMTP_SECURE: yes");
  });

  it("throws when config JSON is missing required fields", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3030 },
        collectionSchedule: { enabled: true, intervalMinutes: 10 },
        mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        report: { topN: 10, allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(loadRuntimeConfig({ configPath, env: baseEnv })).rejects.toThrow(
      "Missing required config field: report.dataDir"
    );
  });

  it("throws when server.port is outside the runnable range", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 70000 },
        collectionSchedule: { enabled: true, intervalMinutes: 10 },
        mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        report: { topN: 10, dataDir: "../data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(loadRuntimeConfig({ configPath, env: baseEnv })).rejects.toThrow(
      "Invalid server.port: 70000"
    );
  });

  it("throws when report.topN is not a positive integer", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3030 },
        collectionSchedule: { enabled: true, intervalMinutes: 10 },
        mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        report: { topN: 0, dataDir: "../data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(loadRuntimeConfig({ configPath, env: baseEnv })).rejects.toThrow(
      "Invalid report.topN: 0"
    );
  });

  it("throws when collectionSchedule.intervalMinutes is 60", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3030 },
        collectionSchedule: { enabled: true, intervalMinutes: 60 },
        mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        report: { topN: 10, dataDir: "../data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(loadRuntimeConfig({ configPath, env: baseEnv })).rejects.toThrow(
      "Invalid collectionSchedule.intervalMinutes: 60"
    );
  });

  it("throws when collectionSchedule.intervalMinutes is 7", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3030 },
        collectionSchedule: { enabled: true, intervalMinutes: 7 },
        mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        report: { topN: 10, dataDir: "../data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(loadRuntimeConfig({ configPath, env: baseEnv })).rejects.toThrow(
      "Invalid collectionSchedule.intervalMinutes: 7"
    );
  });

  it("throws when collectionSchedule.intervalMinutes is 59", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3030 },
        collectionSchedule: { enabled: true, intervalMinutes: 59 },
        mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        report: { topN: 10, dataDir: "../data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(loadRuntimeConfig({ configPath, env: baseEnv })).rejects.toThrow(
      "Invalid collectionSchedule.intervalMinutes: 59"
    );
  });

  it("throws when mailSchedule.dailyTime is invalid", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3030 },
        collectionSchedule: { enabled: true, intervalMinutes: 10 },
        mailSchedule: { enabled: true, dailyTime: "25:61", timezone: "Asia/Shanghai" },
        manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
        report: { topN: 10, dataDir: "../data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(loadRuntimeConfig({ configPath, env: baseEnv })).rejects.toThrow(
      "Invalid mailSchedule.dailyTime: 25:61"
    );
  });
});

describe("listReportDates", () => {
  it("returns an empty array when the root directory does not exist", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-reports-"));
    const missingDir = path.join(tempDir, "missing");

    await expect(listReportDates(missingDir)).resolves.toEqual([]);
  });

  it("throws when the root path exists but is not a directory", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-reports-"));
    const filePath = path.join(tempDir, "report-file");

    await writeFile(filePath, "not a directory");

    await expect(listReportDates(filePath)).rejects.toThrow();
  });
});

describe("reportStore path safety", () => {
  it("rejects reportDate traversal when writing text files", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-store-"));

    await expect(writeTextFile(rootDir, "../escape", "summary.txt", "hello")).rejects.toThrow();
  });

  it("rejects fileName traversal when writing json files", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-store-"));

    await expect(writeJsonFile(rootDir, "2026-03-27", "../escape.json", { ok: true })).rejects.toThrow();
  });

  it("rejects fileName traversal when reading text files", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-store-"));
    const escapedFile = path.resolve(rootDir, "../escape.txt");

    await writeFile(escapedFile, "hello");

    await expect(readTextFile(rootDir, "2026-03-27", "../escape.txt")).rejects.toThrow();
  });
});
