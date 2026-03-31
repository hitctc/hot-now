import path from "node:path";
import { loadRuntimeConfig } from "./core/config/loadRuntimeConfig.js";
import { verifyPassword } from "./core/auth/passwords.js";
import { listContentView as listContentCards } from "./core/content/listContentView.js";
import { createRuntimeDatabase } from "./core/db/createRuntimeDatabase.js";
import { runMigrations } from "./core/db/runMigrations.js";
import { seedInitialData } from "./core/db/seedInitialData.js";
import { checkpointWal } from "./core/db/sqliteHealth.js";
import { saveFavorite, saveReaction } from "./core/feedback/feedbackRepository.js";
import { fetchAndExtractArticle } from "./core/fetch/extractArticle.js";
import { sendDailyEmail } from "./core/mail/sendDailyEmail.js";
import { LatestReportEmailError, sendLatestReportEmail } from "./core/pipeline/sendLatestReportEmail.js";
import { runCollectionCycle } from "./core/pipeline/runCollectionCycle.js";
import { listRatingDimensions, saveRatings } from "./core/ratings/ratingRepository.js";
import type { DailyReportTrigger } from "./core/report/buildDailyReport.js";
import { createRunLock } from "./core/runtime/runLock.js";
import { installGracefulShutdown } from "./core/runtime/installGracefulShutdown.js";
import { startCollectionScheduler, startMailScheduler } from "./core/scheduler/startScheduler.js";
import { listSourceCards } from "./core/source/listSourceCards.js";
import { readSourcesOperationSummary } from "./core/source/readSourcesOperationSummary.js";
import { loadEnabledSourceIssues } from "./core/source/loadEnabledSourceIssues.js";
import { listReportDates, readTextFile } from "./core/storage/reportStore.js";
import { listViewRules, saveViewRuleConfig } from "./core/viewRules/viewRuleRepository.js";
import { createServer } from "./server/createServer.js";

type ReportSummary = {
  date: string;
  topicCount: number;
  degraded: boolean;
  mailStatus: string;
};

type AdminProfileRow = {
  username: string;
  password_hash: string;
  role: string | null;
  display_name: string | null;
};
type UserProfileRow = {
  username: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
};
type ToggleSourceResult = { ok: true } | { ok: false; reason: "not-found" };

const config = await loadRuntimeConfig();
const recoveryDir = path.join(path.dirname(config.database.file), "recovery-backups");
const db = createRuntimeDatabase({
  databaseFile: config.database.file,
  recoveryDir
});
runMigrations(db);
seedInitialData(db, {
  username: config.auth.username,
  password: config.auth.password,
  juyaRssUrl: config.source.rssUrl
});
const lock = createRunLock();
const readAdminProfile = db.prepare(
  `
    SELECT username, password_hash, role, display_name
    FROM user_profile
    WHERE id = 1
  `
);
const readCurrentUserProfile = db.prepare(
  `
    SELECT username, role, display_name, email
    FROM user_profile
    WHERE id = 1
  `
);
const readSourceByKind = db.prepare(
  `
    SELECT id
    FROM content_sources
    WHERE kind = ?
    LIMIT 1
  `
);
const setSourceEnabledStatement = db.prepare(
  `
    UPDATE content_sources
    SET is_enabled = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE kind = ?
  `
);

// Collection runs now stop after report generation so recurring fetches no longer send mail as a side effect.
async function runCollectionTask(triggerType: DailyReportTrigger) {
  return await runCollectionCycle(config, triggerType, {
    db,
    loadEnabledSourceIssues: async () => await loadEnabledSourceIssues(db),
    fetchArticle: fetchAndExtractArticle
  });
}

