import { afterEach, describe, expect, it } from "vitest";

import {
  editCreativeFinishedArticle,
  findCreativeFinishedArticleById,
  insertCreativeFinishedArticle,
} from "../../src/core/creative/creativeFinishedArticleRepository.js";
import { normalizeFinishedArticleStatus } from "../../src/core/creative/creativeFinishedArticleStatus.js";
import { normalizeShortContentStatusesMigration } from "../../src/core/db/migrations/055_normalize_short_content_statuses.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];

afterEach(() => {
  while (handles.length > 0) handles.pop()?.close();
});

describe("短内容成品状态归一化", () => {
  it("把短内容写作状态映射成平台成品状态", () => {
    expect(normalizeFinishedArticleStatus("short_content", "ready")).toBe("ready_for_publish");
    expect(normalizeFinishedArticleStatus("short_content", "draft")).toBe("needs_review");
    expect(normalizeFinishedArticleStatus("short_content", "needs_rewrite")).toBe("needs_review");
  });

  it("不改动长文状态和未知状态", () => {
    // 长文有独立的门禁流程，不能用短内容映射覆盖
    expect(normalizeFinishedArticleStatus("article", "ready")).toBe("ready");
    expect(normalizeFinishedArticleStatus("short_content", "wechat_draft")).toBe("wechat_draft");
    expect(normalizeFinishedArticleStatus("short_content", undefined)).toBeUndefined();
  });

  it("新建短内容时把 ready 落库为可推送状态", async () => {
    const handle = await createTestDatabase("hot-now-status-normalize-");
    handles.push(handle);
    const article = insertCreativeFinishedArticle(handle.db, {
      direction: "short_content",
      titles: ["标题"],
      contentMarkdown: "正文内容足够长，满足短内容成品的最小正文长度要求。",
      status: "ready",
    });

    // 推送链路只接受 ready_for_publish，落库值必须已经转换完成
    expect(article.status).toBe("ready_for_publish");

    const withDraftStatus = insertCreativeFinishedArticle(handle.db, {
      direction: "short_content",
      titles: ["标题二"],
      contentMarkdown: "正文内容足够长，满足短内容成品的最小正文长度要求。",
      status: "draft",
    });
    expect(withDraftStatus.status).toBe("needs_review");
  });

  it("更新状态时接受短内容写入状态且不再报非法状态", async () => {
    const handle = await createTestDatabase("hot-now-status-edit-");
    handles.push(handle);
    const article = insertCreativeFinishedArticle(handle.db, {
      direction: "short_content",
      titles: ["标题"],
      // generated → ready_for_publish 会校验发布条件：必须有封面，且正文超过 50 字
      coverImage: ["https://now.example.com/cover.png"],
      contentMarkdown: "黄仁勋在公开活动上回应了 AI 末日论，认为相关预测缺乏科学依据，并表示 AI 发展不应因为极端风险叙事而减速，需要盯住可验证的风险与责任边界。",
      status: "generated",
    });

    const result = editCreativeFinishedArticle(handle.db, article.id, { status: "ready" });

    expect(result.ok).toBe(true);
    expect(findCreativeFinishedArticleById(handle.db, article.id)!.status).toBe("ready_for_publish");
  });

  it("迁移存量短内容状态并保留长文状态", async () => {
    const handle = await createTestDatabase("hot-now-status-migration-");
    handles.push(handle);
    const shortContent = insertCreativeFinishedArticle(handle.db, {
      direction: "short_content",
      titles: ["短内容"],
      contentMarkdown: "正文内容足够长，满足短内容成品的最小正文长度要求。",
      status: "generated",
    });
    const draftShort = insertCreativeFinishedArticle(handle.db, {
      direction: "short_content",
      titles: ["未过质检"],
      contentMarkdown: "正文内容足够长，满足短内容成品的最小正文长度要求。",
      status: "generated",
    });
    const longForm = insertCreativeFinishedArticle(handle.db, {
      direction: "article",
      titles: ["长文"],
      contentMarkdown: "长文正文",
      status: "generated",
    });

    // 用原始 SQL 还原迁移前的历史数据形态
    handle.db.prepare("UPDATE creative_finished_articles SET status = 'ready' WHERE id = ?").run(shortContent.id);
    handle.db.prepare("UPDATE creative_finished_articles SET status = 'needs_rewrite' WHERE id = ?").run(draftShort.id);
    handle.db.prepare("UPDATE creative_finished_articles SET status = 'ready_for_publish' WHERE id = ?").run(longForm.id);

    normalizeShortContentStatusesMigration.apply(handle.db);

    expect(findCreativeFinishedArticleById(handle.db, shortContent.id)!.status).toBe("ready_for_publish");
    expect(findCreativeFinishedArticleById(handle.db, draftShort.id)!.status).toBe("needs_review");
    // 长文保持原状态，不会被短内容规则误伤
    expect(findCreativeFinishedArticleById(handle.db, longForm.id)!.status).toBe("ready_for_publish");
  });
});
