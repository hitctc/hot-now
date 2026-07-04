import { describe, it, expect } from "vitest";
import { collectImageUrlsFromHtml } from "../../src/core/wechatMp/wechatMpDraftPush.js";

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

  it("忽略无 src 的 img 占位", () => {
    const html = `<img alt="no src"><img src="">`;
    expect(collectImageUrlsFromHtml(html)).toEqual([]);
  });
});
