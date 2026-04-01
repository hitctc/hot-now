import path from "node:path";
import { existsSync } from "node:fs";
import { loadRuntimeConfig } from "./core/config/loadRuntimeConfig.js";
import { verifyPassword } from "./core/auth/passwords.js";
import { buildContentPageModel } from "./core/content/buildContentPageModel.js";
import { listContentView as listContentCards } from "./core/content/listContentView.js";
import { createRuntimeDatabase } from "./core/db/createRuntimeDatabase.js";
import { runMigrations } from "./core/db/runMigrations.js";
import { seedInitialData } from "./core/db/seedInitialData.js";
import { checkpointWal } from "./core/db/sqliteHealth.js";
import {
  clearFeedbackPool,
  deleteFeedbackPoolEntry,
  listFeedbackPoolEntries,
  saveFeedbackPoolEntry
} from "./core/feedback/feedbackPoolRepository.js";
import { saveFavorite, saveReaction } from "./core/feedback/feedbackRepository.js";
import { fetchAndExtractArticle } from "./core/fetch/extractArticle.js";
import { createLlmProvider, type ResolveLlmProviderResult } from "./core/llm/createLlmProvider.js";
import {
  deleteProviderSettings as removeProviderSettings,
  getProviderSettingsSummary,
  readProviderSettings,
  saveProviderSettings as persistProviderSettings
} from "./core/llm/providerSettingsRepository.js";
import { sendDailyEmail } from "./core/mail/sendDailyEmail.js";
import { LatestReportEmailError, sendLatestReportEmail } from "./core/pipeline/sendLatestReportEmail.js";
import { runCollectionCycle } from "./core/pipeline/runCollectionCycle.js";
import { listRatingDimensions, saveRatings } from "./core/ratings/ratingRepository.js";
import type { DailyReportTrigger } from "./core/report/buildDailyReport.js";
import { createRunLock } from "./core/runtime/runLock.js";
import { installGracefulShutdown } from "./core/runtime/installGracefulShutdown.js";
import { startCollectionScheduler, startMailScheduler } from "./core/scheduler/startScheduler.js";
import { listContentSources } from "./core/source/listContentSources.js";
import { listSourceWorkbench } from "./core/source/listSourceWorkbench.js";
import { readSourcesOperationSummary } from "./core/source/readSourcesOperationSummary.js";
import { loadEnabledSourceIssues } from "./core/source/loadEnabledSourceIssues.js";
import { listNlEvaluationRuns } from "./core/strategy/nlEvaluationRepository.js";
import { listNlRuleSets, saveNlRuleSet, type NlRuleScope } from "./core/strategy/nlRuleRepository.js";
import { runNlEvaluationCycle, type RunNlEvaluationCycleInput } from "./core/strategy/runNlEvaluationCycle.js";
import {
  createStrategyDraft,
  deleteStrategyDraft,
  listStrategyDrafts,
  updateStrategyDraft
} from "./core/strategy/strategyDraftRepository.js";
import { listReportDates, readTextFile } from "./core/storage/reportStore.js";
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
type UpdateSourceDisplayModeResult = { ok: true } | { ok: false; reason: "not-found" };

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
const nlEvaluationLock = createRunLock();
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
const setSourceDisplayModeStatement = db.prepare(
  `
    UPDATE content_sources
    SET show_all_when_selected = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE kind = ?
  `
);

