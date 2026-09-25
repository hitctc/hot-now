import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/client/components/creative/article-detail/articleDetailDrawer.css"), "utf8");
const mobileStyles = styles.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}\n\n\.article-detail-footer/)?.[1] ?? "";

describe("成品文章详情弹窗移动端布局", () => {
  it("居中容器顶部对齐，弹窗和内容占满视口且正文仍可滚动", () => {
    expect(mobileStyles).toMatch(/\.article-detail-modal\.ant-modal-centered\s*\{[^}]*align-items: flex-start !important;/);
    expect(mobileStyles).toMatch(/\.article-detail-modal \.ant-modal\s*\{[^}]*width: 100% !important;[^}]*height: 100dvh;/);
    expect(mobileStyles).toMatch(/\.article-detail-modal \.ant-modal \.ant-modal-content\s*\{[^}]*height: 100dvh;[^}]*max-height: 100dvh;/);
    expect(styles).toMatch(/\.article-detail-modal \.ant-modal-body\s*\{[^}]*flex: 1;[^}]*overflow-y: auto;/);
  });
});
