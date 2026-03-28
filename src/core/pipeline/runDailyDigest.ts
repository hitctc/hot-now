import path from "node:path";
import { createCollectionRun, finishCollectionRun, resolveSourceByKind, upsertContentItems } from "../content/contentRepository.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import { fetchAndExtractArticle } from "../fetch/extractArticle.js";
import { sendDailyEmail } from "../mail/sendDailyEmail.js";
import { buildDailyReport, type DailyReport, type DailyReportTrigger } from "../report/buildDailyReport.js";
import { renderReportHtml } from "../report/renderReportHtml.js";
import { loadLatestIssue } from "../source/loadLatestIssue.js";
import { reportDayDir, upsertDigestReport, writeJsonFile, writeTextFile } from "../storage/reportStore.js";
import { clusterTopics, type RankedInput } from "../topics/clusterTopics.js";
import type { ArticleResult } from "../fetch/extractArticle.js";
import type { LoadedIssue } from "../source/types.js";
import type { RuntimeConfig } from "../types/appConfig.js";

type EnrichedCollectedItem = LoadedIssue["items"][number] & {
  article: ArticleResult;
};

export type RunDailyDigestDeps = {
  db?: SqliteDatabase;
  loadLatestIssue?: (config: RuntimeConfig) => Promise<LoadedIssue>;
  fetchArticle?: (url: string) => Promise<ArticleResult>;
  sendDailyEmail?: (config: RuntimeConfig, report: DailyReport) => Promise<unknown>;
};

const defaultDeps = {
  loadLatestIssue,
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
    loadLatestIssue: deps.loadLatestIssue ?? defaultDeps.loadLatestIssue,
    fetchArticle: deps.fetchArticle ?? defaultDeps.fetchArticle,
    sendDailyEmail: deps.sendDailyEmail ?? defaultDeps.sendDailyEmail
  };

  const issue = await runtimeDeps.loadLatestIssue(config);
  const startedAt = new Date().toISOString();
  const collectionRunId = runtimeDeps.db
    ? createCollectionRun(runtimeDeps.db, {
        runDate: issue.date,
        triggerKind: trigger,
        status: "running",
        startedAt,
        notes: JSON.stringify({ sourceKind: issue.sourceKind, issueUrl: issue.issueUrl })
      })
    : undefined;

  try {
    const enrichedItems = await Promise.all(issue.items.map((item) => enrichItem(item, runtimeDeps.fetchArticle)));

    if (runtimeDeps.db) {
      persistCollectedItems(runtimeDeps.db, issue, enrichedItems);
    }

    const topics = clusterTopics(enrichedItems);
    const report = buildDailyReport({ issue, trigger, topics, topN: config.report.topN });
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
      topicCount: report.meta.topicCount
    });

    if (runtimeDeps.db && collectionRunId != null) {
      finishCollectionRun(runtimeDeps.db, {
        id: collectionRunId,
        status: "completed",
        finishedAt: new Date().toISOString(),
        notes: JSON.stringify({
          sourceKind: issue.sourceKind,
          itemCount: issue.items.length,
          degraded: report.meta.degraded,
          mailStatus
        })
      });
      upsertDigestReport(runtimeDeps.db, {
        reportDate: report.meta.date,
        collectionRunId,
        reportJsonPath: path.join(dayDir, "report.json"),
        reportHtmlPath: path.join(dayDir, "report.html"),
        mailStatus
      });
    }

    return { report, mailStatus };
  } catch (error) {
    if (runtimeDeps.db && collectionRunId != null) {
      finishCollectionRun(runtimeDeps.db, {
        id: collectionRunId,
        status: "failed",
        finishedAt: new Date().toISOString(),
        notes: JSON.stringify({
          sourceKind: issue.sourceKind,
          error: error instanceof Error ? error.message : "unknown"
        })
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
