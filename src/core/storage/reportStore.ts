import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

function resolveWithinRoot(rootDir: string, ...segments: string[]) {
  const resolvedRoot = path.resolve(rootDir);
  const targetPath = path.resolve(resolvedRoot, ...segments);
  const boundary = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;

  if (targetPath !== resolvedRoot && !targetPath.startsWith(boundary)) {
    throw new Error(`Path escapes root dir: ${targetPath}`);
  }

  return targetPath;
}
