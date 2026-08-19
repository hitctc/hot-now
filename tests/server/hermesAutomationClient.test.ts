import { afterEach, describe, expect, it, vi } from "vitest";

import { isHermesAutomationAllowed } from "../../src/server/hermesAutomationClient.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Hermes automation stage permission", () => {
  it("只接受 Hermes 返回的 running + effective=true", async () => {
    vi.stubEnv("HERMES_API_BASE_URL", "https://hermes.test");
    vi.stubEnv("HERMES_API_TOKEN", "token");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      mode: "running",
      stages: { collection: { effective: true }, notifications: { effective: false } }
    }), { status: 200 })));

    await expect(isHermesAutomationAllowed("collection")).resolves.toBe(true);
    await expect(isHermesAutomationAllowed("notifications")).resolves.toBe(false);
  });

  it("Hermes 不可达时自动任务安全关闭", async () => {
    vi.stubEnv("HERMES_API_BASE_URL", "https://hermes.test");
    vi.stubEnv("HERMES_API_TOKEN", "token");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connection refused"); }));

    await expect(isHermesAutomationAllowed("collection")).resolves.toBe(false);
  });
});
