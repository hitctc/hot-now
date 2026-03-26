import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractArticle, fetchAndExtractArticle } from "../../src/core/fetch/extractArticle.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("extractArticle", () => {
  it("extracts title and body text from article html", async () => {
    const html = await readFile("tests/fixtures/article-google.html", "utf8");
    const article = await extractArticle("https://blog.google/lyria", html);

    expect(article.ok).toBe(true);
    expect(article.title).toContain("Lyria 3 Pro");
    expect(article.text).toContain("音乐生成模型");
  });

  it("returns a degraded result when readable body is missing", async () => {
    const article = await extractArticle("https://example.com", "<html><body><nav>Empty</nav></body></html>");

    expect(article.ok).toBe(false);
    expect(article.error).toContain("Readable text");
  });
});

describe("fetchAndExtractArticle", () => {
  it("returns an http error when fetching the article fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: vi.fn()
    }));

    const article = await fetchAndExtractArticle("https://example.com/article");

    expect(article.ok).toBe(false);
    expect(article.error).toBe("HTTP 404");
  });

  it("returns an http error when fetch succeeds without a 200 status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue("<html></html>")
    }));

    const article = await fetchAndExtractArticle("https://example.com/article");

    expect(article.ok).toBe(false);
    expect(article.error).toBe("HTTP 204");
  });
});
