import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { loadEnabledSourceIssues } from "../../src/core/source/loadEnabledSourceIssues.js";

describe("loadEnabledSourceIssues", () => {
  const databasesToClose: ReturnType<typeof openDatabase>[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

  it("loads enabled sources in priority order and skips disabled sources", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-enabled-sources-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db, { username: "admin", password: "bootstrap-password" });

    db.prepare(
      `
        UPDATE content_sources
        SET is_enabled = CASE WHEN kind IN ('openai', 'google_ai') THEN 1 ELSE 0 END
      `
    ).run();

    const openAiXml = await readFile("tests/fixtures/openai-rss.xml", "utf8");
    const googleAiXml = await readFile("tests/fixtures/google-ai-rss.xml", "utf8");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("openai.com")) {
        return { status: 200, text: async () => openAiXml };
      }

      if (url.includes("blog.google")) {
        return { status: 200, text: async () => googleAiXml };
      }

      return { status: 404, text: async () => "" };
    });
    vi.stubGlobal("fetch", fetchMock);

    const issues = await loadEnabledSourceIssues(db);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(issues.map((issue) => issue.sourceKind)).toEqual(["openai", "google_ai"]);
    expect(issues[0]).toMatchObject({
      sourceKind: "openai",
      sourceType: "official",
      sourcePriority: 95
    });
    expect(issues[1]).toMatchObject({
      sourceKind: "google_ai",
      sourceType: "official",
      sourcePriority: 92
    });
  });

  it("keeps successful sources when one enabled feed fails", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-enabled-sources-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db, { username: "admin", password: "bootstrap-password" });

    db.prepare(
      `
        UPDATE content_sources
        SET is_enabled = CASE WHEN kind IN ('openai', 'google_ai') THEN 1 ELSE 0 END
      `
    ).run();

    const googleAiXml = await readFile("tests/fixtures/google-ai-rss.xml", "utf8");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("openai.com")) {
        return { status: 500, text: async () => "" };
      }

      if (url.includes("blog.google")) {
        return { status: 200, text: async () => googleAiXml };
      }

      return { status: 404, text: async () => "" };
    });
    vi.stubGlobal("fetch", fetchMock);

    const issues = await loadEnabledSourceIssues(db);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      sourceKind: "google_ai",
      sourceType: "official",
      sourcePriority: 92
    });
    expect(issues.failures).toEqual([
      {
        kind: "openai",
        reason: "RSS request failed with 500 for openai"
      }
    ]);
  });

  it("fails when every enabled source fails to load", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-enabled-sources-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db, { username: "admin", password: "bootstrap-password" });

    db.prepare(
      `
        UPDATE content_sources
        SET is_enabled = CASE WHEN kind = 'openai' THEN 1 ELSE 0 END
      `
    ).run();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 500,
        text: vi.fn().mockResolvedValue("")
      })
    );

    await expect(loadEnabledSourceIssues(db)).rejects.toThrow("RSS request failed with 500 for openai");
  });

  it("falls back to the generic article parser for enabled custom rss sources", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-enabled-sources-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db, { username: "admin", password: "bootstrap-password" });

    db.prepare("UPDATE content_sources SET is_enabled = 0").run();
    db.prepare(
      `
        INSERT INTO content_sources (
          kind,
          name,
          site_url,
          rss_url,
          is_enabled,
          is_builtin,
          source_type,
          bridge_kind,
          bridge_config_json
        )
        VALUES (?, ?, ?, ?, 1, 0, 'rss', NULL, NULL)
      `
    ).run(
      "custom-feed",
      "Custom Feed",
      "https://example.com",
      "https://example.com/rss.xml"
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        text: vi.fn().mockResolvedValue(
          `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Custom Feed</title><link>https://example.com/feed</link><item><title>Fresh item</title><link>https://example.com/post-1</link><guid isPermaLink="false">custom-1</guid><pubDate>Tue, 08 Apr 2026 02:00:00 GMT</pubDate><description><![CDATA[<p>来自自定义 RSS 来源。</p>]]></description></item></channel></rss>`
        )
      })
    );

    const issues = await loadEnabledSourceIssues(db);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      date: "2026-04-08",
      issueUrl: "https://example.com/feed",
      sourceKind: "custom-feed",
      sourceType: "aggregator",
      sourcePriority: 60,
      items: [
        {
          rank: 1,
          category: "外部来源",
          title: "Fresh item",
          sourceUrl: "https://example.com/post-1",
          sourceName: "Custom Feed",
          externalId: "custom-1",
          publishedAt: "2026-04-08T02:00:00.000Z",
          summary: "来自自定义 RSS 来源。"
        }
      ]
    });
  });
});
