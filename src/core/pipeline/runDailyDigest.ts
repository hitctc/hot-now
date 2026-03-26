import { fetchAndExtractArticle } from "../fetch/extractArticle.js";
import { sendDailyEmail } from "../mail/sendDailyEmail.js";
import { buildDailyReport, type DailyReport, type DailyReportTrigger } from "../report/buildDailyReport.js";
import { renderReportHtml } from "../report/renderReportHtml.js";
import { loadLatestIssue } from "../source/loadLatestIssue.js";
import { writeJsonFile, writeTextFile } from "../storage/reportStore.js";
import { clusterTopics, type RankedInput } from "../topics/clusterTopics.js";
import type { ArticleResult } from "../fetch/extractArticle.js";
import type { DailyIssue } from "../source/parseJuyaIssue.js";
import type { RuntimeConfig } from "../types/appConfig.js";

export type RunDailyDigestDeps = {
  loadLatestIssue?: (config: RuntimeConfig) => Promise<DailyIssue>;
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
    loadLatestIssue: deps.loadLatestIssue ?? defaultDeps.loadLatestIssue,
    fetchArticle: deps.fetchArticle ?? defaultDeps.fetchArticle,
    sendDailyEmail: deps.sendDailyEmail ?? defaultDeps.sendDailyEmail
  };

  const issue = await runtimeDeps.loadLatestIssue(config);
  const enrichedItems = await Promise.all(issue.items.map((item) => enrichItem(item, runtimeDeps.fetchArticle)));
  const topics = clusterTopics(enrichedItems);
  const report = buildDailyReport({ issue, trigger, topics, topN: config.report.topN });

  const mailStatus = await sendReportEmail(config, report, runtimeDeps.sendDailyEmail);
  report.meta.mailStatus = mailStatus;

  const html = renderReportHtml(report);

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

  return { report, mailStatus };
}

// Each source item gets a fetched article result so topic clustering can keep degraded entries in the run.
async function enrichItem(item: DailyIssue["items"][number], fetchArticle: (url: string) => Promise<ArticleResult>): Promise<RankedInput> {
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
