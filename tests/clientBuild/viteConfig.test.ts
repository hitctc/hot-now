import { describe, expect, it } from "vitest";
import type { PluginOption } from "vite";

import { CLIENT_ASSET_BASE } from "../../src/client/appBases";
import { createClientViteConfig } from "../../vite.config";

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

describe("vite client config", () => {
  it("enables vue devtools only for the dev server config", () => {
    const serveConfig = createClientViteConfig({ command: "serve" });
    const buildConfig = createClientViteConfig({ command: "build" });
    const servePluginNames = readPluginNames(serveConfig.plugins);
    const buildPluginNames = readPluginNames(buildConfig.plugins);

    expect(servePluginNames.some((pluginName) => pluginName.includes("vue-devtools"))).toBe(true);
    expect(buildPluginNames.some((pluginName) => pluginName.includes("vue-devtools"))).toBe(false);
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
