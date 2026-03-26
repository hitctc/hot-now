import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "../../src/core/config/loadRuntimeConfig.js";

describe("loadRuntimeConfig", () => {
  it("loads config file values and SMTP env values", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
    const configPath = path.join(tempDir, "hot-now.config.json");

    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3010 },
        schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
        report: { topN: 10, dataDir: path.join(tempDir, "reports"), allowDegraded: true },
        source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
        manualRun: { enabled: true }
      })
    );

    const config = await loadRuntimeConfig({
      configPath,
      env: {
        SMTP_HOST: "smtp.qq.com",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_USER: "sender@qq.com",
        SMTP_PASS: "secret",
        MAIL_TO: "receiver@example.com",
        BASE_URL: "http://127.0.0.1:3010"
      }
    });

    expect(config.report.topN).toBe(10);
    expect(config.smtp.user).toBe("sender@qq.com");
    expect(config.report.dataDir).toContain("reports");
  });
});
