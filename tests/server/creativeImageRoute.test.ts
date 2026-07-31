import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

import { storeImageBuffer } from "../../src/core/storage/imageStore.js";
import { createServer } from "../../src/server/createServer.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("creative image route", () => {
  it("serves a cached WebP thumbnail without replacing the original", async () => {
    const imageDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-image-route-"));
    temporaryDirectories.push(imageDir);
    const originalBuffer = await sharp({
      create: {
        width: 1920,
        height: 816,
        channels: 3,
        background: { r: 88, g: 28, b: 135 }
      }
    }).png().toBuffer();
    const stored = await storeImageBuffer(imageDir, originalBuffer, ".png");
    const app = createServer({ creativeImageDir: imageDir });

    const thumbnail = await app.inject({
      method: "GET",
      url: `${stored.urlPath}?variant=thumbnail`
    });
    const original = await app.inject({
      method: "GET",
      url: stored.urlPath
    });

    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.headers["content-type"]).toContain("image/webp");
    expect(thumbnail.headers["x-hot-now-image-variant"]).toBe("thumbnail");
    expect(thumbnail.rawPayload.byteLength).toBeLessThan(50 * 1024);
    expect(original.rawPayload).toEqual(originalBuffer);

    await app.close();
  });
});
