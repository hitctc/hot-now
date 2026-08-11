import { describe, expect, it, vi } from "vitest";
import { createRuntimeServerDeps } from "../../src/app/createRuntimeServerDeps.js";
import type { CreativeAutomationService } from "../../src/core/creative/creativeAutomationService.js";
import type { SqliteDatabase } from "../../src/core/db/openDatabase.js";
import type { RuntimeConfig } from "../../src/core/types/appConfig.js";

describe("createRuntimeServerDeps", () => {
  it("保留启动层传入的手动任务与既有图片目录约定", () => {
    const db = {
      prepare: vi.fn(() => ({ get: vi.fn() }))
    } as unknown as SqliteDatabase;
    const triggerManualCollect = async () => ({ accepted: true as const, action: "collect" as const });
    const creativeAutomation = {} as CreativeAutomationService;
    const config = {
      database: { file: "/tmp/hot-now/hot-now.sqlite" },
      auth: { sessionSecret: "session-secret", sessionTtlSeconds: 3600 }
    } as RuntimeConfig;

    const deps = createRuntimeServerDeps({
      db,
      config,
      creativeApiToken: "creative-token",
      creativeAutomation,
      clientDevOrigin: "http://localhost:5173",
      hasTwitterApiKey: true,
      isRunning: () => false,
      triggerManualCollect
    });

    expect(db.prepare).toHaveBeenCalledTimes(2);
    expect(deps.db).toBe(db);
    expect(deps.creativeApiToken).toBe("creative-token");
    expect(deps.creativeAutomation).toBe(creativeAutomation);
    expect(deps.creativeImageDir).toBe("/tmp/hot-now/creative-images");
    expect(deps.clientDevOrigin).toBe("http://localhost:5173");
    expect(deps.hasTwitterApiKey).toBe(true);
    expect(deps.triggerManualCollect).toBe(triggerManualCollect);
    expect(deps.triggerManualRun).toBe(triggerManualCollect);
  });
});