// Collection runs now stop after report generation so recurring fetches no longer send mail as a side effect.
async function runCollectionTask(triggerType: DailyReportTrigger) {
  return await runCollectionCycle(config, triggerType, {
    db,
    loadEnabledSourceIssues: async () => await loadEnabledSourceIssues(db),
    fetchArticle: fetchAndExtractArticle,
    runNlEvaluationCycle: async (input) => await runNlEvaluationTask(input)
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

function updateSourceDisplayMode(kind: string, showAllWhenSelected: boolean): UpdateSourceDisplayModeResult {
  // Display-mode toggles stay separate from enable toggles so operators can tune browse behavior
  // without changing whether a source participates in collection.
  const updateDisplayMode = db.transaction(
    (normalizedKind: string, nextShowAllWhenSelected: boolean): UpdateSourceDisplayModeResult => {
      const source = readSourceByKind.get(normalizedKind) as { id: number } | undefined;

      if (!source) {
        return { ok: false, reason: "not-found" };
      }

      setSourceDisplayModeStatement.run(nextShowAllWhenSelected ? 1 : 0, normalizedKind);
      return { ok: true };
    }
  );

  return updateDisplayMode(kind.trim(), showAllWhenSelected);
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

function getViewRulesWorkbenchData() {
  // The strategy workbench now exposes only gate-based NL settings plus provider, feedback, and drafts.
  const latestEvaluationRun = listNlEvaluationRuns(db)[0] ?? null;

  return {
    providerSettings: getProviderSettingsSummary(db),
    providerCapability: readProviderCapability(),
    nlRules: listNlRuleSets(db),
    feedbackPool: listFeedbackPoolEntries(db),
    strategyDrafts: listStrategyDrafts(db),
    latestEvaluationRun,
    isEvaluationRunning: nlEvaluationLock.isRunning() || latestEvaluationRun?.status === "running"
  };
}

function readProviderCapability() {
  // Natural language matching stays opt-in: missing master key or provider config should disable only this feature.
  const settingsMasterKey = config.llm?.settingsMasterKey ?? null;

  if (!settingsMasterKey) {
    return {
      hasMasterKey: false,
      featureAvailable: false,
      message: "未配置 LLM_SETTINGS_MASTER_KEY，无法保存厂商 API key。"
    };
  }

  const providerSummary = getProviderSettingsSummary(db);

  if (!providerSummary || !providerSummary.isEnabled) {
    return {
      hasMasterKey: true,
      featureAvailable: false,
      message: "已保存正式规则，但当前未配置可用厂商，暂不启用自然语言匹配。"
    };
  }

  const resolvedSettings = readProviderSettings(db, { settingsMasterKey });

  if (!resolvedSettings.ok) {
    return {
      hasMasterKey: true,
      featureAvailable: false,
      message:
        resolvedSettings.reason === "decrypt-failed"
          ? "当前厂商配置无法解密，请重新保存 API key。"
          : "已保存正式规则，但当前未配置可用厂商，暂不启用自然语言匹配。"
    };
  }

  if (!resolvedSettings.settings || !resolvedSettings.settings.isEnabled) {
    return {
      hasMasterKey: true,
      featureAvailable: false,
      message: "已保存正式规则，但当前未配置可用厂商，暂不启用自然语言匹配。"
    };
  }

  return {
    hasMasterKey: true,
    featureAvailable: true,
    message: `当前已启用 ${formatProviderLabel(resolvedSettings.settings.providerKind)}，保存正式规则后会自动重算内容库。`
  };
}

function isNlFeatureAvailable(): boolean {
  return readProviderCapability().featureAvailable;
}

async function resolveConfiguredLlmProvider(): Promise<ResolveLlmProviderResult> {
  // Provider resolution is centralized here so collection and settings-triggered recomputes reuse one rule set.
  const resolvedSettings = readProviderSettings(db, {
    settingsMasterKey: config.llm?.settingsMasterKey ?? null
  });

  if (!resolvedSettings.ok) {
    return resolvedSettings;
  }

  if (!resolvedSettings.settings || !resolvedSettings.settings.isEnabled) {
    return { ok: false, reason: "missing-provider-settings" };
  }

  return {
    ok: true,
    provider: createLlmProvider(resolvedSettings.settings)
  };
}

async function runNlEvaluationTask(input: RunNlEvaluationCycleInput) {
  // Recomputes share one local single-flight lock so full and incremental runs do not overwrite each other mid-flight.
  if (nlEvaluationLock.isRunning()) {
    const latestRun = listNlEvaluationRuns(db)[0];

    return {
      runId: latestRun?.id ?? 0,
      status: "skipped" as const,
      itemCount: input.contentItemIds?.length ?? 0,
      successCount: 0,
      failureCount: 0
    };
  }

  return await nlEvaluationLock.runExclusive(async () => {
    return await runNlEvaluationCycle(db, input, {
      resolveProvider: async () => await resolveConfiguredLlmProvider()
    });
  });
}

function createDraftFromFeedback(feedbackId: number) {
  // Draft creation keeps the original feedback row intact and turns it into an editable starting point for admins.
  const feedbackEntry = listFeedbackPoolEntries(db).find((entry) => entry.id === feedbackId);

  if (!feedbackEntry) {
    return { ok: false as const, reason: "not-found" as const };
  }

  const draftId = createStrategyDraft(db, {
    sourceFeedbackId: feedbackEntry.id,
    draftText: buildDraftTextFromFeedback(feedbackEntry),
    suggestedScope: "unspecified",
    draftEffectSummary: buildDraftEffectSummary(feedbackEntry),
    positiveKeywords: feedbackEntry.positiveKeywords,
    negativeKeywords: feedbackEntry.negativeKeywords
  });

  return { ok: true as const, draftId };
}

function buildDraftTextFromFeedback(entry: ReturnType<typeof listFeedbackPoolEntries>[number]): string {
  const lines = [
    `来源反馈：${entry.contentTitle}`,
    `参考链接：${entry.canonicalUrl}`
  ];

  if (entry.freeText?.trim()) {
    lines.push(entry.freeText.trim());
  }

  if (entry.suggestedEffect) {
    const strengthText = entry.strengthLevel ? `，强度 ${formatStrengthLabel(entry.strengthLevel)}` : "";
    lines.push(`建议动作：${formatEffectLabel(entry.suggestedEffect)}${strengthText}`);
  }

  if (entry.positiveKeywords.length > 0) {
    lines.push(`优先考虑关键词：${entry.positiveKeywords.join("、")}`);
  }

  if (entry.negativeKeywords.length > 0) {
    lines.push(`降低或屏蔽关键词：${entry.negativeKeywords.join("、")}`);
  }

  return lines.join("\n");
}

function buildDraftEffectSummary(entry: ReturnType<typeof listFeedbackPoolEntries>[number]): string | null {
  const parts = [];

  if (entry.suggestedEffect) {
    parts.push(formatEffectLabel(entry.suggestedEffect));
  }

  if (entry.strengthLevel) {
    parts.push(`强度 ${formatStrengthLabel(entry.strengthLevel)}`);
  }

  return parts.length > 0 ? parts.join(" / ") : null;
}

function formatProviderLabel(providerKind: string): string {
  if (providerKind === "deepseek") {
    return "DeepSeek";
  }

  if (providerKind === "minimax") {
    return "MiniMax";
  }

  if (providerKind === "kimi") {
    return "Kimi";
  }

  return providerKind;
}

function formatEffectLabel(effect: string): string {
  if (effect === "boost") {
    return "加分";
  }

  if (effect === "penalize") {
    return "减分";
  }

  if (effect === "block") {
    return "屏蔽";
  }

  return "无影响";
}

function formatStrengthLabel(strengthLevel: string): string {
  if (strengthLevel === "high") {
    return "高";
  }

  if (strengthLevel === "medium") {
    return "中";
  }

  return "低";
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
  getContentPageModel: async (pageKey, options) =>
    buildContentPageModel(db, pageKey, {
      ...options,
      includeNlEvaluations: isNlFeatureAvailable()
    }),
  listContentView: async (viewKey, options) =>
    listContentCards(db, viewKey, {
      ...options,
      includeNlEvaluations: isNlFeatureAvailable()
    }),
  listContentSources: async () => listContentSources(db),
  saveFavorite: async (contentItemId, isFavorited) => saveFavorite(db, contentItemId, isFavorited),
  saveReaction: async (contentItemId, reaction) => saveReaction(db, contentItemId, reaction),
  saveContentFeedback: async (contentItemId, input) => saveFeedbackPoolEntry(db, { contentItemId, ...input }),
  listRatingDimensions: async () => listRatingDimensions(db),
  saveRatings: async (contentItemId, scores) => saveRatings(db, contentItemId, scores),
  getViewRulesWorkbenchData: async () => getViewRulesWorkbenchData(),
  saveProviderSettings: async (input) =>
    persistProviderSettings(db, input, {
      settingsMasterKey: config.llm?.settingsMasterKey ?? null
    }),
  deleteProviderSettings: async () => removeProviderSettings(db),
  saveNlRules: async (rules: Record<NlRuleScope, { enabled: boolean; ruleText: string }>) => {
    for (const scope of Object.keys(rules) as NlRuleScope[]) {
      saveNlRuleSet(db, scope, rules[scope]);
    }

    return {
      ok: true as const,
      run: await runNlEvaluationTask({ mode: "full-recompute" })
    };
  },
  createDraftFromFeedback: async (feedbackId) => createDraftFromFeedback(feedbackId),
  deleteFeedbackEntry: async (feedbackId) => deleteFeedbackPoolEntry(db, feedbackId),
  clearAllFeedback: async () => clearFeedbackPool(db),
  saveStrategyDraft: async (input) => {
    const existingDraft = listStrategyDrafts(db).find((draft) => draft.id === input.id);

    if (!existingDraft) {
      return { ok: false as const, reason: "not-found" as const };
    }

    return updateStrategyDraft(db, {
      ...input,
      sourceFeedbackId: existingDraft.sourceFeedbackId
    });
  },
  deleteStrategyDraft: async (draftId) => deleteStrategyDraft(db, draftId),
  listSources: async (options) => listSourceWorkbench(db, options),
  getSourcesOperationSummary: async () => readSourcesOperationSummary(db),
  toggleSource: async (kind, enable) => toggleSource(kind, enable),
  updateSourceDisplayMode: async (kind, showAllWhenSelected) => updateSourceDisplayMode(kind, showAllWhenSelected),
  getCurrentUserProfile: async () => getCurrentUserProfile(),
  listReportSummaries: listStoredReportSummaries,
  latestReportDate: async () => (await listReportDates(config.report.dataDir))[0] ?? null,
  readReportHtml: async (date: string) => await readTextFile(config.report.dataDir, date, "report.html"),
  triggerManualCollect,
  triggerManualSendLatestEmail,
  triggerManualRun: triggerManualCollect
});

const clientIndexPath = path.resolve(process.cwd(), "dist/client/index.html");

if (!existsSync(clientIndexPath)) {
  app.log.warn(
    { clientIndexPath },
    "未找到客户端入口文件，/settings/* 将回退到最小 HTML 兜底，请先执行 npm run build:client"
  );
}

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
    // A running collection, mail, or NL recompute task should finish before we checkpoint and close SQLite.
    while (lock.isRunning() || nlEvaluationLock.isRunning()) {
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
