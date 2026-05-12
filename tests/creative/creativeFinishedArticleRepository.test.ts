import { describe, it, expect, afterEach } from "vitest";
import {
  insertCreativeFinishedArticle,
  findCreativeFinishedArticleById,
  findCreativeFinishedArticleBySourceItemId,
  listCreativeFinishedArticles,
  editCreativeFinishedArticle
} from "../../src/core/creative/creativeFinishedArticleRepository.js";
import { insertCreativeSourceItem, findCreativeSourceItemById } from "../../src/core/creative/creativeSourceItemRepository.js";
import { type TestDatabaseHandle, createTestDatabase } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.close();
  }
});

function makeHandle() {
  return createTestDatabase("hot-now-creative-article-");
}

function createSourceItem(db: Parameters<typeof insertCreativeSourceItem>[0]) {
  return insertCreativeSourceItem(db, {
    externalId: `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    collectorAgent: "codex",
    title: "Source Article",
    url: "https://example.com/source"
  });
}

describe("insertCreativeFinishedArticle", () => {
  it("creates article and returns full record", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "# Hello\n\nWorld",
      mode: "A",
      thesis: "AI changes everything",
      titles: ["Title 1", "Title 2"],
      hooks: ["Hook 1"],
      quotes: ["Quote 1"],
      summary100: "Short summary",
      images: [{ url: "https://img.example.com/1.jpg", alt: "test" }],
      rawResponseText: "raw LLM output"
    });

    expect(article.id).toBeGreaterThan(0);
    expect(article.sourceItemId).toBe(source.id);
    expect(article.mode).toBe("A");
    expect(article.thesis).toBe("AI changes everything");
    expect(article.contentMarkdown).toBe("# Hello\n\nWorld");
    expect(article.titles).toEqual(["Title 1", "Title 2"]);
    expect(article.hooks).toEqual(["Hook 1"]);
    expect(article.quotes).toEqual(["Quote 1"]);
    expect(article.summary100).toBe("Short summary");
    expect(article.imagesJson).toEqual([{ url: "https://img.example.com/1.jpg", alt: "test" }]);
    expect(article.rawResponseText).toBe("raw LLM output");
  });

  it("backlinks source item linked_article_id", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "content"
    });

    const updatedSource = findCreativeSourceItemById(handle.db, source.id);
    expect(updatedSource!.linkedArticleId).toBe(article.id);
  });

  it("defaults optional fields to null", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "minimal content"
    });

    expect(article.mode).toBeNull();
    expect(article.thesis).toBeNull();
    expect(article.titles).toBeNull();
    expect(article.hooks).toBeNull();
    expect(article.quotes).toBeNull();
    expect(article.summary100).toBeNull();
    expect(article.imagesJson).toBeNull();
    expect(article.rawResponseText).toBeNull();
  });
});

describe("findCreativeFinishedArticleById", () => {
  it("returns the article when found", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "find me"
    });

    const found = findCreativeFinishedArticleById(handle.db, article.id);
    expect(found).not.toBeNull();
    expect(found!.contentMarkdown).toBe("find me");
  });

  it("returns null for non-existent id", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const found = findCreativeFinishedArticleById(handle.db, 99999);
    expect(found).toBeNull();
  });
});

describe("findCreativeFinishedArticleBySourceItemId", () => {
  it("returns article by source item id", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "linked"
    });

    const found = findCreativeFinishedArticleBySourceItemId(handle.db, source.id);
    expect(found).not.toBeNull();
    expect(found!.contentMarkdown).toBe("linked");
  });

  it("returns null when no article for source item", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const found = findCreativeFinishedArticleBySourceItemId(handle.db, 99999);
    expect(found).toBeNull();
  });
});

describe("editCreativeFinishedArticle", () => {
  it("updates provided fields and leaves others unchanged", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "original",
      thesis: "original thesis",
      titles: ["old title"]
    });

    const result = editCreativeFinishedArticle(handle.db, article.id, {
      contentMarkdown: "updated content",
      titles: ["new title 1", "new title 2"],
      hooks: ["a hook"]
    });

    expect(result.ok).toBe(true);

    const updated = findCreativeFinishedArticleById(handle.db, article.id)!;
    expect(updated.contentMarkdown).toBe("updated content");
    expect(updated.titles).toEqual(["new title 1", "new title 2"]);
    expect(updated.hooks).toEqual(["a hook"]);
    expect(updated.thesis).toBe("original thesis");
  });

  it("returns ok with no-op when input has no fields", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "no change"
    });

    const result = editCreativeFinishedArticle(handle.db, article.id, {});
    expect(result.ok).toBe(true);
  });

  it("returns error for non-existent article", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const result = editCreativeFinishedArticle(handle.db, 99999, { contentMarkdown: "x" });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("not found");
  });

  it("can update optional fields", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "update test",
      thesis: "will be replaced",
      summary100: "will be replaced"
    });

    editCreativeFinishedArticle(handle.db, article.id, {
      thesis: "new thesis",
      summary100: "new summary"
    });

    const updated = findCreativeFinishedArticleById(handle.db, article.id)!;
    expect(updated.thesis).toBe("new thesis");
    expect(updated.summary100).toBe("new summary");
  });
});

describe("listCreativeFinishedArticles", () => {
  it("returns paginated results with correct total and page size", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const s1 = createSourceItem(handle.db);
    const s2 = createSourceItem(handle.db);
    const s3 = createSourceItem(handle.db);

    insertCreativeFinishedArticle(handle.db, { sourceItemId: s1.id, contentMarkdown: "first" });
    insertCreativeFinishedArticle(handle.db, { sourceItemId: s2.id, contentMarkdown: "second" });
    insertCreativeFinishedArticle(handle.db, { sourceItemId: s3.id, contentMarkdown: "third" });

    const result = listCreativeFinishedArticles(handle.db, { page: 1, pageSize: 2 });

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(result.items.every((item) => typeof item.id === "number")).toBe(true);
  });

  it("returns second page with remainder items", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const s1 = createSourceItem(handle.db);
    const s2 = createSourceItem(handle.db);
    const s3 = createSourceItem(handle.db);

    insertCreativeFinishedArticle(handle.db, { sourceItemId: s1.id, contentMarkdown: "first" });
    insertCreativeFinishedArticle(handle.db, { sourceItemId: s2.id, contentMarkdown: "second" });
    insertCreativeFinishedArticle(handle.db, { sourceItemId: s3.id, contentMarkdown: "third" });

    const result = listCreativeFinishedArticles(handle.db, { page: 2, pageSize: 2 });

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(2);
  });

  it("filters by search matching content_markdown or thesis", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const s1 = createSourceItem(handle.db);
    const s2 = createSourceItem(handle.db);
    const s3 = createSourceItem(handle.db);

    insertCreativeFinishedArticle(handle.db, {
      sourceItemId: s1.id,
      contentMarkdown: "DeepSeek released a new model",
      thesis: "Open source AI is winning"
    });
    insertCreativeFinishedArticle(handle.db, {
      sourceItemId: s2.id,
      contentMarkdown: "Regular content",
      thesis: "Claude becomes more capable"
    });
    insertCreativeFinishedArticle(handle.db, {
      sourceItemId: s3.id,
      contentMarkdown: "Unrelated article"
    });

    const deepResult = listCreativeFinishedArticles(handle.db, { search: "DeepSeek" });
    expect(deepResult.total).toBe(1);
    expect(deepResult.items[0].sourceItemId).toBe(s1.id);

    const claudeResult = listCreativeFinishedArticles(handle.db, { search: "Claude" });
    expect(claudeResult.total).toBe(1);
    expect(claudeResult.items[0].sourceItemId).toBe(s2.id);
  });
});
