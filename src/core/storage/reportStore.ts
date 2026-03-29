import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SqliteDatabase } from "../db/openDatabase.js";

export function reportDayDir(rootDir: string, reportDate: string) {
  return resolveWithinRoot(rootDir, reportDate);
}

export async function writeJsonFile(rootDir: string, reportDate: string, fileName: string, data: unknown) {
  const dayDir = reportDayDir(rootDir, reportDate);
  await mkdir(dayDir, { recursive: true });
  await writeFile(resolveWithinRoot(dayDir, fileName), JSON.stringify(data, null, 2));
}

export async function writeTextFile(rootDir: string, reportDate: string, fileName: string, content: string) {
  const dayDir = reportDayDir(rootDir, reportDate);
  await mkdir(dayDir, { recursive: true });
  await writeFile(resolveWithinRoot(dayDir, fileName), content, "utf8");
}

// JSON report artifacts use the same safe path resolution as text files so callers can load typed payloads
// without re-implementing directory traversal checks in each pipeline.
export async function readJsonFile<T>(rootDir: string, reportDate: string, fileName: string): Promise<T> {
  return JSON.parse(await readTextFile(rootDir, reportDate, fileName)) as T;
}

export async function readTextFile(rootDir: string, reportDate: string, fileName: string) {
  return readFile(resolveWithinRoot(reportDayDir(rootDir, reportDate), fileName), "utf8");
}

export async function listReportDates(rootDir: string) {
  try {
    return (await readdir(rootDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export type UpsertDigestReportInput = {
  reportDate: string;
  collectionRunId?: number;
  reportJsonPath?: string;
  reportHtmlPath?: string;
  mailStatus: string;
};

// Mail resend and future admin actions only need the newest mirrored report date, so the query stays
// intentionally narrow and returns null when SQLite has no digest report rows yet.
export function findLatestDigestReportDate(db: SqliteDatabase): string | null {
  const row = db
    .prepare(
      `
        SELECT report_date
        FROM digest_reports
        ORDER BY report_date DESC
        LIMIT 1
      `
    )
    .get() as { report_date: string } | undefined;

  return row?.report_date ?? null;
}

// Digest reports stay mirrored in SQLite so future UI work can query metadata without replacing
// the existing file-based report pages in this phase.
export function upsertDigestReport(db: SqliteDatabase, input: UpsertDigestReportInput): void {
  db.prepare(
    `
      INSERT INTO digest_reports (
        report_date,
        collection_run_id,
        report_json_path,
        report_html_path,
        mail_status,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(report_date) DO UPDATE SET
        collection_run_id = excluded.collection_run_id,
        report_json_path = excluded.report_json_path,
        report_html_path = excluded.report_html_path,
        mail_status = excluded.mail_status,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(
    input.reportDate,
    input.collectionRunId ?? null,
    input.reportJsonPath ?? null,
    input.reportHtmlPath ?? null,
    input.mailStatus
  );
}

function resolveWithinRoot(rootDir: string, ...segments: string[]) {
  const resolvedRoot = path.resolve(rootDir);
  const targetPath = path.resolve(resolvedRoot, ...segments);
  const boundary = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;

  if (targetPath !== resolvedRoot && !targetPath.startsWith(boundary)) {
    throw new Error(`Path escapes root dir: ${targetPath}`);
  }

  return targetPath;
}
