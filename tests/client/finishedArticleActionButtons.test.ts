import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageFiles = [
  "src/client/pages/creative/FinishedArticlesPage.vue",
  "src/client/pages/creative/ShortFinishedArticlesPage.vue",
];

/** 读取操作列片段，确保两个成品页面保持相同的按钮样式。 */
function actionColumnOf(file: string): string {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");
  const start = source.indexOf("<!-- 操作列：废弃/恢复 -->");
  const end = source.indexOf("</template>", start);
  return source.slice(start, end);
}

/** 提取绑定指定事件的按钮开始标签，避免把“恢复”等相邻按钮算入断言。 */
function buttonTagFor(actions: string, handler: string): string {
  return actions.match(new RegExp(`<a-button[^>]*@click="${handler}"[^>]*>`))?.[0] ?? "";
}

describe("finished article action buttons", () => {
  it.each(pageFiles)("%s 使用无边框文字操作且不强制清零内边距", (file) => {
    const actions = actionColumnOf(file);
    const pinButton = buttonTagFor(actions, "handleTogglePin\\(record\\)");
    const discardButton = buttonTagFor(actions, "handleDiscardArticle\\(record\\)");

    expect(pinButton).toContain('type="link"');
    expect(discardButton).toContain('type="link"');
    expect(discardButton).toContain("danger");
    expect(discardButton).not.toContain("ghost");
    expect(`${pinButton}${discardButton}`).not.toMatch(/!px-|!py-/);
  });
});
