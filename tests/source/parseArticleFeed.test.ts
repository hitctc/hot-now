import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { loadActiveSourceIssue } from "../../src/core/source/loadActiveSourceIssue.js";
import { parseArticleFeed } from "../../src/core/source/parseArticleFeed.js";
import { BUILTIN_SOURCES } from "../../src/core/source/sourceCatalog.js";
import { sourceAdapters } from "../../src/core/source/sourceAdapters.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseArticleFeed", () => {
  it("normalizes the openai feed into ranked candidate items", async () => {
    const xml = await readFile("tests/fixtures/openai-rss.xml", "utf8");

    const issue = await parseArticleFeed(xml, BUILTIN_SOURCES.openai);

    expect(issue.sourceKind).toBe("openai");
    expect(issue.date).toBe("2026-03-27");
    expect(issue.issueUrl).toBe("https://openai.com/news/");
    expect(issue.items).toEqual([
      {
        rank: 1,
        category: "最新 AI 消息",
        title: "Introducing GPT-Next",
        sourceUrl: "https://openai.com/index/introducing-gpt-next/",
        sourceName: "OpenAI",
        externalId: "openai-gpt-next",
        publishedAt: "2026-03-27T18:00:00.000Z",
        summary: "Our latest model improves reasoning and instruction following."
      },
      {
        rank: 2,
        category: "最新 AI 消息",
        title: "Expanding the Responses API",
        sourceUrl: "https://openai.com/index/responses-api-expansion/",
        sourceName: "OpenAI",
        externalId: "openai-responses-api",
        publishedAt: "2026-03-26T16:30:00.000Z",
        summary: "New tools make agentic workflows easier to build."
      }
    ]);
  });

  it("strips html from summaries and keeps feed order for other article sources", async () => {
    const xml = await readFile("tests/fixtures/google-ai-rss.xml", "utf8");

    const issue = await parseArticleFeed(xml, BUILTIN_SOURCES.google_ai);

    expect(issue.sourceKind).toBe("google_ai");
    expect(issue.items.map((item) => item.rank)).toEqual([1, 2]);
    expect(issue.items[0]).toEqual(
      expect.objectContaining({
        category: "最新 AI 消息",
        sourceName: "Google AI",
        externalId: "google-gemini-3-context",
        summary: "Gemini 3 now supports longer context and faster multimodal reasoning."
      })
    );
  });

  it("falls back to the article url as external id when guid is missing", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Example</title><link>https://example.com/feed</link><item><title>First</title><link>https://example.com/post-1</link></item></channel></rss>`;

    const issue = await parseArticleFeed(xml, BUILTIN_SOURCES.techcrunch_ai);

    expect(issue.items).toEqual([
      {
        rank: 1,
        category: "热门文章",
        title: "First",
        sourceUrl: "https://example.com/post-1",
        sourceName: "TechCrunch AI",
        externalId: "https://example.com/post-1"
      }
    ]);
  });

  it("derives the issue date from the freshest valid published item", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Example</title><link>https://example.com/feed</link><item><title>Older but first</title><link>https://example.com/post-1</link><pubDate>Wed, 26 Mar 2026 08:00:00 GMT</pubDate></item><item><title>Newest but second</title><link>https://example.com/post-2</link><pubDate>Fri, 28 Mar 2026 05:30:00 GMT</pubDate></item></channel></rss>`;

    const issue = await parseArticleFeed(xml, BUILTIN_SOURCES.openai);

    expect(issue.date).toBe("2026-03-28");
    expect(issue.items.map((item) => item.rank)).toEqual([1, 2]);
  });

  it("assigns contiguous ranks after skipping invalid items", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Example</title><link>https://example.com/feed</link><item><title>Missing link</title></item><item><title>First valid</title><link>https://example.com/post-1</link></item><item><link>https://example.com/post-2</link></item><item><title>Second valid</title><link>https://example.com/post-3</link></item></channel></rss>`;

    const issue = await parseArticleFeed(xml, BUILTIN_SOURCES.techcrunch_ai);

    expect(issue.items).toEqual([
      expect.objectContaining({
        rank: 1,
        title: "First valid",
        sourceUrl: "https://example.com/post-1"
      }),
      expect.objectContaining({
        rank: 2,
        title: "Second valid",
        sourceUrl: "https://example.com/post-3"
      })
    ]);
  });
});

describe("sourceAdapters", () => {
  it("registers all built-in source kinds", () => {
    expect(Object.keys(sourceAdapters).sort()).toEqual([
      "google_ai",
      "juya",
      "openai",
      "techcrunch_ai"
    ]);
  });
});

describe("loadActiveSourceIssue", () => {
  const databasesToClose: Array<ReturnType<typeof openDatabase>> = [];

  afterEach(() => {
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

  it("falls back to the juya row when the active-source column is not available yet", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-source-db-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue(await readFile("tests/fixtures/juya-rss.xml", "utf8"))
    }));

    const issue = await loadActiveSourceIssue(db);

    expect(issue.sourceKind).toBe("juya");
    expect(issue.items[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        title: "谷歌推出 Lyria 3 Pro 音乐模型"
      })
    );
  });

  it("dispatches to the selected adapter when the active-source column exists", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-source-db-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db);
    db.exec("ALTER TABLE content_sources ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0");
    db.prepare("UPDATE content_sources SET is_active = 1 WHERE kind = 'openai'").run();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue(await readFile("tests/fixtures/openai-rss.xml", "utf8"))
    }));

    const issue = await loadActiveSourceIssue(db);

    expect(issue.sourceKind).toBe("openai");
    expect(issue.items[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        sourceName: "OpenAI",
        externalId: "openai-gpt-next"
      })
    );
  });

  it("fails fast when the active-source column exists but no row is active", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-source-db-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db);
    db.exec("ALTER TABLE content_sources ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0");

    await expect(loadActiveSourceIssue(db)).rejects.toThrow(
      "No active content source configured"
    );
  });

  it("fails with a clear error when the active row has an unknown source kind", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-source-db-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db);
    db.exec("ALTER TABLE content_sources ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0");
    db.prepare(
      `
        INSERT INTO content_sources (kind, name, site_url, rss_url, is_builtin)
        VALUES ('mystery_feed', 'Mystery Feed', 'https://example.com', 'https://example.com/rss.xml', 0)
      `
    ).run();
    db.prepare("UPDATE content_sources SET is_active = 1 WHERE kind = 'mystery_feed'").run();

    await expect(loadActiveSourceIssue(db)).rejects.toThrow(
      'Unsupported content source kind: "mystery_feed"'
    );
  });
});
