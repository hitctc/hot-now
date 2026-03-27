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
  BASE_URL: "http://127.0.0.1:3010",
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
  });

  it("loads config file values plus database and auth settings", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3010 },
        schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
        report: { topN: 10, dataDir: path.join(tempDir, "reports"), allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        manualRun: { enabled: true },
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
    expect(config.auth).toEqual({
      username: "admin",
      password: "super-secret",
      sessionSecret: "session-secret-value"
    });
  });

  it("throws when a required runtime env value is missing", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3010 },
        schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
        report: { topN: 10, dataDir: "./data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        manualRun: { enabled: true },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(
      loadRuntimeConfig({
        configPath,
        env: {
          ...baseEnv,
          SESSION_SECRET: undefined
        }
      })
    ).rejects.toThrow("Missing required env: SESSION_SECRET");
  });

  it("throws when SMTP_PORT is not numeric", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3010 },
        schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
        report: { topN: 10, dataDir: "./data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        manualRun: { enabled: true },
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
        server: { port: 3010 },
        schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
        report: { topN: 10, dataDir: "./data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        manualRun: { enabled: true },
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
        server: { port: 3010 },
        schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
        report: { topN: 10, allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        manualRun: { enabled: true },
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
        schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
        report: { topN: 10, dataDir: "../data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        manualRun: { enabled: true },
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
        server: { port: 3010 },
        schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
        report: { topN: 0, dataDir: "../data/reports", allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        manualRun: { enabled: true },
        database: { file: "./data/hot-now.sqlite" }
      })
    );

    await expect(loadRuntimeConfig({ configPath, env: baseEnv })).rejects.toThrow(
      "Invalid report.topN: 0"
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
