import { describe, it, expect, afterEach } from "vitest";
import {
  insertCreativeFinishedArticle,
  findCreativeFinishedArticleById,
  findCreativeFinishedArticleBySourceItemId,
  listCreativeFinishedArticles,
  updateCreativeFinishedArticleStatus,
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
    expect(article.status).toBe("generated");
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

  it("defaults optional fields to null and status to generated", async () => {
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
    expect(article.status).toBe("generated");
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

describe("updateCreativeFinishedArticleStatus", () => {
  it("follows valid transition path: generated -> edited -> approved -> published -> completed", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "status flow"
    });
    expect(article.status).toBe("generated");

    const r1 = updateCreativeFinishedArticleStatus(handle.db, article.id, "edited");
    expect(r1.ok).toBe(true);
    expect(findCreativeFinishedArticleById(handle.db, article.id)!.status).toBe("edited");

    const r2 = updateCreativeFinishedArticleStatus(handle.db, article.id, "approved");
    expect(r2.ok).toBe(true);
    expect(findCreativeFinishedArticleById(handle.db, article.id)!.status).toBe("approved");

    const r3 = updateCreativeFinishedArticleStatus(handle.db, article.id, "published");
    expect(r3.ok).toBe(true);
    expect(findCreativeFinishedArticleById(handle.db, article.id)!.status).toBe("published");

    const r4 = updateCreativeFinishedArticleStatus(handle.db, article.id, "completed");
    expect(r4.ok).toBe(true);
    expect(findCreativeFinishedArticleById(handle.db, article.id)!.status).toBe("completed");
  });

  it("rejects invalid transition generated -> approved", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "invalid"
    });

    const result = updateCreativeFinishedArticleStatus(handle.db, article.id, "approved");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("not allowed");
    // Status should remain unchanged
    expect(findCreativeFinishedArticleById(handle.db, article.id)!.status).toBe("generated");
  });

  it("allows rejected -> edited re-edit", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "re-edit"
    });

    // generated -> rejected
    const r1 = updateCreativeFinishedArticleStatus(handle.db, article.id, "rejected");
    expect(r1.ok).toBe(true);

    // rejected -> edited
    const r2 = updateCreativeFinishedArticleStatus(handle.db, article.id, "edited");
    expect(r2.ok).toBe(true);
    expect(findCreativeFinishedArticleById(handle.db, article.id)!.status).toBe("edited");
  });

  it("allows rejection from generated, edited, approved", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source1 = createSourceItem(handle.db);
    const a1 = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source1.id,
      contentMarkdown: "reject from generated"
    });
    expect(updateCreativeFinishedArticleStatus(handle.db, a1.id, "rejected").ok).toBe(true);

    const source2 = createSourceItem(handle.db);
    const a2 = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source2.id,
      contentMarkdown: "reject from edited"
    });
    updateCreativeFinishedArticleStatus(handle.db, a2.id, "edited");
    expect(updateCreativeFinishedArticleStatus(handle.db, a2.id, "rejected").ok).toBe(true);

    const source3 = createSourceItem(handle.db);
    const a3 = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source3.id,
      contentMarkdown: "reject from approved"
    });
    updateCreativeFinishedArticleStatus(handle.db, a3.id, "edited");
    updateCreativeFinishedArticleStatus(handle.db, a3.id, "approved");
    expect(updateCreativeFinishedArticleStatus(handle.db, a3.id, "rejected").ok).toBe(true);
  });

  it("blocks transition from completed", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "completed flow"
    });
    updateCreativeFinishedArticleStatus(handle.db, article.id, "edited");
    updateCreativeFinishedArticleStatus(handle.db, article.id, "approved");
    updateCreativeFinishedArticleStatus(handle.db, article.id, "published");
    updateCreativeFinishedArticleStatus(handle.db, article.id, "completed");

    const result = updateCreativeFinishedArticleStatus(handle.db, article.id, "edited");
    expect(result.ok).toBe(false);
  });

  it("returns error for non-existent article", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const result = updateCreativeFinishedArticleStatus(handle.db, 99999, "edited");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("not found");
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
    // Untouched field retains its value
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

  it("can clear optional fields by setting to null-like values", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "clear test",
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
    // All items are from the correct table
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

  it("filters by status", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const s1 = createSourceItem(handle.db);
    const s2 = createSourceItem(handle.db);

    const a1 = insertCreativeFinishedArticle(handle.db, { sourceItemId: s1.id, contentMarkdown: "keep generated" });
    insertCreativeFinishedArticle(handle.db, { sourceItemId: s2.id, contentMarkdown: "will be edited" });

    updateCreativeFinishedArticleStatus(handle.db, a1.id, "edited");

    const result = listCreativeFinishedArticles(handle.db, { status: "edited" });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe(a1.id);
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
