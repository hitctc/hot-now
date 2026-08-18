import { afterEach, describe, expect, it } from "vitest";

import { CreativeAutomationService } from "../../src/core/creative/creativeAutomationService.js";
import { findCreativeSourceItemById } from "../../src/core/creative/creativeSourceItemRepository.js";
import { createServer } from "../../src/server/createServer.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];
afterEach(() => {
  while (handles.length) handles.pop()?.close();
});

describe("creative automation routes", () => {
  it("外部智能体新建长素材时忽略 ready 状态并创建评估任务", async () => {
    const handle = await createTestDatabase("hot-now-automation-route-");
    handles.push(handle);
    const automation = new CreativeAutomationService(handle.db, null, null);
    const app = createServer({ db: handle.db, creativeApiToken: "test-token", creativeAutomation: automation });

    const response = await app.inject({
      method: "POST",
      url: "/api/creative/source-items",
      headers: { "x-creative-token": "test-token" },
      payload: {
        externalId: "agent-created", collectorAgent: "external-agent", title: "新长素材", url: "https://example.com/new", writingStatus: "ready",
      },
    });

    expect(response.statusCode).toBe(201);
    const id = response.json().id as number;
    expect(findCreativeSourceItemById(handle.db, id)?.writingStatus).toBe("pending");
    expect(handle.db.prepare("SELECT job_type, trigger_kind FROM creative_automation_jobs WHERE source_item_id = ?").get(id)).toEqual({
      job_type: "evaluate", trigger_kind: "automatic",
    });
    await app.close();
  });

  it("自动评估开关可独立读取为关闭状态", async () => {
    const handle = await createTestDatabase("hot-now-automation-route-");
    handles.push(handle);
    const automation = new CreativeAutomationService(handle.db, null, null);
    automation.setEnabled("evaluate", false);
    const app = createServer({ db: handle.db, creativeAutomation: automation });

    const status = await app.inject({ method: "GET", url: "/api/creative/automation/status" });
    expect(status.statusCode).toBe(200);
    expect(status.json().autoEvaluateEnabled).toBe(false);
    await app.close();
  });

  it("总开关接口关闭创作自动化并保留细分开关状态", async () => {
    const handle = await createTestDatabase("hot-now-automation-master-route-");
    handles.push(handle);
    const automation = new CreativeAutomationService(handle.db, null, null);
    const app = createServer({ db: handle.db, creativeAutomation: automation });

    const response = await app.inject({
      method: "POST",
      url: "/api/creative/automation/master/enabled",
      payload: { enabled: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      automationEnabled: false,
      autoEvaluateEnabled: true,
      autoWriteEnabled: true,
    });
    await app.close();
  });
});
