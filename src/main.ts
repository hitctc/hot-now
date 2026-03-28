import { loadRuntimeConfig } from "./core/config/loadRuntimeConfig.js";
import { verifyPassword } from "./core/auth/passwords.js";
import { listContentView as listContentCards } from "./core/content/listContentView.js";
import { openDatabase } from "./core/db/openDatabase.js";
import { runMigrations } from "./core/db/runMigrations.js";
import { seedInitialData } from "./core/db/seedInitialData.js";
import { saveFavorite, saveReaction } from "./core/feedback/feedbackRepository.js";
import { fetchAndExtractArticle } from "./core/fetch/extractArticle.js";
import { sendDailyEmail } from "./core/mail/sendDailyEmail.js";
import { runDailyDigest } from "./core/pipeline/runDailyDigest.js";
import { listRatingDimensions, saveRatings } from "./core/ratings/ratingRepository.js";
import type { DailyReportTrigger } from "./core/report/buildDailyReport.js";
import { createRunLock } from "./core/runtime/runLock.js";
import { startScheduler } from "./core/scheduler/startScheduler.js";
import { listSourceCards } from "./core/source/listSourceCards.js";
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
type ActiveSourceUpdateResult = { ok: true } | { ok: false; reason: "not-found" };

const config = await loadRuntimeConfig();
const db = openDatabase(config.database.file);
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
const setSingleActiveSourceStatement = db.prepare(
  `
    UPDATE content_sources
    SET is_active = CASE WHEN kind = ? THEN 1 ELSE 0 END,
        updated_at = CURRENT_TIMESTAMP
  `
);

// This runs the full digest under a single-process lock so manual and scheduled runs never overlap.
async function triggerDigest(triggerType: DailyReportTrigger) {
  return await lock.runExclusive(async () => {
    return await runDailyDigest(config, triggerType, {
      db,
      loadEnabledSourceIssues: async () => await loadEnabledSourceIssues(db),
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

function setActiveSource(kind: string): ActiveSourceUpdateResult {
  // Activation runs in one transaction to guarantee there is never more than one active source.
  const activate = db.transaction((normalizedKind: string): ActiveSourceUpdateResult => {
    const source = readSourceByKind.get(normalizedKind) as { id: number } | undefined;

    if (!source) {
      return { ok: false, reason: "not-found" };
    }

    setSingleActiveSourceStatement.run(normalizedKind);
    return { ok: true };
  });

  return activate(kind.trim());
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
  setActiveSource: async (kind) => setActiveSource(kind),
  getCurrentUserProfile: async () => getCurrentUserProfile(),
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

await app.listen({ host: "127.0.0.1", port: resolveListenPort(process.env.PORT, config.server.port) });

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