// Latest-email runs reuse the most recent report artifact and keep SMTP concerns out of the collection cadence.
async function runLatestEmailTask() {
  return await sendLatestReportEmail(config, {
    db,
    sendDailyEmail
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

// The login callback stays in main so database details do not leak into the HTTP layer.
async function verifyLogin(username: string, password: string) {
  const profile = readAdminProfile.get() as AdminProfileRow | undefined;

  if (!profile || profile.username !== username) {
    return null;
  }

  if (!verifyPassword(password, profile.password_hash)) {
    return null;
  }

  return {
    username: profile.username,
    displayName: profile.display_name?.trim() || profile.username,
    role: profile.role?.trim() || "admin"
  };
}

function toggleSource(kind: string, enable: boolean): ToggleSourceResult {
  // Source toggles update only the targeted row so operators can keep multiple feeds enabled at once.
  const toggle = db.transaction((normalizedKind: string, nextEnabled: boolean): ToggleSourceResult => {
    const source = readSourceByKind.get(normalizedKind) as { id: number } | undefined;

    if (!source) {
      return { ok: false, reason: "not-found" };
    }

    setSourceEnabledStatement.run(nextEnabled ? 1 : 0, normalizedKind);
    return { ok: true };
  });

  return toggle(kind.trim(), enable);
}

function getCurrentUserProfile() {
  // Unified profile page only needs one bootstrap account row from user_profile(id=1).
  const profile = readCurrentUserProfile.get() as UserProfileRow | undefined;

  if (!profile) {
    return null;
  }

  return {
    username: profile.username,
    displayName: profile.display_name?.trim() || profile.username,
    role: profile.role?.trim() || "admin",
    email: profile.email
  };
}

// Manual collection stays lock-guarded so button clicks share the same exclusion rules as scheduled jobs.
const triggerManualCollect = config.manualActions.collectEnabled
  ? async () => {
      await lock.runExclusive(async () => {
        await runCollectionTask("manual");
      });

      return { accepted: true as const, action: "collect" as const };
    }
  : undefined;

// Manual resend normalizes known pipeline failures into machine-readable reasons for the HTTP layer.
const triggerManualSendLatestEmail = config.manualActions.sendLatestEmailEnabled
  ? async () => {
      return await lock.runExclusive(async () => {
        try {
          await runLatestEmailTask();
          return { accepted: true as const, action: "send-latest-email" as const };
        } catch (error) {
          if (error instanceof LatestReportEmailError) {
            return { accepted: false as const, reason: error.reason };
          }

          throw error;
        }
      });
    }
  : undefined;

const app = createServer({
  config,
  auth: {
    requireLogin: true,
    sessionSecret: config.auth.sessionSecret,
    verifyLogin
  },
  isRunning: () => lock.isRunning(),
  listContentView: async (viewKey) => listContentCards(db, viewKey),
  saveFavorite: async (contentItemId, isFavorited) => saveFavorite(db, contentItemId, isFavorited),
  saveReaction: async (contentItemId, reaction) => saveReaction(db, contentItemId, reaction),
  listRatingDimensions: async () => listRatingDimensions(db),
  saveRatings: async (contentItemId, scores) => saveRatings(db, contentItemId, scores),
  listViewRules: async () => listViewRules(db),
  saveViewRuleConfig: async (ruleKey, config) => saveViewRuleConfig(db, ruleKey, config),
  listSources: async () => listSourceCards(db),
  getSourcesOperationSummary: async () => readSourcesOperationSummary(db),
  toggleSource: async (kind, enable) => toggleSource(kind, enable),
  getCurrentUserProfile: async () => getCurrentUserProfile(),
  listReportSummaries: listStoredReportSummaries,
  latestReportDate: async () => (await listReportDates(config.report.dataDir))[0] ?? null,
  readReportHtml: async (date: string) => await readTextFile(config.report.dataDir, date, "report.html"),
  triggerManualCollect,
  triggerManualSendLatestEmail,
  triggerManualRun: triggerManualCollect
});

const collectionScheduler = startCollectionScheduler(config, async () => {
  try {
    await lock.runExclusive(async () => {
      await runCollectionTask("scheduled");
    });
  } catch (error) {
    app.log.error(error);
  }
});

const mailScheduler = startMailScheduler(config, async () => {
  try {
    await lock.runExclusive(async () => {
      await runLatestEmailTask();
    });
  } catch (error) {
    app.log.error(error);
  }
});

await app.listen({ host: "127.0.0.1", port: resolveListenPort(process.env.PORT, config.server.port) });
installGracefulShutdown({
  process,
  exit: (code) => process.exit(code),
  logger: {
    info: (context, message) => app.log.info(context, message),
    error: (context, message) => app.log.error(context, message)
  },
  scheduledTasks: [collectionScheduler, mailScheduler],
  waitForIdle: async () => {
    // A running collection or mail task should finish before we checkpoint and close SQLite.
    while (lock.isRunning()) {
      await wait(100);
    }
  },
  closeServer: async () => {
    await app.close();
  },
  checkpointDatabase: () => {
    checkpointWal(db);
  },
  closeDatabase: () => {
    if (db.open) {
      db.close();
    }
  },
  signals: ["SIGINT", "SIGTERM", "SIGUSR2"]
});

function resolveListenPort(envPort: string | undefined, fallbackPort: number): number {
  // Tests can bind to an ephemeral port with PORT=0 while production keeps the configured fixed port.
  if (!envPort) {
    return fallbackPort;
  }

  const port = Number(envPort);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${envPort}`);
  }

  return port;
}

function wait(ms: number) {
  // Polling is enough here because shutdown happens rarely and only needs a small idle wait.
  return new Promise((resolve) => setTimeout(resolve, ms));
}
