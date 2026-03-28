import { loadRuntimeConfig } from "./core/config/loadRuntimeConfig.js";
import { openDatabase } from "./core/db/openDatabase.js";
import { runMigrations } from "./core/db/runMigrations.js";
import { seedInitialData } from "./core/db/seedInitialData.js";
import { fetchAndExtractArticle } from "./core/fetch/extractArticle.js";
import { sendDailyEmail } from "./core/mail/sendDailyEmail.js";
import { runDailyDigest } from "./core/pipeline/runDailyDigest.js";
import type { DailyReportTrigger } from "./core/report/buildDailyReport.js";
import { createRunLock } from "./core/runtime/runLock.js";
import { startScheduler } from "./core/scheduler/startScheduler.js";
import { loadActiveSourceIssue } from "./core/source/loadActiveSourceIssue.js";
import { listReportDates, readTextFile } from "./core/storage/reportStore.js";
import { createServer } from "./server/createServer.js";

type ReportSummary = {
  date: string;
  topicCount: number;
  degraded: boolean;
  mailStatus: string;
};

const config = await loadRuntimeConfig();
const db = openDatabase(config.database.file);
runMigrations(db);
seedInitialData(db, {
  username: config.auth.username,
  password: config.auth.password,
  juyaRssUrl: config.source.rssUrl
});
const lock = createRunLock();

// This runs the full digest under a single-process lock so manual and scheduled runs never overlap.
async function triggerDigest(triggerType: DailyReportTrigger) {
  return await lock.runExclusive(async () => {
    return await runDailyDigest(config, triggerType, {
      db,
      loadLatestIssue: async () => await loadActiveSourceIssue(db),
      fetchArticle: fetchAndExtractArticle,
      sendDailyEmail
    });
  });
}

// History entries are rebuilt from stored run metadata so the server can boot without a database.
async function listStoredReportSummaries(): Promise<ReportSummary[]> {
  const dates = await listReportDates(config.report.dataDir);

  return await Promise.all(
    dates.map(async (date) => {
      try {
        const text = await readTextFile(config.report.dataDir, date, "run-meta.json");
        return parseReportSummary(date, text);
      } catch {
        return {
          date,
          topicCount: 0,
          degraded: true,
          mailStatus: "unknown"
        };
      }
    })
  );
}

// The summary reader is intentionally strict about field types and falls back only at the page level.
function parseReportSummary(date: string, fileText: string): ReportSummary {
  const parsed = JSON.parse(fileText) as Record<string, unknown>;

  return {
    date,
    topicCount: typeof parsed.topicCount === "number" && Number.isFinite(parsed.topicCount) ? parsed.topicCount : 0,
    degraded: typeof parsed.degraded === "boolean" ? parsed.degraded : true,
    mailStatus: typeof parsed.mailStatus === "string" ? parsed.mailStatus : "unknown"
  };
}

const app = createServer({
  config,
  isRunning: () => lock.isRunning(),
  listReportSummaries: listStoredReportSummaries,
  latestReportDate: async () => (await listReportDates(config.report.dataDir))[0] ?? null,
  readReportHtml: async (date: string) => await readTextFile(config.report.dataDir, date, "report.html"),
  triggerManualRun: config.manualRun.enabled
    ? async () => {
        await triggerDigest("manual");
        return { accepted: true };
      }
    : undefined
});

startScheduler(config, async () => {
  try {
    await triggerDigest("scheduled");
  } catch (error) {
    app.log.error(error);
  }
});

await app.listen({ host: "127.0.0.1", port: config.server.port });
