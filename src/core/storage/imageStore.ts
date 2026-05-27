import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const CONTENT_TYPE_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

export type StoreImageResult = {
  /** 存储后的相对路径：{date}/{uuid}.{ext} */
  relativePath: string;
  /** 通过 API 访问的 URL 路径：/api/creative/images/{date}/{uuid}.{ext} */
  urlPath: string;
};

/**
 * 从远程 URL 下载图片并保存到本地存储目录。
 * 路径格式：{imageDir}/{yyyy-MM-dd}/{uuid}.{ext}
 */
export async function downloadAndStoreImage(
  imageDir: string,
  imageUrl: string
): Promise<StoreImageResult> {
  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(60_000),
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`image too large: ${buffer.length} bytes (max ${MAX_IMAGE_SIZE})`);
  }

  // 从 URL 或 Content-Type 推断扩展名
  const ext = resolveExtension(imageUrl, response.headers.get("content-type"));
  if (!ext) {
    throw new Error("cannot determine image format from URL or content-type");
  }

  const dateDir = formatDateDir(new Date());
  const fileName = `${randomUUID()}${ext}`;
  const dayDir = resolveWithinRoot(imageDir, dateDir);
  await mkdir(dayDir, { recursive: true });

  const filePath = path.join(dayDir, fileName);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, buffer);

  return {
    relativePath: `${dateDir}/${fileName}`,
    urlPath: `/api/creative/images/${dateDir}/${fileName}`
  };
}

/** 读取已存储的图片文件，返回 buffer 和 content-type */
export async function readStoredImage(
  imageDir: string,
  date: string,
  fileName: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return null;
  }

  const filePath = resolveWithinRoot(resolveWithinRoot(imageDir, date), fileName);

  try {
    const buffer = await readFile(filePath);
    return { buffer, contentType: CONTENT_TYPE_MAP[ext] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

function resolveExtension(url: string, contentType: string | null): string | null {
  // 优先从 URL 路径推断
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      return ext === ".jpeg" ? ".jpg" : ext;
    }
  } catch {
    // URL 解析失败，回退到 content-type
  }

  // 从 Content-Type 推断
  if (contentType) {
    const normalized = contentType.split(";")[0].trim().toLowerCase();
    const ctMap: Record<string, string> = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp"
    };
    return ctMap[normalized] ?? null;
  }

  return null;
}

function formatDateDir(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveWithinRoot(rootDir: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(rootDir);
  const targetPath = path.resolve(resolvedRoot, ...segments);
  const boundary = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;

  if (targetPath !== resolvedRoot && !targetPath.startsWith(boundary)) {
    throw new Error(`Path escapes root dir: ${targetPath}`);
  }

  return targetPath;
}
