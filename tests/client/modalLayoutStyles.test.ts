import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const modalStyles = readFileSync(
  resolve(process.cwd(), "src/client/styles/tailwind.css"),
  "utf8",
);

/** 提取指定选择器的样式声明，避免测试依赖整份样式文件的排版。 */
function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = modalStyles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

describe("global modal layout styles", () => {
  it("让普通弹窗外壳无边距，并由正文区域独立滚动", () => {
    const content = declarationsFor(".ant-modal .ant-modal-content");
    const body = declarationsFor(".ant-modal .ant-modal-body");

    expect(content).toContain("padding: 0 !important");
    expect(content).toContain("display: flex");
    expect(content).toContain("flex-direction: column");
    expect(content).toMatch(/max-height:\s*calc\(100dvh\s*-\s*\d+px\)/);
    expect(content).toContain("overflow: hidden");
    expect(body).toContain("min-height: 0");
    expect(body).toContain("overflow-y: auto");
    expect(body).toContain("padding: 24px");
  });

  it("为普通弹窗标题和底部操作区保留独立边距", () => {
    const header = declarationsFor(".ant-modal .ant-modal-header");
    const footer = declarationsFor(".ant-modal .ant-modal-footer");

    expect(header).toContain("flex-shrink: 0");
    expect(header).toContain("padding: 20px 24px 14px !important");
    expect(footer).toContain("flex-shrink: 0");
    expect(footer).toContain("padding: 0 24px 20px");
  });

  it("在移动端将普通弹窗正文边距收窄为 16px", () => {
    expect(modalStyles).toMatch(
      /@media\s*\(max-width:\s*767px\)[\s\S]*?\.ant-modal \.ant-modal-body\s*\{[^}]*padding:\s*16px/,
    );
  });

  it("保留设置表单和反馈弹窗已有的专用边距", () => {
    expect(declarationsFor(".editorial-form-modal .ant-modal-header")).toContain(
      "padding: 20px 24px 14px !important",
    );
    expect(declarationsFor(".editorial-form-modal .ant-modal-body")).toContain(
      "padding: 20px 24px 22px !important",
    );
    expect(declarationsFor(".editorial-feedback-modal .ant-modal-header")).toContain(
      "padding: 20px 20px 0 !important",
    );
    expect(declarationsFor(".editorial-feedback-modal .ant-modal-body")).toContain(
      "padding: 12px 20px 20px !important",
    );
  });
});
