import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function reportDayDir(rootDir: string, reportDate: string) {
  return path.join(rootDir, reportDate);
}

export async function writeJsonFile(rootDir: string, reportDate: string, fileName: string, data: unknown) {
  const dayDir = reportDayDir(rootDir, reportDate);
  await mkdir(dayDir, { recursive: true });
  await writeFile(path.join(dayDir, fileName), JSON.stringify(data, null, 2));
}

export async function writeTextFile(rootDir: string, reportDate: string, fileName: string, content: string) {
  const dayDir = reportDayDir(rootDir, reportDate);
  await mkdir(dayDir, { recursive: true });
  await writeFile(path.join(dayDir, fileName), content, "utf8");
}

export async function readTextFile(rootDir: string, reportDate: string, fileName: string) {
  return readFile(path.join(reportDayDir(rootDir, reportDate), fileName), "utf8");
}

export async function listReportDates(rootDir: string) {
  try {
    return (await readdir(rootDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}
