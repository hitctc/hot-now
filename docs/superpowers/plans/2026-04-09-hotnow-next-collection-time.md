# HotNow Next Collection Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/settings/sources` 中显示真实的下一次自动采集时间，并用分钟级文案回显剩余时间。

**Architecture:** 后端基于 `collectionSchedule.enabled + intervalMinutes + now` 计算 `nextCollectionRunAt`，通过现有 sources 工作台 `operations` 返回。前端只负责把绝对时间格式化成 `18:40（还有 6 分钟）` 这类文案，并在页面停留时做分钟级刷新，不参与调度计算。

**Tech Stack:** Node.js, TypeScript, Fastify, Vue 3, Vitest

---

### Task 1: 补齐下一次采集触发点的后端读模型

**Files:**
- Create: `src/core/scheduler/readNextCollectionRunAt.ts`
- Modify: `src/server/createServer.ts`
- Modify: `src/client/services/settingsApi.ts`
- Test: `tests/server/settingsApiRoutes.test.ts`
- Test: `tests/core/scheduler/readNextCollectionRunAt.test.ts`

- [ ] **Step 1: 写后端时间计算测试**

```ts
import { describe, expect, it } from "vitest";
import { readNextCollectionRunAt } from "../../../src/core/scheduler/readNextCollectionRunAt.js";

describe("readNextCollectionRunAt", () => {
  it("returns the next future boundary for a 10-minute collection schedule", () => {
    const result = readNextCollectionRunAt(
      {
        enabled: true,
        intervalMinutes: 10
      },
      new Date("2026-04-09T18:34:00+08:00")
    );

    expect(result).toBe("2026-04-09T10:40:00.000Z");
  });

  it("returns null when collection schedule is disabled", () => {
    const result = readNextCollectionRunAt(
      {
        enabled: false,
        intervalMinutes: 10
      },
      new Date("2026-04-09T18:34:00+08:00")
    );

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认当前失败**

Run: `npx vitest run tests/core/scheduler/readNextCollectionRunAt.test.ts`

Expected: FAIL，提示 `Cannot find module '../../../src/core/scheduler/readNextCollectionRunAt.js'`

- [ ] **Step 3: 写最小 helper 实现**

```ts
type CollectionScheduleLike = {
  enabled: boolean;
  intervalMinutes: number;
};

export function readNextCollectionRunAt(
  schedule: CollectionScheduleLike,
  now: Date = new Date()
): string | null {
  if (!schedule.enabled) {
    return null;
  }

  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(Math.floor(next.getMinutes() / schedule.intervalMinutes) * schedule.intervalMinutes, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setMinutes(next.getMinutes() + schedule.intervalMinutes);
  }

  return next.toISOString();
}
```

- [ ] **Step 4: 把字段接进 sources API 读模型**

```ts
import { readNextCollectionRunAt } from "./core/scheduler/readNextCollectionRunAt.js";
```

```ts
const nextCollectionRunAt = readNextCollectionRunAt(config.collectionSchedule);

