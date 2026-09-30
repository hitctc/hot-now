import { describe, expect, it } from "vitest";
import { describeLunaStatus, describeQueuedTask, describeCurrentTask } from "../../src/client/components/creative/writeQueueStatusPresentation.js";
import type { WriteQueueTask } from "../../src/client/services/creativeApi.js";

const now = Date.parse("2026-09-30T11:00:00Z");
const task: WriteQueueTask = { task_id: "intro-1", label: "人工生成导语", priority: "high", source_item_id: null,
  status: "writing", submitted_at: new Date(now).toISOString(), started_at: new Date(now).toISOString(), phase_name: "等待 Luna" };

describe("队列等待与冷却说明", () => {
  it("账号相关异常不误报额度耗尽，倒计时随时间更新", () => {
    const luna = { status: "running", active: true, paused: true, reason: "account_unavailable", remaining_seconds: 300 };
    const text = describeLunaStatus(luna, now + 65_000, now);
    expect(text).toContain("账号或额度相关异常");
    expect(text).toContain("未确认额度耗尽");
    expect(text).toContain("3分55秒后尝试恢复");
    expect(text).toContain("恢复成功后");
    expect(text).not.toContain("额度不足");
  });
  it("倒计时结束不能宣称模型已恢复或任务已完成", () => {
    expect(describeLunaStatus({ status: "running", active: true, paused: true, remaining_seconds: 30 }, now + 31_000, now))
      .toContain("冷却时间已到，等待服务确认恢复");
  });
  it("调用程序故障和未知故障使用不同原因说明", () => {
    expect(describeLunaStatus({ status: "idle", active: false, paused: true, reason: "cli_unavailable", remaining_seconds: 60 }, now, now))
      .toContain("模型调用程序不可用");
    expect(describeLunaStatus({ status: "idle", active: false, paused: true, reason: "unknown", remaining_seconds: 60 }, now, now))
      .toContain("原因尚未明确");
  });
  it("已有租约时不继续把当前任务描述成等待 Luna", () => {
    expect(describeCurrentTask(task, { status: "running", active: true, task_id: "intro-1" }, now, now))
      .toContain("已获得 Luna 资源，任务处理中");
    expect(describeCurrentTask(task, { status: "running", active: true, task_id: "other" }, now, now))
      .toContain("由其他任务占用");
  });
  it("明确单任务重试时间、让位续跑和未知排队时长", () => {
    expect(describeQueuedTask({ ...task, next_retry_at: new Date(now + 90_000).toISOString() }, undefined, now))
      .toContain("1分30秒后重新排队");
    expect(describeQueuedTask({ ...task, phase_status: "paused", phase_name: "让位人工操作，等待续跑" }, undefined, now))
      .toContain("已保存进度");
    expect(describeQueuedTask(task, undefined, now)).toContain("暂无准确预计时间");
  });
  it("冷却缺少剩余时间和恢复探测状态都不能臆造执行时间", () => {
    expect(describeLunaStatus({ status: "idle", active: false, paused: true }, now, now)).toContain("暂无准确重试时间");
    expect(describeLunaStatus({ status: "idle", active: false, probe: true }, now, now)).toContain("实际可用性以请求结果为准");
  });
});
