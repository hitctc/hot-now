import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createApp, defineComponent } from "vue";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { installClientComponents } from "../../src/client/antdComponents";
import { useTableComponent } from "../../src/client/components/useTableComponent";

/** 核对每个SFC自己的模板作用域，局部运行态绑定不能由另一个页面的注册冒充。 */
function templateTags(root: string): Array<{ tag: string; local: boolean; file: string }> {
  const tags = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) tags.push(...templateTags(file));
    else if (file.endsWith(".vue")) {
      const text = readFileSync(file, "utf8");
      const { descriptor } = parse(text, { filename: file });
      const script = ts.createSourceFile(file, descriptor.scriptSetup?.content ?? "", ts.ScriptTarget.Latest, true);
      const localImports = new Set(script.statements.filter(ts.isImportDeclaration)
        .filter(node => !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier) &&
          ["ant-design-vue/es/table", "ant-design-vue/es/date-picker"].includes(node.moduleSpecifier.text))
        .map(node => node.importClause?.name?.text).filter((name): name is string => Boolean(name)));
      const installsTable = script.statements.some(node => ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.endsWith("/useTableComponent.js")) &&
        script.statements.some(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "useTableComponent");
      for (const match of (descriptor.template?.content ?? "").matchAll(/<a-([\w-]+)/g)) {
        const tag = "A" + match[1]!.split("-").map(part => part[0]!.toUpperCase() + part.slice(1)).join("");
        tags.push({ tag, local: localImports.has(tag) || (tag === "ATable" && installsTable), file });
      }
    }
  }
  return tags;
}

describe("client component registry", () => {
  it("installs the original table family only when a real consumer mounts", () => {
    const app = createApp(defineComponent({ setup() { useTableComponent(); useTableComponent(); return () => null; } }));
    installClientComponents(app);
    expect(app.component("ATable")).toBeUndefined();
    app.mount(document.createElement("div"));
    expect(app.component("ATable")).toBeDefined();
    expect(app.component("ATableColumn")).toBeDefined();
    app.unmount();
  });
  it("resolves all tags in their own local/global scope and preserves confirmation APIs", () => {
    const app = createApp(defineComponent({ template: "<div />" }));
    installClientComponents(app);
    for (const { tag, local, file } of templateTags(path.resolve("src/client"))) expect(local || Boolean(app.component(tag)), file + ":" + tag).toBe(true);
    expect(app.component("ATable")).toBeUndefined();
    expect(app.component("ADatePicker")).toBeUndefined();
    for (const name of ["$message", "$notification", "$info", "$success", "$error", "$warning", "$confirm", "$destroyAll"]) expect(app.config.globalProperties[name], name).toBeDefined();
  });
});