return {
  canTriggerManualCollect: typeof (deps.triggerManualCollect ?? deps.triggerManualRun) === "function",
  canTriggerManualSendLatestEmail: typeof deps.triggerManualSendLatestEmail === "function",
  isRunning: deps.isRunning?.() ?? false,
  lastCollectionRunAt: operationSummary.lastCollectionRunAt,
  lastSendLatestEmailAt: operationSummary.lastSendLatestEmailAt,
  nextCollectionRunAt
};
```

```ts
export type SettingsSourcesOperations = {
  lastCollectionRunAt: string | null;
  lastSendLatestEmailAt: string | null;
  nextCollectionRunAt: string | null;
  canTriggerManualCollect: boolean;
  canTriggerManualSendLatestEmail: boolean;
  isRunning: boolean;
};
```

- [ ] **Step 5: 给路由测试补字段断言**

```ts
expect(response.json()).toMatchObject({
  operations: {
    lastCollectionRunAt: "2026-03-31T03:00:00.000Z",
    lastSendLatestEmailAt: "2026-03-31T03:10:00.000Z",
    nextCollectionRunAt: expect.any(String),
    canTriggerManualCollect: true,
    canTriggerManualSendLatestEmail: false,
    isRunning: false
  }
});
```

- [ ] **Step 6: 跑后端相关测试**

Run: `npx vitest run tests/core/scheduler/readNextCollectionRunAt.test.ts tests/server/settingsApiRoutes.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/scheduler/readNextCollectionRunAt.ts src/server/createServer.ts src/client/services/settingsApi.ts tests/core/scheduler/readNextCollectionRunAt.test.ts tests/server/settingsApiRoutes.test.ts
git commit -m "feat: 增加下一次采集时间读模型"
```

### Task 2: 在 sources 工作台显示下一次采集时间

**Files:**
- Modify: `src/client/pages/settings/SourcesPage.vue`
- Test: `tests/client/sourcesPage.test.ts`

- [ ] **Step 1: 先写前端显示测试**

```ts
it("renders next collection time in the overview and manual collect card", async () => {
  vi.mocked(settingsApi.readSettingsSources).mockResolvedValue({
    ...createSourcesModel(),
    operations: {
      ...createSourcesModel().operations,
      nextCollectionRunAt: "2026-03-31T10:40:00.000Z"
    }
  });

  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-31T10:34:00.000Z"));

  const wrapper = mountSourcesPage();
  await flushPromises();

  expect(wrapper.get("[data-sources-section='overview']").text()).toContain("下一次采集");
  expect(wrapper.get("[data-sources-section='overview']").text()).toContain("18:40（还有 6 分钟）");
  expect(wrapper.get("[data-sources-section='manual-collect']").text()).toContain("下一次自动采集：18:40（还有 6 分钟）");
});
```

- [ ] **Step 2: 跑测试确认当前失败**

Run: `npx vitest run tests/client/sourcesPage.test.ts`

Expected: FAIL，缺少 `下一次采集` 文案

- [ ] **Step 3: 在页面里新增格式化函数与分钟级心跳**

```ts
const relativeNow = ref(Date.now());
let nextCollectionTimer: number | null = null;
```

```ts
function formatNextCollectionText(value: string | null | undefined): string {
  if (!sourcesModel.value?.operations.nextCollectionRunAt) {
    return "未启用定时采集";
  }

  const nextDate = new Date(value);

  if (Number.isNaN(nextDate.getTime())) {
    return "暂时无法计算";
  }

  const diffMinutes = Math.floor((nextDate.getTime() - relativeNow.value) / 60_000);
  const timeLabel = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(nextDate);

  if (diffMinutes <= 0) {
    return `${timeLabel}（即将执行）`;
  }

  return `${timeLabel}（还有 ${diffMinutes} 分钟）`;
}
```

```ts
onMounted(() => {
  nextCollectionTimer = window.setInterval(() => {
    relativeNow.value = Date.now();
  }, 60_000);
});

onUnmounted(() => {
  if (nextCollectionTimer !== null) {
    window.clearInterval(nextCollectionTimer);
  }
});
```

- [ ] **Step 4: 在概览区和手动采集卡接入新文案**

```vue
<article class="rounded-editorial-md border border-editorial-border bg-editorial-panel px-4 py-4">
  <p class="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-editorial-text-muted">下一次采集</p>
  <p class="mt-2 mb-0 text-sm text-editorial-text-main">{{ formatNextCollectionText(sourcesModel.operations.nextCollectionRunAt) }}</p>
</article>
```

```vue
<a-typography-paragraph type="secondary">
  当前会对所有已启用 source 发起一次采集，并刷新最新内容库。
</a-typography-paragraph>
<p class="m-0 text-xs leading-5 text-editorial-text-muted">
  下一次自动采集：{{ formatNextCollectionText(sourcesModel.operations.nextCollectionRunAt) }}
</p>
```

- [ ] **Step 5: 补关闭调度的前端断言**

```ts
expect(wrapper.get("[data-sources-section='overview']").text()).toContain("未启用定时采集");
```

- [ ] **Step 6: 跑页面测试**

Run: `npx vitest run tests/client/sourcesPage.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/client/pages/settings/SourcesPage.vue tests/client/sourcesPage.test.ts
git commit -m "feat: 展示下一次自动采集时间"
```

### Task 3: 回归验证与文档同步

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Test: `tests/server/settingsApiRoutes.test.ts`
- Test: `tests/client/sourcesPage.test.ts`

- [ ] **Step 1: 同步协作文档与 README**

```md
- `/settings/sources` 顶部概览区现在会显示 `下一次采集`
- 文案口径为真实下一个自动调度触发点，例如 `18:40（还有 6 分钟）`
- 未启用定时采集时显示 `未启用定时采集`
```

- [ ] **Step 2: 运行最终相关验证**

Run: `npx vitest run tests/core/scheduler/readNextCollectionRunAt.test.ts tests/server/settingsApiRoutes.test.ts tests/client/sourcesPage.test.ts`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: 更新下一次采集时间说明"
```
