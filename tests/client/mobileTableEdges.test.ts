import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/client/styles/tailwind.css"), "utf8");

describe("移动数据表格外侧留白", () => {
  it("仅在现有表格移动断点统一铺满屏宽，不缩单元格或正文表格", () => {
    expect(styles).toMatch(/@media \(max-width: 767px\) \{[^{}]*main \.ant-table-wrapper\s*\{\s*width: 100vw;\s*max-width: 100vw;\s*margin-inline: calc\(\(100% - 100vw\) \/ 2\);\s*\}/);
    expect(styles.match(/margin-inline: calc\(\(100% - 100vw\) \/ 2\)/g)).toHaveLength(1);
    expect(styles.slice(0, styles.indexOf("main .ant-table-wrapper"))).toContain("@media (max-width: 767px)");
  });
  it.each([360, 390, 767])("对%s宽屏不同父层留白，表格左右边界仍为屏幕边界", (width) => {
    for (const padding of [12, 28, 36]) {
      const contentWidth = width - padding * 2;
      const margin = (contentWidth - width) / 2;
      expect(padding + margin).toBe(0);
      expect(padding + margin + width).toBe(width);
    }
  });
  it.each(["SourceItemsPage.vue", "ShortSourceItemsPage.vue"])("%s关联成品入口使用同一加载和过期请求守卫", (page) => {
    const source = readFileSync(resolve(process.cwd(), "src/client/pages/creative", page), "utf8");
    expect(source).toContain("useFinishedArticleDetail(() => loadItems())");
    expect(source).toContain("return openDetail({ id: articleId });");
    expect(source).toContain(':open="detailLoading || detailArticle !== null"');
    expect(source).toContain(':loading="detailLoading"');
    expect(source).not.toContain("await readCreativeFinishedArticle(articleId)");
  });
});
