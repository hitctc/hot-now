import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { flushPromises, mount } from "@vue/test-utils";

import WriteQueueStatus from "../../src/client/components/creative/WriteQueueStatus.vue";
import MonitorPage from "../../src/client/pages/creative/MonitorPage.vue";
import * as creativeApi from "../../src/client/services/creativeApi.js";
import * as settingsApi from "../../src/client/services/settingsApi.js";

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
const EMPTY_SHORT_WRITE_SCHEDULE = {
  batch_started_at: null,
  prepared: false,
  pending_item_id: null,
  candidates: [],
  replaced: [],
};
beforeEach(() => {
  window.localStorage.removeItem(QUEUE_EXPANDED_KEY);
  vi.spyOn(creativeApi, "readShortWriteSchedule").mockResolvedValue(EMPTY_SHORT_WRITE_SCHEDULE);
  vi.spyOn(settingsApi, "readWriteQueuePreferences").mockResolvedValue({ preferences: null });
  vi.spyOn(settingsApi, "saveWriteQueuePreferences").mockImplementation(async (preferences) => ({ ok: true, preferences }));
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.removeItem(QUEUE_EXPANDED_KEY);
});

describe("写作队列最近逐篇结果", () => {
  it("首次迁移沿用浏览器展开状态并保存账号偏好", async () => {
    window.localStorage.setItem(QUEUE_EXPANDED_KEY, "1");
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue(queueStatus);
    const wrapper = mount(WriteQueueStatus, { attachTo: document.body, global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } } });
    try {
      await flushPromises();
      expect(document.body.querySelector(".write-queue-header")).not.toBeNull();
      expect(settingsApi.saveWriteQueuePreferences).toHaveBeenCalledWith({ embedded: false, width: 350, expanded: true });
    } finally { wrapper.unmount(); }
  });

  it("刷新按钮左侧的入口可切换悬浮与右侧嵌入", async () => {
    vi.spyOn(settingsApi, "readWriteQueuePreferences").mockResolvedValue({
      preferences: { embedded: false, width: 350, expanded: true },
    });
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue(queueStatus);
    const wrapper = mount(WriteQueueStatus, { attachTo: document.body, global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } } });
    try {
      await flushPromises();
      const dockButton = document.body.querySelector<HTMLButtonElement>(".write-queue-dock-toggle");
      expect(dockButton?.nextElementSibling?.classList.contains("write-queue-refresh")).toBe(true);
      expect(dockButton?.getAttribute("aria-label")).toBe("嵌入到页面右侧");

      dockButton?.click();
      await flushPromises();
      expect(document.body.querySelector(".write-queue-float--embedded")).not.toBeNull();
      expect(settingsApi.saveWriteQueuePreferences).toHaveBeenLastCalledWith({ embedded: true, width: 350, expanded: true });

      document.body.querySelector<HTMLButtonElement>(".write-queue-dock-toggle")?.click();
      await flushPromises();
      expect(document.body.querySelector(".write-queue-float--embedded")).toBeNull();
      expect(settingsApi.saveWriteQueuePreferences).toHaveBeenLastCalledWith({ embedded: false, width: 350, expanded: true });
    } finally { wrapper.unmount(); }
  });

  it("账号偏好控制嵌入宽度，收起后保留嵌入模式并可恢复", async () => {
    vi.spyOn(settingsApi, "readWriteQueuePreferences").mockResolvedValue({
      preferences: { embedded: true, width: 450, expanded: true },
    });
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue(queueStatus);
    const wrapper = mount(WriteQueueStatus, { attachTo: document.body, global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } } });
    try {
      await flushPromises();
      const panel = document.body.querySelector<HTMLElement>(".write-queue-float--embedded");
      expect(panel?.parentElement).not.toBe(document.body);
      expect(panel?.style.getPropertyValue("--write-queue-width")).toBe("450px");
      expect(panel?.querySelectorAll("[data-queue-width]")).toHaveLength(4);

      panel?.querySelector<HTMLButtonElement>('[data-queue-width="550"]')?.click();
      await flushPromises();
      expect(panel?.style.getPropertyValue("--write-queue-width")).toBe("550px");
      expect(settingsApi.saveWriteQueuePreferences).toHaveBeenLastCalledWith({ embedded: true, width: 550, expanded: true });

      panel?.querySelector<HTMLButtonElement>(".write-queue-close")?.click();
      await wrapper.vm.$nextTick();
      expect(document.body.querySelector(".write-queue-float--embedded.write-queue-float--collapsed")).not.toBeNull();
      document.body.querySelector<HTMLButtonElement>(".write-queue-dot-btn")?.click();
      await wrapper.vm.$nextTick();
      expect(document.body.querySelector(".write-queue-float--embedded.write-queue-float--collapsed")).toBeNull();
    } finally { wrapper.unmount(); }
  });
  it("完整展示当前批次未入队候选，保持原顺位并在刷新后替换新批次内容", async () => {
    window.localStorage.setItem(QUEUE_EXPANDED_KEY, "1");
    const readSchedule = vi.spyOn(creativeApi, "readShortWriteSchedule")
      .mockResolvedValueOnce({
        batch_started_at: "2026-10-08T09:00:00+08:00",
        prepared: true,
        pending_item_id: 901,
        pending_source_external_id: "pending-external",
        candidates: [
          { item_id: 901, source_external_id: "pending-external", position: 1, hotnow_source_item_id: 201, source_item_title: "这是一整条待写作标题，不能被截断", source_item_source_name: "来源甲" },
          { item_id: 902, source_external_id: "already-queued", position: 2, hotnow_source_item_id: 202, source_item_title: "已在实际队列中的标题" },
          { item_id: 903, source_external_id: "next-external", position: 3, hotnow_source_item_id: 203, source_item_title: "仍待写的下一条候选" },
        ],
        replaced: [],
      })
      .mockResolvedValueOnce({
        batch_started_at: "2026-10-08T10:00:00+08:00",
        prepared: true,
        pending_item_id: null,
        candidates: [{ item_id: 904, source_external_id: "new-batch", position: 1, hotnow_source_item_id: 204, source_item_title: "新时段更新后的候选内容" }],
        replaced: [],
      });
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue({
      ...queueStatus,
      current: { ...queueStatus.recent[1]!, task_id: "current-task", status: "writing", source_item_id: 201, source_external_id: "current-external" },
      queue: [{ ...queueStatus.recent[1]!, task_id: "queued-task", status: "queued", source_item_id: 202, source_external_id: "already-queued", source_item_title: "已在实际队列中的标题" }],
      queue_length: 1,
    });
    const wrapper = mount(WriteQueueStatus, { attachTo: document.body,
      global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } } });
    try {
      await flushPromises();
      const body = document.body.querySelector(".write-queue-body")!;
      const candidates = body.querySelector('[data-testid="queue-short-write-candidates"]')!;
      expect(candidates.textContent).toContain("这是一整条待写作标题，不能被截断");
      expect(candidates.textContent).toContain("仍待写的下一条候选");
      expect(candidates.textContent).toContain("投递确认中 · 候选第 1 位");
      expect(candidates.textContent).toContain("自动候选 · 第 3 位");
      expect(candidates.textContent).not.toContain("已在实际队列中的标题");
      expect(body.querySelectorAll(".write-queue-candidate")).toHaveLength(2);
      expect(body.querySelector(".write-queue-list")!.compareDocumentPosition(candidates) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(candidates.compareDocumentPosition(body.querySelector(".write-queue-history")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      document.body.querySelector<HTMLButtonElement>(".write-queue-refresh")!.click();
      await flushPromises();
      expect(readSchedule).toHaveBeenCalledTimes(2);
      expect(body.textContent).toContain("新时段更新后的候选内容");
      expect(body.textContent).not.toContain("仍待写的下一条候选");
    } finally { wrapper.unmount(); }
  });

  it("按采集时间段合并当批候选和自动排队/写作任务，人工任务仍留在高优先级队列展示", async () => {
    window.localStorage.setItem(QUEUE_EXPANDED_KEY, "1");
    const batchStartedAt = "2026-10-08T09:00:00+08:00";
    vi.spyOn(creativeApi, "readShortWriteSchedule").mockResolvedValue({
      batch_started_at: batchStartedAt,
      batch_collection_interval_minutes: 60,
      batch_period_ends_at: "2026-10-08T10:00:00+08:00",
      cycle_submitted_count: 1,
      cycle_write_limit: 10,
      cycle_remaining_slots: 9,
      prepared: true,
      pending_item_id: null,
      candidates: [{ item_id: 910, source_external_id: "pending-item", position: 1, hotnow_source_item_id: 210, source_item_title: "本周期待写候选" }],
      replaced: [],
      short_write_tasks: [{ task_id: "auto-writing", source_external_id: "writing-item", task_kind: "short_content_auto", status: "writing", batch_started_at: batchStartedAt, collection_interval_minutes: 60 }],
    });
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue({
      ...queueStatus,
      current: {
        ...queueStatus.recent[1]!, task_id: "auto-writing", priority: "normal", source_item_id: 211,
        source_external_id: "writing-item", task_kind: "short_content_auto", status: "writing",
        source_item_title: "本周期正在写作素材",
      },
      queue: [{
        ...queueStatus.recent[1]!, task_id: "manual-short", priority: "high", source_item_id: 212,
        task_kind: "short_content", status: "queued", source_item_title: "人工短内容任务",
      }],
      queue_length: 1,
    });
    const wrapper = mount(WriteQueueStatus, { attachTo: document.body,
      global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } } });
    try {
      await flushPromises();
      const body = document.body.querySelector(".write-queue-body")!;
      const periods = body.querySelectorAll('[data-testid="queue-short-write-period"]');
      expect(periods).toHaveLength(1);
      expect(periods[0]!.textContent).toContain("10/08 09:00–10/08 10:00");
      expect(periods[0]!.textContent).toContain("本周期已受理 1/10 篇");
      expect(periods[0]!.textContent).toContain("本周期正在写作素材");
      expect(periods[0]!.textContent).toContain("正在写作");
      expect(periods[0]!.textContent).toContain("本周期待写候选");
      expect(periods[0]!.querySelector("button.write-queue-link")?.textContent).toContain("素材 #211");
      expect(body.querySelector(".write-queue-current")).toBeNull();
      expect(body.querySelector(".write-queue-list")?.textContent).toContain("人工短内容任务");
      expect(body.textContent).not.toContain("批次 10/08 09:00");
    } finally { wrapper.unmount(); }
  });

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
    expect(source).toMatch(/\.write-queue-control\s*\{[^}]*width: 44px;[^}]*height: 44px;[^}]*border: 1px solid #e5e7eb;/);
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
      const headerActions = document.body.querySelector(".write-queue-header-actions")!;
      expect([...headerActions.children].map(button => button.getAttribute("aria-label"))).toEqual(["嵌入到页面右侧", "刷新文章队列", "收起文章队列"]);
      expect(headerActions.closest(".write-queue-header")).not.toBeNull();
      expect([...headerActions.children].every(button => button.classList.contains("write-queue-control"))).toBe(true);
      expect(headerActions.children[0]?.nextElementSibling).toBe(refresh);
      expect(document.body.querySelector(".write-queue-footer button")).toBeNull();
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
  it("桌面嵌入侧栏填满视口，队列区使用剩余高度滚动", () => {
    const source = readFileSync("src/client/components/creative/WriteQueueStatus.vue", "utf8");
    const embedded = source.match(/\.write-queue-float--embedded\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(embedded).toMatch(/^\s*height: 100dvh;$/m);
    expect(embedded).toContain("max-height: 100dvh;");
    expect(source).toMatch(/\.write-queue-body\s*\{[^}]*flex: 1 1 auto;[^}]*min-height: 0;[^}]*overflow-y: auto;/);
  });

  it("移动端限制动态视口高度，多状态只在中间滚动且头尾操作保持可见", async () => {
    const source = readFileSync("src/client/components/creative/WriteQueueStatus.vue", "utf8");
    // DOM 测试不计算手机实际像素，断言动态高度、安全区及唯一内容滚动区的约束。
    expect(source).toMatch(/\.write-queue-float\s*\{[^}]*display: flex;[^}]*flex-direction: column;[^}]*overflow: hidden;/);
    expect(source).toMatch(/\.write-queue-body\s*\{[^}]*flex: 1 1 auto;[^}]*min-height: 0;[^}]*overflow-y: auto;/);
    expect(source).toContain('<Teleport to="body" :disabled="embedded">');
    expect(source).toMatch(/@media \(min-width: 901px\)\s*\{[^}]*\.write-queue-float--embedded\s*\{[^}]*flex: 0 0 var\(--write-queue-width\);[^}]*width: var\(--write-queue-width\);/);
    expect(source).toMatch(/@media \(max-width: 900px\)\s*\{\s*\.write-queue-dock-toggle,\s*\.write-queue-width-picker\s*\{\s*display: none;/);
    const mobile = source.split("@media (max-width: 768px)")[1] ?? "";
    expect(mobile).toContain("100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 8px");
    expect(mobile).toContain("bottom: env(safe-area-inset-bottom, 0px)");
    expect(mobile).toMatch(/\.write-queue-list,\s*\.write-queue-candidates,\s*\.write-queue-history\s*\{[^}]*max-height: none;[^}]*overflow-y: visible;/);
    expect(source).toMatch(/\.write-queue-header\s*\{[^}]*flex-shrink: 0;/);
    expect(source).toMatch(/\.write-queue-footer\s*\{[^}]*flex-shrink: 0;/);
    window.localStorage.setItem(QUEUE_EXPANDED_KEY, "1");
    vi.spyOn(creativeApi, "fetchWriteQueueStatus").mockResolvedValue({ ...queueStatus,
      current: { ...queueStatus.recent[1]!, status: "writing" },
      queue: Array.from({ length: 30 }, (_, index) => ({ ...queueStatus.recent[1]!, task_id: `pending-${index}`, status: "queued" as const })), queue_length: 30,
      history: Array.from({ length: 40 }, (_, index) => ({ ...queueStatus.recent[0]!, task_id: `failed-${index}`, error: `Luna 调用失败：${"详细错误说明".repeat(30)}` })),
      status_delayed: true, status_message: "状态延迟，仍保留上次任务",
    });
    const wrapper = mount(WriteQueueStatus, { attachTo: document.body, global: { stubs: { SourceItemDetailModal: true, ArticleDetailDrawer: true } } });
    try {
      await flushPromises();
      const body = document.body.querySelector(".write-queue-body")!;
      for (const selector of [".write-queue-current", ".write-queue-list", ".write-queue-history", ".write-queue-delay"]) {
        expect(body.querySelector(selector)).not.toBeNull();
      }
      expect(body.previousElementSibling?.classList.contains("write-queue-header")).toBe(true);
      expect(body.nextElementSibling?.classList.contains("write-queue-footer")).toBe(true);
      expect(body.textContent).toContain("Luna 调用失败");
      expect(body.querySelectorAll(".write-queue-task")).toHaveLength(30);
      expect(body.querySelectorAll(".write-queue-history-item")).toHaveLength(40);
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
