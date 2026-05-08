import { describe, it, expect, afterEach } from "vitest";
import {
  insertCreativeSourceItem,
  findCreativeSourceItemById,
  findCreativeSourceItemByExternalId,
  listCreativeSourceItems,
  updateCreativeSourceItemQualityStatus,
  updateCreativeSourceItemLinkedArticle
} from "../../src/core/creative/creativeSourceItemRepository.js";
import { type TestDatabaseHandle, createTestDatabase } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.close();
  }
});

function makeHandle() {
  return createTestDatabase("hot-now-creative-src-");
}

const baseInput = {
  externalId: "ext-001",
  collectorAgent: "agent-a",
  title: "Test Article",
  url: "https://example.com/article-1"
};

describe("insertCreativeSourceItem", () => {
  it("returns id and created=true for new record", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const result = insertCreativeSourceItem(handle.db, baseInput);

    expect(result.created).toBe(true);
    expect(result.id).toBeGreaterThan(0);
  });

  it("returns same id and created=false on duplicate externalId+collectorAgent", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const first = insertCreativeSourceItem(handle.db, baseInput);
    const second = insertCreativeSourceItem(handle.db, baseInput);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it("creates separate records when same externalId comes from different agents", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const a = insertCreativeSourceItem(handle.db, { ...baseInput, collectorAgent: "agent-a" });
    const b = insertCreativeSourceItem(handle.db, { ...baseInput, collectorAgent: "agent-b" });

    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.id).not.toBe(b.id);
  });

  it("stores all optional fields and rawPayloadJson contains the full input", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const fullInput = {
      externalId: "ext-full",
      collectorAgent: "agent-full",
      title: "Full Article",
      url: "https://example.com/full",
      sourceName: "TechCrunch",
      summary: "A summary",
      fullContent: "Long content here",
      author: "Alice",
      coverImageUrl: "https://img.example.com/cover.jpg",
      tags: "ai, llm",
      language: "en",
      wordCount: 1200,
      contentType: "article",
      score: 85.5,
      publishedAt: "2026-05-01T10:00:00.000Z",
      collectorTimestamp: "2026-05-02T08:00:00.000Z"
    };

    const result = insertCreativeSourceItem(handle.db, fullInput);
    const record = findCreativeSourceItemById(handle.db, result.id);

    expect(record).not.toBeNull();
    expect(record!.sourceName).toBe("TechCrunch");
    expect(record!.summary).toBe("A summary");
    expect(record!.fullContent).toBe("Long content here");
    expect(record!.author).toBe("Alice");
    expect(record!.coverImageUrl).toBe("https://img.example.com/cover.jpg");
    expect(record!.tags).toBe("ai, llm");
    expect(record!.language).toBe("en");
    expect(record!.wordCount).toBe(1200);
    expect(record!.contentType).toBe("article");
    expect(record!.score).toBe(85.5);
    expect(record!.publishedAt).toBe("2026-05-01T10:00:00.000Z");
    expect(record!.collectorTimestamp).toBe("2026-05-02T08:00:00.000Z");
    expect(record!.rawPayloadJson).toBe(JSON.stringify(fullInput));
  });

  it("defaults language to zh when not provided", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const result = insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "ext-no-lang" });
    const record = findCreativeSourceItemById(handle.db, result.id);

    expect(record!.language).toBe("zh");
  });
});

describe("listCreativeSourceItems", () => {
  it("paginates results with correct total", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "p1", title: "Page 1" });
    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "p2", title: "Page 2" });
    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "p3", title: "Page 3" });

    const result = listCreativeSourceItems(handle.db, { page: 1, pageSize: 2 });

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
  });

  it("returns second page correctly", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "p1", title: "Page 1" });
    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "p2", title: "Page 2" });
    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "p3", title: "Page 3" });

    const result = listCreativeSourceItems(handle.db, { page: 2, pageSize: 2 });

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(2);
  });

  it("filters by qualityStatus", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const a = insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "q1" });
    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "q2" });

    updateCreativeSourceItemQualityStatus(handle.db, a.id, "accepted");

    const result = listCreativeSourceItems(handle.db, { qualityStatus: "accepted" });

    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe(a.id);
  });

  it("filters by search term matching title or summary", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    insertCreativeSourceItem(handle.db, {
      ...baseInput,
      externalId: "s1",
      title: "GPT-5 发布"
    });
    insertCreativeSourceItem(handle.db, {
      ...baseInput,
      externalId: "s2",
      title: "其他新闻",
      summary: "Claude 更新了模型"
    });
    insertCreativeSourceItem(handle.db, {
      ...baseInput,
      externalId: "s3",
      title: "不相关的文章"
    });

    const gptResult = listCreativeSourceItems(handle.db, { search: "GPT" });
    expect(gptResult.total).toBe(1);
    expect(gptResult.items[0].externalId).toBe("s1");

    const claudeResult = listCreativeSourceItems(handle.db, { search: "Claude" });
    expect(claudeResult.total).toBe(1);
    expect(claudeResult.items[0].externalId).toBe("s2");
  });
});

describe("updateCreativeSourceItemQualityStatus", () => {
  it("updates status and returns true for existing record", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const inserted = insertCreativeSourceItem(handle.db, baseInput);
    const updated = updateCreativeSourceItemQualityStatus(handle.db, inserted.id, "accepted");

    expect(updated).toBe(true);

    const record = findCreativeSourceItemById(handle.db, inserted.id);
    expect(record!.qualityStatus).toBe("accepted");
  });

  it("returns false for non-existent id", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const updated = updateCreativeSourceItemQualityStatus(handle.db, 99999, "rejected");
    expect(updated).toBe(false);
  });
});

describe("updateCreativeSourceItemLinkedArticle", () => {
  it("sets linked_article_id", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const inserted = insertCreativeSourceItem(handle.db, baseInput);

    // Insert a finished article row first so the FK constraint on linked_article_id is satisfied.
    handle.db
      .prepare(
        `INSERT INTO creative_finished_articles (source_item_id, content_markdown) VALUES (?, ?)`
      )
      .run(inserted.id, "test markdown content");

    const articleRow = handle.db
      .prepare("SELECT id FROM creative_finished_articles WHERE source_item_id = ?")
      .get(inserted.id) as { id: number };

    const updated = updateCreativeSourceItemLinkedArticle(handle.db, inserted.id, articleRow.id);

    expect(updated).toBe(true);

    const record = findCreativeSourceItemById(handle.db, inserted.id);
    expect(record!.linkedArticleId).toBe(articleRow.id);
  });
});

describe("findCreativeSourceItemByExternalId", () => {
  it("finds record by composite key", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    insertCreativeSourceItem(handle.db, { ...baseInput, externalId: "ext-composite", collectorAgent: "agent-x" });

    const found = findCreativeSourceItemByExternalId(handle.db, "ext-composite", "agent-x");
    expect(found).not.toBeNull();
    expect(found!.externalId).toBe("ext-composite");
    expect(found!.collectorAgent).toBe("agent-x");
  });

  it("returns null when no match", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const found = findCreativeSourceItemByExternalId(handle.db, "no-such-id", "no-agent");
    expect(found).toBeNull();
  });
});
