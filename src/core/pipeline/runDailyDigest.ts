import path from "node:path";
import { createCollectionRun, finishCollectionRun, resolveSourceByKind, upsertContentItems } from "../content/contentRepository.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import { fetchAndExtractArticle } from "../fetch/extractArticle.js";
import { sendDailyEmail } from "../mail/sendDailyEmail.js";
import { buildDailyReport, type DailyReport, type DailyReportIssue, type DailyReportTrigger } from "../report/buildDailyReport.js";
import { renderReportHtml } from "../report/renderReportHtml.js";
import { loadEnabledSourceIssues } from "../source/loadEnabledSourceIssues.js";
import type { LoadedSourceIssues } from "../source/loadEnabledSourceIssues.js";
import { reportDayDir, upsertDigestReport, writeJsonFile, writeTextFile } from "../storage/reportStore.js";
import { clusterTopics, type RankedInput } from "../topics/clusterTopics.js";
import type { ArticleResult } from "../fetch/extractArticle.js";
import type { LoadedIssue } from "../source/types.js";
import type { RuntimeConfig } from "../types/appConfig.js";

type EnrichedCollectedItem = LoadedIssue["items"][number] & {
  article: ArticleResult;
};

type EnrichedIssue = LoadedIssue & {
  items: EnrichedCollectedItem[];
};

export type RunDailyDigestDeps = {
  db?: SqliteDatabase;
  loadEnabledSourceIssues?: () => Promise<LoadedSourceIssues>;
  fetchArticle?: (url: string) => Promise<ArticleResult>;
  sendDailyEmail?: (config: RuntimeConfig, report: DailyReport) => Promise<unknown>;
};

const defaultDeps = {
  fetchArticle: fetchAndExtractArticle,
  sendDailyEmail
};

export type RunDailyDigestResult = {
  report: DailyReport;
  mailStatus: string;
};

// This orchestrates the full daily digest flow and keeps email failure from blocking the report files.
export async function runDailyDigest(
  config: RuntimeConfig,
  trigger: DailyReportTrigger,
  deps: RunDailyDigestDeps = {}
): Promise<RunDailyDigestResult> {
  const runtimeDeps = {
    db: deps.db,
    fetchArticle: deps.fetchArticle ?? defaultDeps.fetchArticle,
    sendDailyEmail: deps.sendDailyEmail ?? defaultDeps.sendDailyEmail
  };

  if (!runtimeDeps.db && !deps.loadEnabledSourceIssues) {
    throw new Error("runDailyDigest requires a database-backed source loader");
  }

  const loadEnabledSourceIssuesFn = deps.loadEnabledSourceIssues ?? (() => loadEnabledSourceIssues(runtimeDeps.db!));
  const issues = await loadEnabledSourceIssuesFn();
  const sourceFailures = issues.failures ?? [];
  const hasSourceFailures = sourceFailures.length > 0;
  const reportIssue = pickReportIssue(issues);
  const startedAt = new Date().toISOString();
  const collectionRunId = runtimeDeps.db
    ? runDbMirrorStep(() =>
        createCollectionRun(runtimeDeps.db!, {
          runDate: reportIssue.date,
          triggerKind: trigger,
          status: "running",
          startedAt,
          notes: JSON.stringify({
            sourceKinds: issues.map((issue) => issue.sourceKind),
            sourceCount: issues.length,
            sourceFailureCount: sourceFailures.length,
            failedSourceKinds: sourceFailures.map((failure) => failure.kind)
          })
        })
      )
    : undefined;

  try {
    const enrichedIssues = await Promise.all(issues.map((issue) => enrichIssue(issue, runtimeDeps.fetchArticle)));
    const enrichedItems = enrichedIssues.flatMap((issue) => issue.items);

    if (runtimeDeps.db) {
      runDbMirrorStep(() => {
        for (const issue of enrichedIssues) {
          persistCollectedItems(runtimeDeps.db!, issue, issue.items);
        }
      });
    }

    const topics = clusterTopics(enrichedItems);
    const report = buildDailyReport({
      issue: buildAggregateIssue(reportIssue, enrichedIssues, enrichedItems),
      trigger,
      topics,
      topN: config.report.topN
    });
    report.meta.degraded = report.meta.degraded || hasSourceFailures;
    report.meta.sourceFailureCount = sourceFailures.length;
    report.meta.failedSourceKinds = sourceFailures.map((failure) => failure.kind);
    const mailStatus = await sendReportEmail(config, report, runtimeDeps.sendDailyEmail);
    report.meta.mailStatus = mailStatus;

    const html = renderReportHtml(report);
    const dayDir = reportDayDir(config.report.dataDir, report.meta.date);

    await writeJsonFile(config.report.dataDir, report.meta.date, "report.json", report);
    await writeTextFile(config.report.dataDir, report.meta.date, "report.html", html);
    await writeJsonFile(config.report.dataDir, report.meta.date, "run-meta.json", {
      date: report.meta.date,
      trigger,
      generatedAt: report.meta.generatedAt,
      mailStatus,
      degraded: report.meta.degraded,
      topicCount: report.meta.topicCount,
      sourceFailureCount: sourceFailures.length,
      failedSourceKinds: sourceFailures.map((failure) => failure.kind)
    });

    if (runtimeDeps.db && collectionRunId != null) {
      runDbMirrorStep(() => {
        finishCollectionRun(runtimeDeps.db!, {
          id: collectionRunId,
          status: "completed",
          finishedAt: new Date().toISOString(),
          notes: JSON.stringify({
            sourceKinds: issues.map((issue) => issue.sourceKind),
            sourceCount: issues.length,
            sourceFailureCount: sourceFailures.length,
            failedSourceKinds: sourceFailures.map((failure) => failure.kind),
            itemCount: enrichedItems.length,
            degraded: report.meta.degraded,
            mailStatus
          })
        });
      });
      runDbMirrorStep(() => {
        upsertDigestReport(runtimeDeps.db!, {
          reportDate: report.meta.date,
          collectionRunId,
          reportJsonPath: path.join(dayDir, "report.json"),
          reportHtmlPath: path.join(dayDir, "report.html"),
          mailStatus
        });
      });
    }

    return { report, mailStatus };
  } catch (error) {
    if (runtimeDeps.db && collectionRunId != null) {
      runDbMirrorStep(() => {
        finishCollectionRun(runtimeDeps.db!, {
          id: collectionRunId,
          status: "failed",
          finishedAt: new Date().toISOString(),
          notes: JSON.stringify({
            sourceKinds: issues.map((issue) => issue.sourceKind),
            sourceCount: issues.length,
            sourceFailureCount: sourceFailures.length,
            failedSourceKinds: sourceFailures.map((failure) => failure.kind),
            error: error instanceof Error ? error.message : "unknown"
          })
        });
      });
    }

    throw error;
  }
}

