import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findCreativeFinishedArticleById,
  insertCreativeFinishedArticle,
} from "../../src/core/creative/creativeFinishedArticleRepository.js";
import { createServer } from "../../src/server/createServer.js";
import { type TestDatabaseHandle, createTestDatabase } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
const originalHermesUrl = process.env.HERMES_API_BASE_URL;
const originalHermesToken = process.env.HERMES_API_TOKEN;

afterEach(() => {
  while (handles.length > 0) handles.pop()?.close();
  vi.unstubAllGlobals();
  if (originalHermesUrl === undefined) delete process.env.HERMES_API_BASE_URL;
  else process.env.HERMES_API_BASE_URL = originalHermesUrl;
  if (originalHermesToken === undefined) delete process.env.HERMES_API_TOKEN;
  else process.env.HERMES_API_TOKEN = originalHermesToken;
});

/** 建立一条短内容成品，并可预置已有标签。 */
async function createShortArticle(codeImageKeywords?: string[]) {
  const handle = await createTestDatabase("hot-now-keywords-route-");
  handles.push(handle);
  const article = insertCreativeFinishedArticle(handle.db, {
    direction: "short_content",
    titles: ["养老补贴假通知"],
    thesis: "先分清冒名通知和真实政策边界。",
    codeImageKeywords,
    contentMarkdown: "正文内容足够长，满足短内容成品的最小正文长度要求。",
    humanMarkdown: "正文内容足够长，满足短内容成品的最小正文长度要求。",
  });
  return { handle, article };
}

describe("代码图片标签重新生成路由", () => {
  it("覆盖旧标签并把已有代码图片标记为过期", async () => {
    process.env.HERMES_API_BASE_URL = "http://hermes.test";
    process.env.HERMES_API_TOKEN = "test-token";
    const { handle, article } = await createShortArticle(["旧标签"]);
    // 预置一张已完成图片，验证标签变化会把图片标记为 stale。
    const { editCreativeFinishedArticle } = await import("../../src/core/creative/creativeFinishedArticleRepository.js");
    editCreativeFinishedArticle(handle.db, article.id, {
      codeImageCards: [{
        variant: "2.5:1",
        url: "https://now.example.com/old.png",
        width: 1500,
        height: 600,
        status: "succeeded",
        generatedAt: "2026-09-16T00:00:00.000Z",
        sourceFingerprint: "old",
        fileSize: 1,
        error: null,
      }],
    }, "code-image");

    const fetchMock = vi.fn(async () => {
      // Hermes 负责生成并回写；这里直接改库模拟其 PATCH 结果。
      const { editCreativeFinishedArticle: edit } = await import("../../src/core/creative/creativeFinishedArticleRepository.js");
      edit(handle.db, article.id, { codeImageKeywords: ["冒名通知", "民政部"] });
      return new Response(JSON.stringify({ success: true, keywords: ["冒名通知", "民政部"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = createServer({ db: handle.db });
    const response = await app.inject({
      method: "POST",
      url: `/api/creative/finished-articles/${article.id}/regen-code-image-keywords`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, keywords: ["冒名通知", "民政部"] });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hermes.test/api/regen-code-image-keywords",
      expect.objectContaining({ method: "POST" }),
    );
    const saved = findCreativeFinishedArticleById(handle.db, article.id)!;
    expect(saved.codeImageKeywords).toEqual(["冒名通知", "民政部"]);
    expect(saved.codeImageCards[0].status).toBe("stale");
    await app.close();
  });

  it("长文成品拒绝生成代码图片标签", async () => {
    process.env.HERMES_API_BASE_URL = "http://hermes.test";
    process.env.HERMES_API_TOKEN = "test-token";
    const handle = await createTestDatabase("hot-now-keywords-longform-");
    handles.push(handle);
    const article = insertCreativeFinishedArticle(handle.db, {
      direction: "article",
      titles: ["长文标题"],
      contentMarkdown: "长文正文",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const app = createServer({ db: handle.db });
    const response = await app.inject({
      method: "POST",
      url: `/api/creative/finished-articles/${article.id}/regen-code-image-keywords`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ ok: false, reason: "code-image-keywords-require-short-content" });
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });
});
