import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MonitorSwitches from "../../src/client/components/monitor/MonitorSwitches.vue";

const serviceMocks = vi.hoisted(() => ({
  fetchCreativeAutomationStatus: vi.fn(),
  triggerCreativeDailyPlan: vi.fn(),
  updateCreativeAutomationControl: vi.fn(),
  fetchMonitorStats: vi.fn(),
  updateSwitch: vi.fn(),
}));

vi.mock("../../src/client/services/creativeApi.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/creativeApi.js")>(
    "../../src/client/services/creativeApi.js",
  );
  return { ...actual, ...serviceMocks };
});

vi.mock("../../src/client/services/monitorApi.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/monitorApi.js")>(
    "../../src/client/services/monitorApi.js",
  );
  return { ...actual, fetchMonitorStats: serviceMocks.fetchMonitorStats, updateSwitch: serviceMocks.updateSwitch };
});

const status = {
  ok: true,
  mode: "running" as const,
  modeLabel: "运行中",
  manualAllowed: true,
  stages: {
    collection: { label: "素材采集", enabled: true, effective: true },
    base_scoring: { label: "基础评分与筛选", enabled: true, effective: true },
    account_fit: { label: "账号适配评估", enabled: true, effective: true },
    long_write: { label: "自动长文写作", enabled: true, effective: true },
    short_write: { label: "自动短内容写作", enabled: true, effective: true },
    images: { label: "自动图片生成", enabled: false, effective: false },
    daily_digest: { label: "日报", enabled: true, effective: true },
    reminders: { label: "提醒", enabled: true, effective: true },
    notifications: { label: "邮件与通知", enabled: true, effective: true },
  },
  config: {
    dailyLongWriteCount: 3,
    dailyLongWriteTime: "10:00",
    windowHours: 48,
    baseScoreThreshold: 80,
    trendScoreThreshold: 80,
    timezone: "Asia/Shanghai",
  },
  dailyPlan: {
    plan_date: "2026-08-20",
    scheduled_at: "2026-08-20T10:00:00+08:00",
    target_count: 3,
    model_snapshot: "gpt-5.6-luna",
    status: "ready",
    cycle: {
      planDate: "2026-08-20",
      scheduledAt: "2026-08-20T10:00:00+08:00",
      timezone: "Asia/Shanghai",
    },
    slots: { capacity: 3, occupied: 1, vacant: 2, selected: 0, dispatching: 0, queued: 0, writing: 0, retry_waiting: 1 },
    results: { succeeded: 1, blocked: 0, retryExhausted: 0 },
    items: [{
      sourceItemId: 16641,
      title: "失败素材标题",
      status: "retry_waiting",
      occupiesSlot: true,
      executionAttempts: 1,
      maxExecutionAttempts: 2,
      attemptHistory: [],
      failureKind: "technical",
      failureStepName: "搜索策略",
      lastError: "Codex CLI 并发锁等待超时",
      updatedAt: "2026-08-19T17:00:00+08:00",
    }],
    lastRun: {
      planDate: "2026-08-19",
      triggeredAt: "2026-08-19T17:00:00+08:00",
      triggerKind: "manual",
      items: [{
        sourceItemId: 16583,
        title: "成功素材标题",
        status: "succeeded",
        occupiesSlot: false,
        executionAttempts: 1,
        maxExecutionAttempts: 2,
        attemptHistory: [],
        finishedArticleId: 2374,
      }],
    },
  },
};

beforeEach(() => {
  serviceMocks.fetchCreativeAutomationStatus.mockResolvedValue(structuredClone(status));
  serviceMocks.fetchMonitorStats.mockResolvedValue({ switches: { image_gen_mode: "codex-auto", image_provider: "aitechflux" } });
  serviceMocks.triggerCreativeDailyPlan.mockResolvedValue({
    ok: true,
    status: "running",
    submitted: 2,
    newSubmitted: 1,
    retrySubmitted: 1,
    plan: structuredClone(status.dailyPlan),
  });
  serviceMocks.updateCreativeAutomationControl.mockResolvedValue(structuredClone(status));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("MonitorSwitches 每轮长文计划", () => {
  it("展示槽位、失败原因、最近成功结果和成品入口", async () => {
    const wrapper = mount(MonitorSwitches, { global: { plugins: [Antd] } });
    await flushPromises();

    expect(wrapper.get('[data-testid="daily-plan-summary"]').text()).toContain("槽位占用 1/3");
    expect(wrapper.get('[data-testid="daily-plan-summary"]').text()).toContain("空位 2");
    expect(wrapper.get('[data-testid="daily-plan-items"]').text()).toContain("待重试");
    expect(wrapper.get('[data-testid="daily-plan-items"]').text()).toContain("Codex CLI 并发锁等待超时");
    expect(wrapper.get('[data-testid="daily-plan-last-run"]').text()).toContain("已成功");
    expect(wrapper.get('[data-testid="daily-plan-last-run"]').text()).toContain("查看成品 #2374");

    wrapper.unmount();
  });

  it("立即执行只提交当前快照并把结果交给页面刷新", async () => {
    const wrapper = mount(MonitorSwitches, { global: { plugins: [Antd] } });
    await flushPromises();
    await wrapper.get('[data-testid="daily-plan-summary"] button').trigger("click");
    await flushPromises();

    expect(serviceMocks.triggerCreativeDailyPlan).toHaveBeenCalledTimes(1);
    expect(serviceMocks.fetchCreativeAutomationStatus).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
