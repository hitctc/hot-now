import { afterEach, describe, expect, it, vi } from "vitest";

import { findCreativeFinishedArticleById } from "../../src/core/creative/creativeFinishedArticleRepository.js";
import { createServer } from "../../src/server/createServer.js";
import { type TestDatabaseHandle, createTestDatabase } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  while (handles.length > 0) handles.pop()?.close();
  vi.restoreAllMocks();
  delete process.env.HERMES_API_BASE_URL;
  delete process.env.HERMES_API_TOKEN;
});

describe("manual finished article routes", () => {
  it("creates a long-form manual draft without a source item", async () => {
    const handle = await createTestDatabase("hot-now-manual-article-route-");
    handles.push(handle);
    const app = createServer({ db: handle.db });

    const response = await app.inject({
      method: "POST",
      url: "/actions/creative/finished-articles/manual",
      payload: { title: "我想自己写的文章", direction: "article" },
    });

    expect(response.statusCode).toBe(201);
    const article = response.json();
    expect(article).toMatchObject({
      sourceItemId: null,
      originType: "manual",
      status: "manual_draft",
      titles: ["我想自己写的文章"],
      humanMarkdown: "# 我想自己写的文章\n\n",
    });
    expect(findCreativeFinishedArticleById(handle.db, article.id)?.sourceItemId).toBeNull();
    await app.close();
  });

  it("requires a writing form for manual short content", async () => {
    const handle = await createTestDatabase("hot-now-manual-short-route-");
    handles.push(handle);
    const app = createServer({ db: handle.db });

    const response = await app.inject({
      method: "POST",
      url: "/actions/creative/finished-articles/manual",
      payload: { title: "短内容", direction: "short_content" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, reason: "invalid-manual-article-type" });
    await app.close();
  });

  it("toggles pin state and keeps it in the database", async () => {
    const handle = await createTestDatabase("hot-now-pin-route-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    const created = await app.inject({
      method: "POST",
      url: "/actions/creative/finished-articles/manual",
      payload: { title: "置顶测试", direction: "article" },
    });
    const id = created.json().id as number;

    const pinned = await app.inject({
      method: "POST",
      url: `/actions/creative/finished-articles/${id}/toggle-pin`,
    });
    expect(pinned.statusCode).toBe(200);
    expect(pinned.json().pinnedAt).not.toBeNull();

    const unpinned = await app.inject({
      method: "POST",
      url: `/actions/creative/finished-articles/${id}/toggle-pin`,
    });
    expect(unpinned.json().pinnedAt).toBeNull();
    await app.close();
  });

  it("generates cover and inline prompts separately and saves placeholders only after success", async () => {
    const handle = await createTestDatabase("hot-now-manual-prompts-route-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    const created = await app.inject({
      method: "POST",
      url: "/actions/creative/finished-articles/manual",
      payload: { title: "配图流程", direction: "article" },
    });
    const id = created.json().id as number;
    const body = "# 配图流程\n\n这是第一段与普通人有关的正文，包含足够具体的信息和阅读价值。\n\n这是第二段正文，用来继续解释实际影响和行动建议。";
    handle.db.prepare("UPDATE creative_finished_articles SET human_markdown = ? WHERE id = ?").run(body, id);

    process.env.HERMES_API_BASE_URL = "http://hermes.test";
    process.env.HERMES_API_TOKEN = "token";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        coverPrompt: "独立封面提示词",
        inlinePrompts: {},
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        coverPrompt: null,
        inlinePrompts: { "1": "正文配图提示词" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const coverResponse = await app.inject({
      method: "POST",
      url: `/actions/creative/finished-articles/${id}/generate-cover-prompt`,
    });
    expect(coverResponse.statusCode).toBe(200);
    expect(findCreativeFinishedArticleById(handle.db, id)?.humanMarkdown).toBe(body);

    const inlineResponse = await app.inject({
      method: "POST",
      url: `/actions/creative/finished-articles/${id}/generate-inline-prompts`,
    });
    expect(inlineResponse.statusCode).toBe(200);
    const article = findCreativeFinishedArticleById(handle.db, id);
    expect(article?.coverImagePrompt).toBe("独立封面提示词");
    expect(article?.inlineImagePrompts).toEqual({ "1": "正文配图提示词" });
    expect(article?.humanMarkdown).toContain("[IMAGE1]");
    await app.close();
  });

  it("does not insert placeholders when Hermes generation fails", async () => {
    const handle = await createTestDatabase("hot-now-manual-prompts-failure-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    const created = await app.inject({
      method: "POST",
      url: "/actions/creative/finished-articles/manual",
      payload: { title: "失败不落库", direction: "article" },
    });
    const id = created.json().id as number;
    const body = "# 失败不落库\n\n这是一段足够长的正文，用于验证生成失败时不能留下半成品占位符。";
    handle.db.prepare("UPDATE creative_finished_articles SET human_markdown = ? WHERE id = ?").run(body, id);

    process.env.HERMES_API_BASE_URL = "http://hermes.test";
    process.env.HERMES_API_TOKEN = "token";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: "模型失败",
    }), { status: 500, headers: { "Content-Type": "application/json" } }));

    const response = await app.inject({
      method: "POST",
      url: `/actions/creative/finished-articles/${id}/generate-inline-prompts`,
    });
    expect(response.statusCode).toBe(502);
    const article = findCreativeFinishedArticleById(handle.db, id);
    expect(article?.humanMarkdown).toBe(body);
    expect(article?.inlineImagePrompts).toBeNull();
    await app.close();
  });

  it("does not insert placeholders when Hermes omits a planned prompt number", async () => {
    const handle = await createTestDatabase("hot-now-manual-prompts-incomplete-");
    handles.push(handle);
    const app = createServer({ db: handle.db });
    const created = await app.inject({
      method: "POST",
      url: "/actions/creative/finished-articles/manual",
      payload: { title: "提示词缺号", direction: "article" },
    });
    const id = created.json().id as number;
    const body = [
      "# 提示词缺号",
      "第一段正文足够长，明确说明这件事对普通人的实际影响、判断方式和可执行建议。".repeat(10),
      "第二段正文继续展开具体例子，让系统需要规划不止一张正文配图的位置。".repeat(10),
    ].join("\n\n");
    handle.db.prepare("UPDATE creative_finished_articles SET human_markdown = ? WHERE id = ?").run(body, id);

    process.env.HERMES_API_BASE_URL = "http://hermes.test";
    process.env.HERMES_API_TOKEN = "token";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      coverPrompt: null,
      inlinePrompts: { "1": "只返回第一条提示词" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const response = await app.inject({
      method: "POST",
      url: `/actions/creative/finished-articles/${id}/generate-inline-prompts`,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().reason).toContain("缺少编号");
    const article = findCreativeFinishedArticleById(handle.db, id);
    expect(article?.humanMarkdown).toBe(body);
    expect(article?.inlineImagePrompts).toBeNull();
    await app.close();
  });
});
