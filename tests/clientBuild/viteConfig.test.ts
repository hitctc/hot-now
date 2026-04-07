import { describe, expect, it } from "vitest";

import { CLIENT_ASSET_BASE } from "../../src/client/appBases";
import viteConfig from "../../vite.config";

describe("vite client config", () => {
  it("keeps the emitted asset base on /client/", () => {
    expect(viteConfig.base).toBe(CLIENT_ASSET_BASE);
  });

  it("splits core vendors into dedicated chunks instead of leaving everything in the entry bundle", () => {
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
