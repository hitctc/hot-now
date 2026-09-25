import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/client/styles/tailwind.css"), "utf8");

describe("创作表格移动端固定列", () => {
  it("仅在移动端让 ID / 序号首列随横向滚动，并移除固定列阴影", () => {
    expect(styles).toMatch(/@media \(max-width: 767px\) \{\s*\/\* 创作表格移动端首列不吸附[^]*?\.table-day-anchor-cell\.ant-table-cell-fix-left\s*\{[^}]*position: relative !important;[^}]*left: auto !important;/);
    expect(styles).toMatch(/\.table-day-anchor-cell\.ant-table-cell-fix-left-last::after\s*\{[^}]*box-shadow: none !important;/);
  });
});
