import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
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

const QUEUE_EXPANDED_KEY = "hot-now-write-queue-expanded";
beforeEach(() => window.localStorage.removeItem(QUEUE_EXPANDED_KEY));
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.removeItem(QUEUE_EXPANDED_KEY);
});

describe("写作队列最近逐篇结果", () => {
  it("只有 Hermes 允许的内容阻断记录提供强制重写，确认后只投递原编号", async () => {
    window.localStorage.setItem(QUEUE_EXPANDED_KEY, "1");
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue({ ...queueStatus, history: [
      { ...queueStatus.recent[0]!, task_id: "blocked-content", status: "stopped", can_force_rewrite: true, reason_text: "事实复核未通过" },
      { ...queueStatus.recent[0]!, task_id: "technical-failure", can_force_rewrite: false },
    ] });
    const force = vi.spyOn(creativeApi, "forceRewriteQueueTask").mockResolvedValue({ success: true, task_id: "new-manual" });
    const wrapper = mount(WriteQueueStatus, { attachTo: document.body, global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } } });
    try {
      await flushPromises();
      const buttons = [...document.body.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.textContent === "强制重写");
      expect(buttons).toHaveLength(1);
      buttons[0]!.click();
      await flushPromises();
      expect(force).not.toHaveBeenCalled();
      const confirm = [...document.body.querySelectorAll<HTMLButtonElement>(".ant-modal button")].find((button) => button.textContent?.replace(/\s/g, "") === "确认风险并重写")!;
      expect(confirm).toBeTruthy();
      confirm.click();
      await flushPromises();
      expect(force).toHaveBeenCalledExactlyOnceWith("blocked-content");
    } finally { wrapper.unmount(); }
  });

  it("短素材写作列不截断，按钮允许换行并保留完整写作状态", () => {
    const source = readFileSync("src/client/components/creative/source-items/SourceItemsTable.vue", "utf8");
    expect(source).toMatch(/key: "quickCopy"[^\n]*ellipsis: false/);
    expect(source).toContain("!h-auto !whitespace-normal break-words");
    expect(source).toContain('writingIds.has(record.id) ? "写作中"');
    expect(source).not.toContain('"写作中..."');
  });

  it("所有屏幕贴齐右边缘且右侧无圆角，关闭刷新点击区变大，当前取消靠左", () => {
    const source = readFileSync("src/client/components/creative/WriteQueueStatus.vue", "utf8");
    expect(source).toMatch(/\.write-queue-float\s*\{[^}]*right: 0;[^}]*border-radius: 8px 0 0 8px;/);
    expect(source).toMatch(/\.write-queue-dot-btn\s*\{[^}]*border-radius: 8px 0 0 8px;/);
    for (const selector of ["close", "refresh"]) {
      expect(source).toMatch(new RegExp(`\\.write-queue-${selector}\\s*\\{[^}]*width: 44px;[^}]*height: 44px;`));
    }
    expect(source).toMatch(/\.write-queue-cancel-current\s*\{[^}]*align-self: flex-start;[^}]*text-align: left;/);
  });

  it("放大后的刷新和关闭沿用原动作，左侧取消只提交当前任务编号", async () => {
    window.localStorage.setItem(QUEUE_EXPANDED_KEY, "1");
    const read = vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue({
      ...queueStatus, current: { ...queueStatus.recent[1]!, task_id: "current-to-cancel", status: "writing" },
    });
    const cancel = vi.spyOn(creativeApi, "cancelWriteQueueTask").mockResolvedValue({ success: true, status: "cancelling" });
    const wrapper = mount(WriteQueueStatus, { attachTo: document.body, global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } } });
    try {
      await flushPromises();
      const refresh = document.body.querySelector<HTMLButtonElement>(".write-queue-refresh")!;
      expect(refresh.getAttribute("aria-label")).toBe("刷新文章队列");
      refresh.click();
      await flushPromises();
      expect(read).toHaveBeenCalledTimes(2);
      document.body.querySelector<HTMLButtonElement>(".write-queue-cancel-current")!.click();
      await flushPromises();
      expect(cancel).toHaveBeenCalledWith("current-to-cancel");
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(read).toHaveBeenCalledTimes(3);
      const close = document.body.querySelector<HTMLButtonElement>(".write-queue-close")!;
      expect(close.getAttribute("aria-label")).toBe("收起文章队列");
      close.click();
      await wrapper.vm.$nextTick();
      expect(document.body.querySelector(".write-queue-dot-btn")).not.toBeNull();
    } finally { wrapper.unmount(); }
  });
  it("刷新后恢复上次的展开状态，再折叠后仍保持折叠", async () => {
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue(queueStatus);
    // 仅重新挂载浮层模拟刷新，避免测试把服务端队列状态当作界面偏好来源。
    const mountQueue = () => mount(WriteQueueStatus, {
      attachTo: document.body,
      global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } },
    });

    const first = mountQueue();
    await flushPromises();
    expect(document.body.querySelector(".write-queue-dot-btn")).not.toBeNull();
    document.body.querySelector<HTMLButtonElement>(".write-queue-dot-btn")?.click();
    await first.vm.$nextTick();
    expect(window.localStorage.getItem(QUEUE_EXPANDED_KEY)).toBe("1");
    first.unmount();

    const second = mountQueue();
    await flushPromises();
    expect(document.body.querySelector(".write-queue-header")).not.toBeNull();
    document.body.querySelector<HTMLButtonElement>(".write-queue-close")?.click();
    await second.vm.$nextTick();
    expect(window.localStorage.getItem(QUEUE_EXPANDED_KEY)).toBe("0");
    second.unmount();

    const third = mountQueue();
    await flushPromises();
    expect(document.body.querySelector(".write-queue-dot-btn")).not.toBeNull();
    third.unmount();
  });

  it("本地存储不可用时仍能展开队列", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue(queueStatus);
    const wrapper = mount(WriteQueueStatus, {
      attachTo: document.body,
      global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } },
    });
    await flushPromises();
    document.body.querySelector<HTMLButtonElement>(".write-queue-dot-btn")?.click();
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector(".write-queue-header")).not.toBeNull();
    wrapper.unmount();
  });

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
        { ...queueStatus.recent![1], task_id: "h-sqlite-utc", finished_at: "2026-08-20 16:10:00", finished_article_id: 2402 },
        { ...queueStatus.recent![1], task_id: "h-yesterday", finished_at: "2026-08-19T15:10:00Z", finished_article_id: 2400 },
      ],
      day_counts: [
        { day_key: "2026-08-21", article_count: 41, source_count: 259 },
        { day_key: "2026-08-20", article_count: 38, source_count: 180 },
        { day_key: "2026-08-19", article_count: 30, source_count: 150 },
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
    expect(document.body.textContent).toContain("2026-08-21（周五） · 文章 41 · 素材 259");
    expect(document.body.textContent).toContain("2026-08-20（周四） · 文章 38 · 素材 180");
    expect(document.body.textContent).toContain("2026-08-19");
    const articleLink = [...document.body.querySelectorAll<HTMLButtonElement>(".write-queue-link")]
      .find((button) => button.textContent?.includes("成品 #2401"));
    expect(articleLink).toBeTruthy();
    articleLink?.click();
    await flushPromises();
    expect(creativeApi.readCreativeFinishedArticle).toHaveBeenCalledWith(2401);
    wrapper.unmount();
  });

  it("读取成品时立即打开加载弹窗，关闭后迟到响应不重新打开", async () => {
    window.localStorage.setItem(QUEUE_EXPANDED_KEY, "1");
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue(queueStatus);
    let finish!: (value: creativeApi.CreativeFinishedArticle) => void;
    vi.spyOn(creativeApi, "readCreativeFinishedArticle").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const wrapper = mount(WriteQueueStatus, { attachTo: document.body, global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } } });
    try {
      await flushPromises();
      const link = [...document.body.querySelectorAll<HTMLButtonElement>(".write-queue-link")].find((button) => button.textContent?.includes("成品 #2401"));
      link?.click();
      await flushPromises();
      const drawer = wrapper.findComponent({ name: "ArticleDetailDrawer" });
      expect(drawer.props()).toMatchObject({ open: true, loading: true, article: null });
      drawer.vm.$emit("update:open", false);
      finish({ id: 2401 } as creativeApi.CreativeFinishedArticle);
      await flushPromises();
      expect(drawer.props()).toMatchObject({ open: false, loading: false, article: null });
    } finally { wrapper.unmount(); }
  });

  it("当前自动任务和历史素材编号均可打开相同的平台素材详情", async () => {
    window.localStorage.setItem(QUEUE_EXPANDED_KEY, "1");
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue({
      ...queueStatus, current: { ...queueStatus.recent[1]!, status: "writing", task_kind: "short_content_auto" },
    });
    const wrapper = mount(WriteQueueStatus, { attachTo: document.body,
      global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } } });
    try {
      await flushPromises();
      const link = document.body.querySelector<HTMLButtonElement>(".write-queue-current button.write-queue-id");
      expect(link?.textContent).toContain("素材 #101");
      link?.click();
      await flushPromises();
      expect(wrapper.findComponent({ name: "SourceItemDetailModal" }).props()).toMatchObject({ visible: true, sourceItemId: 101 });
      expect(document.body.querySelector(".write-queue-history")?.textContent).toContain("素材 #101");
    } finally { wrapper.unmount(); }
  });

  it("当前导语任务展示冷却原因与时间，不再误导为执行或卡死", async () => {
    window.localStorage.setItem(QUEUE_EXPANDED_KEY, "1");
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue({
      ...queueStatus,
      current: { ...queueStatus.recent[0]!, task_id: "intro-current", status: "writing", phase_name: "等待 Luna" },
      luna: { status: "running", active: true, paused: true, reason: "account_unavailable", remaining_seconds: 300 },
    });
    const wrapper = mount(WriteQueueStatus, { attachTo: document.body,
      global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } } });
    try {
      await flushPromises();
      const text = document.body.querySelector('[data-testid="queue-current-state"]')?.textContent;
      expect(text).toContain("未确认额度耗尽");
      expect(text).toContain("后尝试恢复");
      expect(text).not.toContain("等待 Luna");
      expect(document.body.textContent).toContain("任务已耗时");
      expect(document.body.textContent).toContain("含等待");
    } finally { wrapper.unmount(); }
  });

  it("当前任务获得租约后显示处理中而不是等待 Luna", async () => {
    window.localStorage.setItem(QUEUE_EXPANDED_KEY, "1");
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue({
      ...queueStatus,
      current: { ...queueStatus.recent[0]!, task_id: "intro-current", status: "writing", phase_name: "等待 Luna" },
      luna: { status: "running", active: true, task_id: "intro-current" },
    });
    const wrapper = mount(WriteQueueStatus, { attachTo: document.body,
      global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } } });
    try {
      await flushPromises();
      expect(document.body.querySelector('[data-testid="queue-current-state"]')?.textContent).toContain("已获得 Luna 资源");
      expect(document.body.textContent).not.toContain("当前阶段：等待 Luna");
    } finally { wrapper.unmount(); }
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
