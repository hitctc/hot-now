import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** 锁定人工写作弹窗的交付承诺，避免再次把 Luna 自动生图当成默认步骤。 */
describe("人工长文写作图片说明", () => {
  it("说明只自动生成提示词，逐图 Luna 生图需在成品详情手动触发", () => {
    const source = readFileSync(resolve(process.cwd(), "src/client/pages/creative/SourceItemsPage.vue"), "utf8");
    expect(source).toContain("会生成图片提示词，但不会随写作自动调用 Luna 生图");
    expect(source).toContain("成品详情仍可按需手动逐图生成");
    expect(source).not.toContain("提交后由 Hermes 统一执行写作及符合条件的 Luna 配图流程");
  });
});
