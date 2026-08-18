import { afterEach, describe, expect, it, vi } from "vitest";

import { insertCreativeFinishedArticle } from "../../src/core/creative/creativeFinishedArticleRepository.js";
import { insertCreativeSourceItem } from "../../src/core/creative/creativeSourceItemRepository.js";
import { createServer } from "../../src/server/createServer.js";
import { type TestDatabaseHandle, createTestDatabase } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
const originalHermesUrl = process.env.HERMES_API_BASE_URL;
const originalHermesToken = process.env.HERMES_API_TOKEN;

afterEach(async () => {
  while (handles.length > 0) handles.pop()?.close();
  vi.unstubAllGlobals();
  if (originalHermesUrl === undefined) delete process.env.HERMES_API_BASE_URL;
  else process.env.HERMES_API_BASE_URL = originalHermesUrl;
  if (originalHermesToken === undefined) delete process.env.HERMES_API_TOKEN;
  else process.env.HERMES_API_TOKEN = originalHermesToken;
});

async function createArticle(
  stepTrace: unknown[],
  coverImagePrompt = "cover prompt",
  options: { direction?: string; imagePrompts?: string[] } = {},
) {
  const handle = await createTestDatabase("hot-now-luna-route-");
  handles.push(handle);
  const source = insertCreativeSourceItem(handle.db, {
    externalId: `luna-route-${Date.now()}-${Math.random()}`,
    collectorAgent: "test",
    title: "Luna 路由测试",
    url: "https://example.com/luna-route"
  });
  const article = insertCreativeFinishedArticle(handle.db, {
    sourceItemId: source.id,
    contentMarkdown: "正文\n\n[IMAGE1]",
    coverImagePrompt,
    inlineImagePrompts: { "1": "inline prompt" },
    stepTrace: stepTrace as any,
    direction: options.direction,
    imagePrompts: options.imagePrompts,
  });
  return { handle, article };
}

describe("GPT Luna 独立生图路由", () => {
  it("rejects an article whose actual writing trace is not Luna", async () => {
    const { handle, article } = await createArticle([
      { step: 8, meta: { writingProvider: "codex", writingModel: "other-model" } }
    ]);
    const app = createServer({ db: handle.db });

    const response = await app.inject({
      method: "POST",
      url: `/api/creative/finished-articles/${article.id}/luna-image`,
      payload: { target: "cover" }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ eligible: false });
    await app.close();
  });

  it("forwards only the target position and never accepts a browser prompt", async () => {
    const { handle, article } = await createArticle([
      { step: 8, meta: { writingProvider: "codex", writingModel: "gpt-5.6-luna" } }
    ]);
    process.env.HERMES_API_BASE_URL = "http://hermes.test";
    process.env.HERMES_API_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, job: { jobId: "job-1", status: "queued" } }),
      { status: 202, headers: { "content-type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);
    const app = createServer({ db: handle.db });

    const response = await app.inject({
      method: "POST",
      url: `/api/creative/finished-articles/${article.id}/luna-image`,
      payload: { target: "inline", imageIndex: 1, prompt: "browser must not win" }
    });

    expect(response.statusCode).toBe(202);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hermes.test/api/luna-image-jobs",
      expect.objectContaining({
        body: JSON.stringify({ articleId: article.id, target: "inline", imageIndex: 1, mode: "manual" })
      })
    );
    await app.close();
  });

  it("recognizes short-content trace and reads the indexed short prompt", async () => {
    const { handle, article } = await createArticle(
      [{ step: 1, stepName: "短内容写作", provider: "codex", model: "gpt-5.6-luna" }],
      "",
      { direction: "short_content", imagePrompts: ["short prompt"] },
    );
    process.env.HERMES_API_BASE_URL = "http://hermes.test";
    process.env.HERMES_API_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, job: { jobId: "short-job-1", status: "queued" } }),
      { status: 202, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const app = createServer({ db: handle.db });

    const response = await app.inject({
      method: "POST",
      url: `/api/creative/finished-articles/${article.id}/luna-image`,
      payload: { target: "inline", imageIndex: 1 },
    });

    expect(response.statusCode).toBe(202);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://hermes.test/api/luna-image-jobs",
      expect.objectContaining({
        body: JSON.stringify({ articleId: article.id, target: "inline", imageIndex: 1, mode: "manual" }),
      }),
    );
    await app.close();
  });
});
