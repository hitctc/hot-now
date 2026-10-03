import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createApp, defineComponent } from "vue";
import { describe, expect, it } from "vitest";
import { installClientComponents } from "../../src/client/antdComponents";

/** 只检查客户端模板标签，类型导入和函数式接口不作为注册组件统计。 */
function templateTags(root: string): Set<string> {
  const tags = new Set<string>();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) for (const tag of templateTags(file)) tags.add(tag);
    else if (file.endsWith(".vue")) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/<a-([\w-]+)/g)) tags.add("A" + match[1]!.split("-").map(part => part[0]!.toUpperCase() + part.slice(1)).join(""));
    }
  }
  return tags;
}

describe("client component registry", () => {
  it("resolves every existing AntD template tag and preserves global confirmation APIs", () => {
    const app = createApp(defineComponent({ template: "<div />" }));
    installClientComponents(app);
    for (const tag of templateTags(path.resolve("src/client"))) expect(app.component(tag), tag).toBeDefined();
    for (const name of ["$message", "$notification", "$info", "$success", "$error", "$warning", "$confirm", "$destroyAll"]) expect(app.config.globalProperties[name], name).toBeDefined();
  });
});
