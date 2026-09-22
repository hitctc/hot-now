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
      global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } },
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

  it("按北京时间分组历史记录并可打开成品详情", async () => {
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue({
      ...queueStatus,
      recent: [],
      history: [
        { ...queueStatus.recent![1], task_id: "h-today", finished_at: "2026-08-20T15:10:00Z", finished_article_id: 2401 },
        { ...queueStatus.recent![1], task_id: "h-yesterday", finished_at: "2026-08-19T15:10:00Z", finished_article_id: 2400 },
      ],
    });
    vi.spyOn(creativeApi, "readCreativeFinishedArticle").mockResolvedValue({ id: 2401 } as never);
    const wrapper = mount(WriteQueueStatus, {
      attachTo: document.body,
      global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } },
    });
    await flushPromises();
    document.body.querySelector<HTMLButtonElement>(".write-queue-dot-btn")?.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain("北京时间 00:00–23:59");
    expect(document.body.textContent).toContain("2026-08-20");
    expect(document.body.textContent).toContain("2026-08-19");
    const articleLink = [...document.body.querySelectorAll<HTMLButtonElement>(".write-queue-link")]
      .find((button) => button.textContent?.includes("成品 #2401"));
    expect(articleLink).toBeTruthy();
    articleLink?.click();
    await flushPromises();
    expect(creativeApi.readCreativeFinishedArticle).toHaveBeenCalledWith(2401);
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
