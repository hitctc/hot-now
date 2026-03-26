import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLatestIssue } from "../../src/core/source/loadLatestIssue.js";
import { parseJuyaIssue } from "../../src/core/source/parseJuyaIssue.js";
import type { RuntimeConfig } from "../../src/core/types/appConfig.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseJuyaIssue", () => {
  it("extracts ranked items from content:encoded", async () => {
    const xml = await readFile("tests/fixtures/juya-rss.xml", "utf8");
    const issue = await parseJuyaIssue(xml);

    expect(issue.date).toBe("2026-03-26");
    expect(issue.items).toEqual([
      expect.objectContaining({
        rank: 1,
        category: "要闻",
        title: "谷歌推出 Lyria 3 Pro 音乐模型",
        sourceUrl: "https://blog.google/lyria"
      }),
      expect.objectContaining({
        rank: 6,
        category: "开发生态",
        title: "Figma 宣布向 AI agents 开放 Figma Canvas",
        sourceUrl: "https://www.figma.com/blog/the-figma-canvas-is-now-open-to-agents/"
      })
    ]);
  });

  it("ignores list items without a positive integer rank", async () => {
    const xml = await readFile("tests/fixtures/juya-rss.xml", "utf8");
    const issue = await parseJuyaIssue(xml);

    expect(issue.items).toHaveLength(2);
  });

  it("defaults the date when title is missing", async () => {
    const xml = `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><link>https://example.com/issue</link><content:encoded><![CDATA[<h3>要闻</h3><ul><li>示例 <a href="https://example.com/a">↗</a><code>#1</code></li></ul>]]></content:encoded></item></channel></rss>`;

    const issue = await parseJuyaIssue(xml);

    expect(issue.date).toBe("unknown-date");
  });

  it("defaults the issue url when link is missing", async () => {
    const xml = `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>2026-03-26</title><content:encoded><![CDATA[<h3>要闻</h3><ul><li>示例 <a href="https://example.com/a">↗</a><code>#1</code></li></ul>]]></content:encoded></item></channel></rss>`;

    const issue = await parseJuyaIssue(xml);

    expect(issue.issueUrl).toBe("");
  });

  it("returns no items when html content is missing", async () => {
    const xml = `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>2026-03-26</title><link>https://example.com/issue</link></item></channel></rss>`;

    const issue = await parseJuyaIssue(xml);

    expect(issue.items).toEqual([]);
  });
});

describe("loadLatestIssue", () => {
  it("fails when the rss request is not successful", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn()
    }));

    const config = {
      source: {
        rssUrl: "https://example.com/rss.xml"
      }
    } as RuntimeConfig;

    await expect(loadLatestIssue(config)).rejects.toThrow("RSS request failed with 500");
  });

  it("fails when the rss request returns a non-200 success status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn()
    }));

    const config = {
      source: {
        rssUrl: "https://example.com/rss.xml"
      }
    } as RuntimeConfig;

    await expect(loadLatestIssue(config)).rejects.toThrow("RSS request failed with 204");
  });
});
