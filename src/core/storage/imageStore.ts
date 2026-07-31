import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const CONTENT_TYPE_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};
const THUMBNAIL_MAX_EDGE = 96;
const THUMBNAIL_WEBP_QUALITY = 72;
const thumbnailRequests = new Map<string, Promise<Buffer | null>>();

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
  const ext = resolveExtension(imageUrl, response.headers.get("content-type"));
  return storeImageBuffer(imageDir, buffer, ext);
}

/**
 * 从 buffer 直接存储图片到本地目录。
 * 用于 Hermes 下载图片后直接上传文件数据，跳过 hot-now 出境下载。
 */
export async function storeImageBuffer(
  imageDir: string,
  buffer: Buffer,
  ext: string | null
): Promise<StoreImageResult> {
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`image too large: ${buffer.length} bytes (max ${MAX_IMAGE_SIZE})`);
  }
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error("cannot determine image format");
  }

  const dateDir = formatDateDir(new Date());
  const fileName = `${randomUUID()}${ext}`;
  const dayDir = resolveWithinRoot(imageDir, dateDir);
  await mkdir(dayDir, { recursive: true });

  const filePath = path.join(dayDir, fileName);
  await writeFile(filePath, buffer);
  // 缩略图失败不能影响原图上传；列表会显示占位，详情仍可继续使用原图。
  await createStoredImageThumbnail(imageDir, dateDir, fileName, buffer).catch(() => null);

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

/** 返回与原图同目录的稳定缩略图文件名。 */
export function getStoredImageThumbnailFileName(fileName: string): string {
  return `${path.basename(fileName, path.extname(fileName))}.thumb.webp`;
}

/**
 * 读取缩略图；历史图片没有缓存时只生成一次并原子落盘。
 * 生成失败返回 null，调用方不得回退传输大尺寸原图。
 */
export async function readStoredImageThumbnail(
  imageDir: string,
  date: string,
  fileName: string
): Promise<{ buffer: Buffer; contentType: "image/webp" } | null> {
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext) || fileName.endsWith(".thumb.webp")) {
    return null;
  }

  const dayDir = resolveWithinRoot(imageDir, date);
  const thumbnailPath = resolveWithinRoot(dayDir, getStoredImageThumbnailFileName(fileName));
  try {
    return { buffer: await readFile(thumbnailPath), contentType: "image/webp" };
  } catch {
    // 历史文件没有缩略图时在首次访问生成，后续请求直接命中上面的磁盘缓存。
  }

  const originalPath = resolveWithinRoot(dayDir, fileName);
  let request = thumbnailRequests.get(thumbnailPath);
  if (!request) {
    request = readFile(originalPath)
      .then((buffer) => createStoredImageThumbnail(imageDir, date, fileName, buffer))
      .catch(() => null)
      .finally(() => thumbnailRequests.delete(thumbnailPath));
    thumbnailRequests.set(thumbnailPath, request);
  }

  const buffer = await request;
  return buffer ? { buffer, contentType: "image/webp" } : null;
}

/** 将原图转换为小尺寸 WebP，并通过临时文件避免并发读取半成品。 */
async function createStoredImageThumbnail(
  imageDir: string,
  date: string,
  fileName: string,
  sourceBuffer: Buffer
): Promise<Buffer> {
  const dayDir = resolveWithinRoot(imageDir, date);
  const thumbnailPath = resolveWithinRoot(dayDir, getStoredImageThumbnailFileName(fileName));
  const thumbnailBuffer = await sharp(sourceBuffer)
    .rotate()
    .resize({
      width: THUMBNAIL_MAX_EDGE,
      height: THUMBNAIL_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: THUMBNAIL_WEBP_QUALITY, effort: 4 })
    .toBuffer();
  const temporaryPath = `${thumbnailPath}.${randomUUID()}.tmp`;

  await writeFile(temporaryPath, thumbnailBuffer);
  try {
    await rename(temporaryPath, thumbnailPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return thumbnailBuffer;
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
