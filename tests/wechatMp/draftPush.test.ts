import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { collectImageUrlsFromHtml, getArticlePushCount, getArticlePushLog, replaceCoverImageUrlInHtml } from "../../src/core/wechatMp/wechatMpDraftPush.js";

describe("文章推送记录隔离", () => {
  it("排除同编号日报，保留原有未分类历史记录", () => {
    const db = new Database(":memory:");
    try {
      db.exec(`
        CREATE TABLE wechat_mp_accounts (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE wechat_draft_push_log (
          id INTEGER PRIMARY KEY, article_id INTEGER, account_id INTEGER, theme_id TEXT,
          media_id TEXT, status TEXT, error_code TEXT, error_message TEXT, pushed_at TEXT, content_type TEXT
        );
        INSERT INTO wechat_draft_push_log (id, article_id, status, content_type) VALUES
          (1, 7, 'success', 'article'), (2, 7, 'success', 'daily_digest'),
          (3, 7, 'success', NULL), (4, 7, 'failed', 'article');
      `);
      expect(getArticlePushCount(db, 7)).toBe(2);
      expect(getArticlePushLog(db, 7).map((row) => (row as { id: number }).id).sort()).toEqual([1, 3, 4]);
    } finally {
      db.close();
    }
  });
});

// 草稿推送前的正文图片收集逻辑：推送流程不读 article.images，只信任渲染后的 HTML
describe("collectImageUrlsFromHtml", () => {
  it("收集 Markdown 手写的外链图片", () => {
    // 这正是用户反馈的场景：正文里用 ![](url) 手动插入的图片
    const html = `<p>正文 <img src="https://cdn.example.com/manual-1.jpg"></p>
      <p><img src="https://cdn.example.com/manual-2.png" alt="图2"></p>`;
    expect(collectImageUrlsFromHtml(html)).toEqual([
      "https://cdn.example.com/manual-1.jpg",
      "https://cdn.example.com/manual-2.png",
    ]);
  });

  it("跳过 data: 内联图和微信 CDN 已上传图，避免重复上传", () => {
    const html = `<img src="data:image/png;base64,xxxx">
      <img src="https://mmbiz.qpic.cn/mmbiz_jpg/abc/123">
      <img src="https://cdn.example.com/need-upload.jpg">`;
    expect(collectImageUrlsFromHtml(html)).toEqual([
      "https://cdn.example.com/need-upload.jpg",
    ]);
  });

  it("对同一张图多次出现只收集一次（替换时全量替换）", () => {
    const html = `<img src="https://cdn.example.com/dup.jpg">
      <img src="https://cdn.example.com/dup.jpg">
      <img src="https://cdn.example.com/dup.jpg">`;
    expect(collectImageUrlsFromHtml(html)).toEqual([
      "https://cdn.example.com/dup.jpg",
    ]);
  });

  it("代码封面仍从原 PNG 上传正文，不复用封面素材 URL", () => {
    const url = "https://now.example.com/api/creative/images/2026-01-01/card.png";
    const html = `<p><img src="${url}"></p>`;
    const coverCdnUrl = "https://mmbiz.qpic.cn/cover-url";
    const codeHtml = replaceCoverImageUrlInHtml(html, url, coverCdnUrl, [{ url }]);
    expect(collectImageUrlsFromHtml(codeHtml)).toEqual([url]);
    expect(replaceCoverImageUrlInHtml(html, url, coverCdnUrl, [])).toContain(coverCdnUrl);
  });

  it("忽略无 src 的 img 占位", () => {
    const html = `<img alt="no src"><img src="">`;
    expect(collectImageUrlsFromHtml(html)).toEqual([]);
  });
});
