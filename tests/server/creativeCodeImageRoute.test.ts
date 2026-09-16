import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { generateCodeImageCards } from "../../src/core/creative/codeImageCardsService.js";
import { insertCreativeFinishedArticle } from "../../src/core/creative/creativeFinishedArticleRepository.js";
import { insertCreativeSourceItem } from "../../src/core/creative/creativeSourceItemRepository.js";
import { createServer } from "../../src/server/createServer.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
const tempDirs: string[] = [];
const originalToken = process.env.CREATIVE_API_TOKEN;

afterEach(async () => {
  while (handles.length > 0) handles.pop()?.close();
  while (tempDirs.length > 0) await rm(tempDirs.pop()!, { recursive: true, force: true });
  if (originalToken === undefined) delete process.env.CREATIVE_API_TOKEN;
  else process.env.CREATIVE_API_TOKEN = originalToken;
});

describe("短内容代码制图片路由", () => {
  it("接受 Hermes token 请求并返回制作后的成品", async () => {
    process.env.CREATIVE_API_TOKEN = "test-token";
    const handle = await createTestDatabase("hot-now-code-image-route-");
    handles.push(handle);
    const imageDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-code-image-route-files-"));
    tempDirs.push(imageDir);
    const source = insertCreativeSourceItem(handle.db, {
      externalId: `code-image-route-${Date.now()}`,
      collectorAgent: "test",
      title: "代码图片路由测试",
      url: "https://example.com/code-image-route",
      tags: '["AI", "图片", "路由"]',
    });
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      direction: "short_content",
      titles: ["代码图片路由测试"],
      thesis: "服务端负责制作和回写。",
      contentMarkdown: "正文内容足够长，满足短内容成品的最小正文长度要求。",
      humanMarkdown: "正文内容足够长，满足短内容成品的最小正文长度要求。",
    });
    const app = createServer({
      db: handle.db,
      creativeApiToken: "test-token",
      generateCodeImageCards: (articleId, mode) => generateCodeImageCards(handle.db, articleId, {
        imageDir,
        publicBaseUrl: "https://now.example.com",
        mode,
      }),
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/creative/finished-articles/${article.id}/code-images`,
      headers: { "x-creative-token": "test-token" },
      payload: { mode: "missing" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, status: "succeeded" });
    expect(response.json().article.codeImageCards).toHaveLength(3);
    await app.close();
  });
});