// Each source item gets a fetched article result so topic clustering can keep degraded entries in the run.
async function enrichItem(
  item: LoadedIssue["items"][number],
  fetchArticle: (url: string) => Promise<ArticleResult>
): Promise<EnrichedCollectedItem> {
  return {
    ...item,
    article: await fetchArticle(item.sourceUrl)
  };
}

// Each enabled issue is enriched independently so one source can still contribute even if a
// sibling source has a degraded article fetch.
async function enrichIssue(
  issue: LoadedIssue,
  fetchArticle: (url: string) => Promise<ArticleResult>
): Promise<EnrichedIssue> {
  return {
    ...issue,
    items: await Promise.all(issue.items.map((item) => enrichItem(item, fetchArticle)))
  };
}

// Email failure should be recorded, not rethrown, so the report artifacts still land on disk.
async function sendReportEmail(
  config: RuntimeConfig,
  report: DailyReport,
  sendDailyEmailFn: (config: RuntimeConfig, report: DailyReport) => Promise<unknown>
) {
  try {
    await sendDailyEmailFn(config, report);
    return "sent";
  } catch (error) {
    return error instanceof Error ? `failed:${error.message}` : "failed:unknown";
  }
}

// Persisted content keeps the raw collected article text and source metadata together so later
// query work can read from SQLite without changing the existing report-generation flow.
function persistCollectedItems(db: SqliteDatabase, issue: LoadedIssue, items: EnrichedCollectedItem[]): void {
  const source = resolveSourceByKind(db, issue.sourceKind);

  if (!source) {
    throw new Error(`Missing content source row for kind: ${issue.sourceKind}`);
  }

  const fetchedAt = new Date().toISOString();
  upsertContentItems(db, {
    sourceId: source.id,
    items: items.map((item) => ({
      externalId: item.externalId,
      title: pickPersistedTitle(item.title, item.article),
      canonicalUrl: item.sourceUrl,
      summary: item.summary,
      bodyMarkdown: item.article.ok ? item.article.text : "",
      publishedAt: item.publishedAt,
      fetchedAt
    }))
  });
}

// Feed titles are the default because they are stable across sources, but a successful extracted
// article title can replace them when it clearly adds more specific page-level wording.
function pickPersistedTitle(feedTitle: string, article: ArticleResult): string {
  if (article.ok && article.title.trim().length > 0) {
    return article.title.trim();
  }

  return feedTitle;
}

// SQLite is only a mirror in this phase, so persistence failures must never take down the
// established file-report and mail behavior.
function runDbMirrorStep<T>(operation: () => T): T | undefined {
  try {
    return operation();
  } catch {
    return undefined;
  }
}

function pickReportIssue(issues: LoadedIssue[]): LoadedIssue {
  const sortedIssues = [...issues].sort(compareIssues);
  const selectedIssue = sortedIssues[0];

  if (!selectedIssue) {
    throw new Error("No enabled content sources are available");
  }

  return selectedIssue;
}

function buildAggregateIssue(
  issue: LoadedIssue,
  issues: readonly LoadedIssue[],
  items: readonly EnrichedCollectedItem[]
): DailyReportIssue {
  return {
    date: issue.date,
    issueUrl: issue.issueUrl,
    issueUrls: uniqueStrings(issues.map((entry) => entry.issueUrl)),
    sourceKinds: uniqueStrings(issues.map((entry) => entry.sourceKind)),
    items
  };
}

function compareIssues(left: LoadedIssue, right: LoadedIssue): number {
  const leftDate = toIssueDateMs(left.date);
  const rightDate = toIssueDateMs(right.date);

  if (rightDate !== leftDate) {
    return rightDate - leftDate;
  }

  if (right.sourcePriority !== left.sourcePriority) {
    return right.sourcePriority - left.sourcePriority;
  }

  return left.sourceKind.localeCompare(right.sourceKind);
}

function toIssueDateMs(value: string): number {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
