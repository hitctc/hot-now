import { sendDailyEmail as sendDailyEmailDefault } from "../mail/sendDailyEmail.js";
import type { DailyReport } from "../report/buildDailyReport.js";
import {
  findLatestDigestReportDate,
  listReportDates,
  readJsonFile
} from "../storage/reportStore.js";
import type { SqliteDatabase } from "../db/openDatabase.js";
import type { RuntimeConfig } from "../types/appConfig.js";

export type LatestReportEmailErrorReason = "not-found" | "report-unavailable" | "send-failed";

export type SendLatestReportEmailDeps = {
  db?: SqliteDatabase;
  sendDailyEmail?: (config: RuntimeConfig, report: DailyReport) => Promise<unknown>;
};

export type SendLatestReportEmailResult = {
  report: DailyReport;
  reportDate: string;
  mailStatus: "sent";
};

// The resend pipeline needs machine-readable failure reasons so the caller can distinguish
// between missing data, broken report artifacts, and SMTP delivery failures.
export class LatestReportEmailError extends Error {
  constructor(
    public readonly reason: LatestReportEmailErrorReason,
    message: string,
    public readonly reportDate?: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "LatestReportEmailError";
  }
}

// This pipeline only reuses an already-generated report, so it first resolves the latest report date,
// then reads report.json, and finally hands the report to the existing mail sender.
export async function sendLatestReportEmail(
  config: RuntimeConfig,
  deps: SendLatestReportEmailDeps = {}
): Promise<SendLatestReportEmailResult> {
  const reportDate = await resolveLatestReportDate(config, deps.db);

  if (!reportDate) {
    throw new LatestReportEmailError("not-found", "No digest report is available to send");
  }

  const report = await readLatestReport(config, reportDate);

  try {
    await (deps.sendDailyEmail ?? sendDailyEmailDefault)(config, report);
  } catch (error) {
    throw new LatestReportEmailError("send-failed", `Failed to send latest digest report for ${reportDate}`, reportDate, {
      cause: error
    });
  }

  report.meta.mailStatus = "sent";

  return {
    report,
    reportDate,
    mailStatus: "sent"
  };
}

// SQLite is the primary source for the latest known report date, but file-based reports remain the fallback
// until every task fully depends on the mirrored digest_reports table.
async function resolveLatestReportDate(config: RuntimeConfig, db?: SqliteDatabase) {
  const dbReportDate = db ? findLatestDigestReportDate(db) : null;

  if (dbReportDate) {
    return dbReportDate;
  }

  return (await listReportDates(config.report.dataDir))[0] ?? null;
}

// Report loading is isolated here so parse and filesystem failures get normalized into one stable error contract.
async function readLatestReport(config: RuntimeConfig, reportDate: string): Promise<DailyReport> {
  try {
    return await readJsonFile<DailyReport>(config.report.dataDir, reportDate, "report.json");
  } catch (error) {
    throw new LatestReportEmailError(
      "report-unavailable",
      `Failed to read latest digest report for ${reportDate}`,
      reportDate,
      { cause: error }
    );
  }
}
