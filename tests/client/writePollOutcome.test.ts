import { describe, expect, it } from "vitest";

import type { WriteQueueStatus } from "../../src/client/services/creativeApi.js";
import { resolveWritePollOutcome } from "../../src/client/utils/writePollOutcome.js";

function makeQueueStatus(): WriteQueueStatus {
  return {
    current: null,
    queue_length: 0,
    queue: [],
    recent: [
      {
        task_id: "h1",
        label: "手动写作 素材#10017",
        priority: "high",
        source_item_id: 10017,
        status: "stopped",
        submitted_at: "2026-07-30T11:56:45+08:00",
        started_at: "2026-07-30T11:56:45+08:00",
        finished_at: "2026-07-30T11:56:54+08:00",
        stop_step: 2,
        reason_text: "与普通人没有现实关联",
      },
    ],
    stats: {
      total_submitted: 1,
      total_completed: 0,
      total_failed: 0,
      total_stopped: 1,
    },
  };
}

describe("resolveWritePollOutcome", () => {
  it("任务快速中止后仍返回具体阶段和原因", () => {
    expect(resolveWritePollOutcome(10017, "ready", "h1", makeQueueStatus())).toEqual({
      kind: "stopped",
      step: 2,
      reason: "与普通人没有现实关联",
    });
  });

  it("没有队列历史时也不会让 skipped 永久处于等待中", () => {
    expect(resolveWritePollOutcome(10017, "skipped", undefined, null)).toEqual({
      kind: "stopped",
      reason: "未通过写作质量闸门",
    });
  });
});
