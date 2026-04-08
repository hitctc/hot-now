import { describe, expect, it } from "vitest";
import type { PluginOption } from "vite";

import { CLIENT_ASSET_BASE } from "../../src/client/appBases";
import {
  CLIENT_DEVTOOLS_EDITOR,
  VSCODE_EDITOR_CANDIDATES,
  createClientViteConfig,
  resolveClientDevtoolsEditor
} from "../../vite.config";

function readPluginNames(plugins: PluginOption[] | undefined): string[] {
  return (plugins ?? []).flatMap((plugin) => {
    if (Array.isArray(plugin)) {
      return plugin
        .map((item) => item?.name)
        .filter((name): name is string => typeof name === "string");
    }

    return typeof plugin?.name === "string" ? [plugin.name] : [];
  });
}

function findPluginByName(plugins: PluginOption[] | undefined, name: string): PluginOption | undefined {
  return (plugins ?? []).flatMap((plugin) => Array.isArray(plugin) ? plugin : [plugin])
    .find((plugin) => plugin?.name === name);
}

describe("vite client config", () => {
  it("prefers the real VS Code CLI over a reused code symlink when it is installed", () => {
    const editor = resolveClientDevtoolsEditor((filePath) => filePath === VSCODE_EDITOR_CANDIDATES[0]);

    expect(editor).toBe(VSCODE_EDITOR_CANDIDATES[0]);
  });

  it("falls back to the generic code command when VS Code is not installed in the default app path", () => {
    expect(resolveClientDevtoolsEditor(() => false)).toBe("code");
  });

  it("enables vue devtools only for the dev server config", () => {
    const serveConfig = createClientViteConfig({ command: "serve" });
    const buildConfig = createClientViteConfig({ command: "build" });
    const servePluginNames = readPluginNames(serveConfig.plugins);
    const buildPluginNames = readPluginNames(buildConfig.plugins);

    expect(servePluginNames.some((pluginName) => pluginName.includes("vue-devtools"))).toBe(true);
    expect(buildPluginNames.some((pluginName) => pluginName.includes("vue-devtools"))).toBe(false);
  });

  it("pins vue devtools open-in-editor to VS Code", async () => {
    const serveConfig = createClientViteConfig({ command: "serve" });
    const devtoolsPlugin = findPluginByName(serveConfig.plugins, "vite-plugin-vue-devtools");

    expect(devtoolsPlugin).toBeDefined();
    expect(devtoolsPlugin && !Array.isArray(devtoolsPlugin)).toBe(true);

    if (!devtoolsPlugin || Array.isArray(devtoolsPlugin)) {
      return;
    }

    // 这里直接看插件注入到 inspector 的 HTML 标签，避免测试只停留在“插件名存在”这一层。
    devtoolsPlugin.configResolved?.({
      base: CLIENT_ASSET_BASE,
      server: {}
    } as never);

    const transformed = await devtoolsPlugin.transformIndexHtml?.("<html></html>");

    expect(typeof transformed === "object" && transformed && "tags" in transformed).toBe(true);

    const inspectorTag = typeof transformed === "object" && transformed && "tags" in transformed
      ? transformed.tags.find((tag) => typeof tag === "object" && tag && "launchEditor" in tag)
      : undefined;

    expect(inspectorTag).toBeDefined();
    expect(
      typeof inspectorTag === "object" && inspectorTag && "launchEditor" in inspectorTag
        ? inspectorTag.launchEditor
        : undefined
    ).toBe(CLIENT_DEVTOOLS_EDITOR);
  });

  it("keeps the emitted asset base on /client/", () => {
    expect(createClientViteConfig({ command: "build" }).base).toBe(CLIENT_ASSET_BASE);
  });

  it("splits core vendors into dedicated chunks instead of leaving everything in the entry bundle", () => {
    const viteConfig = createClientViteConfig({ command: "build" });
    const manualChunks = viteConfig.build?.rollupOptions?.output
      && !Array.isArray(viteConfig.build.rollupOptions.output)
      ? viteConfig.build.rollupOptions.output.manualChunks
      : undefined;

    expect(manualChunks).toBeTypeOf("function");
    expect(manualChunks?.("/workspace/node_modules/vue/dist/vue.runtime.esm-bundler.js")).toBe("vue-vendor");
    expect(manualChunks?.("/workspace/node_modules/vue-router/dist/vue-router.mjs")).toBe("vue-vendor");
    expect(manualChunks?.("/workspace/node_modules/ant-design-vue/es/button/index.js")).toBe("antd-vendor");
    expect(manualChunks?.("/workspace/node_modules/@ant-design/icons-vue/es/icons/MenuOutlined.js")).toBe("antd-vendor");
    expect(manualChunks?.("/workspace/src/client/pages/content/AiHotPage.vue")).toBeUndefined();
    expect(viteConfig.build?.chunkSizeWarningLimit).toBe(2000);
  });
});
