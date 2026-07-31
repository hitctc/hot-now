import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

import {
  getStoredImageThumbnailFileName,
  readStoredImage,
  readStoredImageThumbnail,
  storeImageBuffer
} from "../../src/core/storage/imageStore.js";

const temporaryDirectories: string[] = [];

/** 为单个测试创建隔离的图片存储目录。 */
async function createImageDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hot-now-images-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("imageStore thumbnails", () => {
  it("stores the original and a small 96px WebP thumbnail", async () => {
    const imageDir = await createImageDirectory();
    const originalBuffer = await sharp({
      create: {
        width: 1920,
        height: 816,
        channels: 3,
        background: { r: 124, g: 58, b: 237 }
      }
    }).png().toBuffer();

    const stored = await storeImageBuffer(imageDir, originalBuffer, ".png");
    const [date, fileName] = stored.relativePath.split("/");
    const original = await readStoredImage(imageDir, date, fileName);
    const thumbnail = await readStoredImageThumbnail(imageDir, date, fileName);
    const metadata = await sharp(thumbnail?.buffer).metadata();

    expect(original?.buffer).toEqual(originalBuffer);
    expect(thumbnail?.contentType).toBe("image/webp");
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(96);
    expect(metadata.height).toBeLessThanOrEqual(96);
    expect(thumbnail?.buffer.byteLength).toBeLessThan(50 * 1024);
  });

  it("generates a historical thumbnail once and then reuses the disk cache", async () => {
    const imageDir = await createImageDirectory();
    const date = "2026-07-31";
    const fileName = "historical-cover.jpg";
    const dayDir = path.join(imageDir, date);
    await mkdir(dayDir, { recursive: true });
    await writeFile(
      path.join(dayDir, fileName),
      await sharp({
        create: {
          width: 1200,
          height: 630,
          channels: 3,
          background: { r: 12, g: 34, b: 56 }
        }
      }).jpeg().toBuffer()
    );

    const first = await readStoredImageThumbnail(imageDir, date, fileName);
    const thumbnailPath = path.join(dayDir, getStoredImageThumbnailFileName(fileName));
    const firstStat = await stat(thumbnailPath);
    const second = await readStoredImageThumbnail(imageDir, date, fileName);
    const secondStat = await stat(thumbnailPath);

    expect(first?.buffer).toEqual(second?.buffer);
    expect(await readFile(thumbnailPath)).toEqual(first?.buffer);
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
  });

  it("keeps the original available when thumbnail generation fails", async () => {
    const imageDir = await createImageDirectory();
    const stored = await storeImageBuffer(imageDir, Buffer.from("not-an-image"), ".png");
    const [date, fileName] = stored.relativePath.split("/");

    expect(await readStoredImage(imageDir, date, fileName)).not.toBeNull();
    expect(await readStoredImageThumbnail(imageDir, date, fileName)).toBeNull();
  });
});
