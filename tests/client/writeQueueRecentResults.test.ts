import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

import WriteQueueStatus from "../../src/client/components/creative/WriteQueueStatus.vue";
import MonitorPage from "../../src/client/pages/creative/MonitorPage.vue";
import * as creativeApi from "../../src/client/services/creativeApi.js";

const queueStatus = {
  current: null,
  queue_length: 0,
  queue: [],
  stats: { total_submitted: 2, total_completed: 1, total_failed: 1 },
  recent: [
    {
      task_id: "h2", label: "手动写作", priority: "high" as const,
      source_item_id: 102, status: "failed" as const,
      submitted_at: "2026-08-20T10:00:00+08:00", started_at: "2026-08-20T10:00:01+08:00",
      finished_at: "2026-08-20T10:01:00+08:00", stop_step_name: "口述底稿生成",
      error: "Luna 调用失败",
    },
    {
      task_id: "h1", label: "手动写作", priority: "high" as const,
      source_item_id: 101, status: "done" as const,
      submitted_at: "2026-08-20T09:00:00+08:00", started_at: "2026-08-20T09:00:01+08:00",
      finished_at: "2026-08-20T09:10:00+08:00", finished_article_id: 2401,
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("写作队列最近逐篇结果", () => {
  it("浮标展开后展示成功成品和失败阶段原因", async () => {
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue(queueStatus);
    const wrapper = mount(WriteQueueStatus, {
      attachTo: document.body,
      global: { stubs: { SourceItemDetailModal: true } },
    });
    await flushPromises();
    const toggle = document.body.querySelector<HTMLButtonElement>(".write-queue-dot-btn");
    expect(toggle).not.toBeNull();
    toggle?.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain("最近结果");
    expect(document.body.textContent).toContain("成品 #2401");
    expect(document.body.textContent).toContain("口述底稿生成：Luna 调用失败");
    wrapper.unmount();
  });

  it("监控页持续展示逐篇终态而不是任务结束后只显示空闲", async () => {
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue(queueStatus);
    const wrapper = mount(MonitorPage, {
      global: {
        stubs: {
          MonitorStatsCards: true, MonitorRunsTable: true, MonitorItemsTable: true,
          MonitorSwitches: true, CodexTaskQueue: true, CodexConsumption: true,
          SourceItemDetailModal: true, ArticleDetailDrawer: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="monitor-write-queue-recent"]').text()).toContain("成品 #2401");
    expect(wrapper.text()).toContain("口述底稿生成：Luna 调用失败");
    wrapper.unmount();
  });
});
