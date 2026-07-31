import { describe, it, expect, afterEach } from "vitest";
import {
  insertCreativeFinishedArticle,
  findCreativeFinishedArticleById,
  findCreativeFinishedArticleBySourceItemId,
  listCreativeFinishedArticles,
  editCreativeFinishedArticle,
  saveArticlePerformanceFeedback,
  checkPublishConditions,
  softDeleteFinishedArticle,
  togglePinnedFinishedArticle
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
    expect(article.summary100).toEqual(["Short summary"]);
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

  it("creates an independent manual draft without a source item", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const article = insertCreativeFinishedArticle(handle.db, {
      contentMarkdown: "",
      humanMarkdown: "# 我自己想写的文章\n\n",
      titles: ["我自己想写的文章"],
      status: "manual_draft",
      originType: "manual",
      direction: "article"
    });

    expect(article.sourceItemId).toBeNull();
    expect(article.originType).toBe("manual");
    expect(article.status).toBe("manual_draft");
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
    expect(article.performanceRecordedAt).toBeNull();
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
    expect(updated.summary100).toEqual(["new summary"]);
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

  it("returns only list fields in summary mode while preserving full detail", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const content = "正文".repeat(100);
    const article = insertCreativeFinishedArticle(handle.db, {
      contentMarkdown: content,
      evidencePack: { source: "detail-only" },
      oralDraft: "口述底稿"
    });

    const summary = listCreativeFinishedArticles(handle.db, { summaryOnly: true }).items[0];
    const detail = findCreativeFinishedArticleById(handle.db, article.id);

    expect(summary.contentMarkdown).toHaveLength(51);
    expect(summary.evidencePack).toBeNull();
    expect(summary.oralDraft).toBeNull();
    expect(detail?.contentMarkdown).toBe(content);
    expect(detail?.evidencePack).toEqual({ source: "detail-only" });
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

  it("sorts pinned records before newer unpinned records and clears pin on delete", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const first = insertCreativeFinishedArticle(handle.db, {
      contentMarkdown: "",
      humanMarkdown: "# 第一篇\n\n正文",
      titles: ["第一篇"],
      status: "manual_draft",
      originType: "manual"
    });
    const second = insertCreativeFinishedArticle(handle.db, {
      contentMarkdown: "",
      humanMarkdown: "# 第二篇\n\n正文",
      titles: ["第二篇"],
      status: "manual_draft",
      originType: "manual"
    });

    const pinned = togglePinnedFinishedArticle(handle.db, first.id);
    expect(pinned?.pinnedAt).not.toBeNull();
    expect(listCreativeFinishedArticles(handle.db).items[0].id).toBe(first.id);

    expect(softDeleteFinishedArticle(handle.db, first.id)).toBe(true);
    const deleted = findCreativeFinishedArticleById(handle.db, first.id);
    expect(deleted?.pinnedAt).toBeNull();
    expect(listCreativeFinishedArticles(handle.db).items[0].id).toBe(second.id);
  });
});

describe("checkPublishConditions", () => {
  it("accepts a short manual body but rejects an empty middle pane", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const article = insertCreativeFinishedArticle(handle.db, {
      contentMarkdown: "左栏内容不会用于发布",
      humanMarkdown: "# 手动标题\n\n短正文",
      titles: ["手动标题"],
      coverImage: ["https://img.example.com/cover.jpg"],
      status: "manual_draft",
      originType: "manual"
    });
    expect(checkPublishConditions(article)).toEqual({ qualified: true, missing: [] });

    const emptyMiddle = { ...article, humanMarkdown: "# 手动标题\n\n" };
    expect(checkPublishConditions(emptyMiddle).missing).toContain("缺少正文");

    const headerOnly = {
      ...article,
      humanMarkdown: "![封面图](https://img.example.com/cover.jpg)\n\n# 手动标题\n\n[IMAGE1]\n"
    };
    expect(checkPublishConditions(headerOnly).missing).toContain("缺少正文");
  });
});

describe("saveArticlePerformanceFeedback", () => {
  it("stores metrics and snapshots the selected title group and reader task", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: "performance test",
      titles: ["first title", "selected title"],
      pipelineVersion: "v2",
      readerTask: "避坑",
      titleCandidates: [
        {
          title: "first title",
          group: "impact",
          group_label: "现实影响",
          target_reader: "普通职场人",
          click_reason: "影响工作",
          content_payoff: "解释影响",
          clickbait_risk: "low",
          recommendation: "medium"
        },
        {
          title: "selected title",
          group: "risk",
          group_label: "损失风险",
          target_reader: "普通职场人",
          click_reason: "避免损失",
          content_payoff: "给出边界",
          clickbait_risk: "low",
          recommendation: "high"
        }
      ]
    });
    editCreativeFinishedArticle(handle.db, article.id, { titleIndex: 1 });

    const updated = saveArticlePerformanceFeedback(handle.db, article.id, {
      deliveredUsers: 1200,
      readUsers: 360,
      shareUsers: 18,
      newFollowers: 4,
      rewriteLevel: "medium"
    });

    expect(updated).not.toBeNull();
    expect(updated!.performanceDeliveredUsers).toBe(1200);
    expect(updated!.performanceReadUsers).toBe(360);
    expect(updated!.performanceShareUsers).toBe(18);
    expect(updated!.performanceNewFollowers).toBe(4);
    expect(updated!.performanceRewriteLevel).toBe("medium");
    expect(updated!.performanceTitleSnapshot).toBe("selected title");
    expect(updated!.performanceTitleGroupSnapshot).toBe("risk");
    expect(updated!.performanceReaderTaskSnapshot).toBe("避坑");
    expect(updated!.performanceRecordedAt).toBeTruthy();
  });
});

describe("writing pipeline v2 publishing", () => {
  it("persists stage products and requires explicit title confirmation", async () => {
    const handle = await makeHandle();
    handles.push(handle);

    const source = createSourceItem(handle.db);
    const article = insertCreativeFinishedArticle(handle.db, {
      sourceItemId: source.id,
      contentMarkdown: `# 候选标题\n\n${"正文内容".repeat(20)}`,
      titles: ["候选标题"],
      coverImage: ["https://img.example.com/cover.jpg"],
      pipelineVersion: "v2",
      readerTask: "做选择",
      readerRelevance: { target_reader: "普通家庭决策者" },
      oralDraft: "这是口述底稿",
      titleCandidates: [{
        title: "候选标题",
        group: "action",
        group_label: "选择行动",
        target_reader: "普通家庭决策者",
        click_reason: "需要作决定",
        content_payoff: "提供判断步骤",
        clickbait_risk: "low",
        recommendation: "high"
      }],
      factSourceChecklist: [{ fact: "事实", source: "官方" }],
      titleSelectionConfirmed: false
    });

    expect(article.pipelineVersion).toBe("v2");
    expect(article.readerTask).toBe("做选择");
    expect(article.oralDraft).toBe("这是口述底稿");
    expect(checkPublishConditions(article).missing).toContain("尚未人工确认发布标题");

    editCreativeFinishedArticle(handle.db, article.id, {
      titleIndex: 0,
      titleSelectionConfirmed: true
    });
    const confirmed = findCreativeFinishedArticleById(handle.db, article.id)!;
    expect(checkPublishConditions(confirmed)).toEqual({ qualified: true, missing: [] });
  });
});
