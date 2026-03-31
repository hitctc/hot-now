import { describe, expect, it } from "vitest";

import { CLIENT_ASSET_BASE } from "../../src/client/appBases";
import viteConfig from "../../vite.config";

describe("vite client config", () => {
  it("keeps the emitted asset base on /client/", () => {
    expect(viteConfig.base).toBe(CLIENT_ASSET_BASE);
  });
});
