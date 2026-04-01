# HotNow Source Display Mode And Shared Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给每个 source 增加系统级“选中时全量展示”开关，并在三个内容页加入共享、可持久化的排序选项，同时保持旧用户本地筛选不被覆盖。

**Architecture:** 先在 `content_sources` 增加 `show_all_when_selected` 字段，并把它接进 source 读取模型和 `/settings/sources` 的设置动作。然后把内容页选择链路拆成“全量来源免 limit + 普通来源保留 limit”，最后在客户端加共享排序偏好和新的首次默认勾选逻辑。整个实现继续复用现有 `candidateCards -> visibleCards` 模型，不改 `contentScore` 公式，也不改 view rule 字段结构。

**Tech Stack:** TypeScript, Fastify, Vue 3, Ant Design Vue, better-sqlite3, Vitest, localStorage

---

## File Map

- Modify: `src/core/db/runMigrations.ts`
  - 为 `content_sources` 增加 `show_all_when_selected`
- Modify: `src/core/db/seedInitialData.ts`
  - 让新字段默认值与旧库补丁逻辑保持一致
- Modify: `src/core/source/listSourceCards.ts`
  - source 卡片模型增加 `showAllWhenSelected`
- Modify: `src/core/source/listContentSources.ts`
  - 内容页过滤源模型增加 `showAllWhenSelected`
- Modify: `src/core/source/listSourceWorkbench.ts`
  - `/settings/sources` 总览模型带出 `showAllWhenSelected`
- Modify: `src/main.ts`
  - 注入新的 source 展示模式更新动作和读取模型
- Modify: `src/server/createServer.ts`
  - 新增 `/actions/sources/display-mode`，并让内容页 API 接收排序 header
- Modify: `src/client/services/settingsApi.ts`
  - 新增 source 展示模式更新 API 类型和调用
- Modify: `src/client/pages/settings/SourcesPage.vue`
  - 渲染并保存“选中该来源时全量展示”开关
- Modify: `src/core/content/buildContentViewSelection.ts`
  - 支持 source 级全量展示和内容排序方式
- Modify: `src/core/content/listContentView.ts`
  - 接受新的排序与展示模式输入
- Modify: `src/client/services/contentApi.ts`
  - 新增排序偏好存储、header 注入和默认 source 选择辅助函数
- Create: `src/client/components/content/ContentSortControl.vue`
  - 内容页共享排序切换器
- Modify: `src/client/pages/content/AiNewPage.vue`
  - 接入排序偏好、首次默认 source 选择和新的内容页请求参数
- Modify: `src/client/pages/content/AiHotPage.vue`
  - 同上
- Test: `tests/db/runMigrations.test.ts`
  - 验证新字段存在且默认值正确
- Test: `tests/db/seedInitialData.test.ts`
  - 验证所有 built-in source 默认 `show_all_when_selected = 0`
- Test: `tests/source/listSourceCards.test.ts`
  - 验证 source 卡片读取新字段
- Test: `tests/server/settingsApiRoutes.test.ts`
  - 验证 `/api/settings/sources` 返回新字段
- Test: `tests/server/systemRoutes.test.ts`
  - 验证 `/actions/sources/display-mode`
- Test: `tests/client/sourcesPage.test.ts`
  - 验证 settings 页面新开关
- Test: `tests/content/buildContentViewSelection.test.ts`
  - 验证全量来源 + 普通来源 + 排序逻辑
- Test: `tests/client/contentApi.test.ts`
  - 验证排序偏好本地存储和 header 注入
- Test: `tests/client/aiNewPage.test.ts`
  - 验证首次默认 source 选择和排序切换
- Test: `tests/client/aiHotPage.test.ts`
  - 验证共享排序偏好和页面请求参数
- Update Docs: `README.md`, `AGENTS.md`
  - 同步 source 展示开关与共享排序偏好说明

### Task 1: 给 `content_sources` 增加展示模式字段并接进读取模型

**Files:**
- Modify: `src/core/db/runMigrations.ts`
- Modify: `src/core/db/seedInitialData.ts`
- Modify: `src/core/source/listSourceCards.ts`
- Modify: `src/core/source/listContentSources.ts`
- Modify: `src/core/source/listSourceWorkbench.ts`
- Test: `tests/db/runMigrations.test.ts`
- Test: `tests/db/seedInitialData.test.ts`
- Test: `tests/source/listSourceCards.test.ts`

- [ ] **Step 1: 先写失败测试，锁定新字段和默认值**

```ts
// tests/db/runMigrations.test.ts
it("adds show_all_when_selected to content_sources with default 0", async () => {
  const db = await createTestDatabase();

  const columns = db.prepare("PRAGMA table_info(content_sources)").all() as Array<{ name: string }>;
  expect(columns.some((column) => column.name === "show_all_when_selected")).toBe(true);

  const rows = db
    .prepare(
      `
        SELECT kind, show_all_when_selected
        FROM content_sources
        ORDER BY kind ASC
      `
    )
    .all() as Array<{ kind: string; show_all_when_selected: number }>;

  expect(rows.every((row) => row.show_all_when_selected === 0)).toBe(true);
});

// tests/db/seedInitialData.test.ts
it("seeds built-in sources with show_all_when_selected disabled by default", async () => {
  const db = await createSeededDatabase();

  const rows = db
    .prepare(
      `
        SELECT kind, show_all_when_selected
        FROM content_sources
        ORDER BY kind ASC
      `
    )
    .all() as Array<{ kind: string; show_all_when_selected: number }>;

  expect(rows).toEqual(
    expect.arrayContaining([
      { kind: "juya", show_all_when_selected: 0 },
      { kind: "openai", show_all_when_selected: 0 },
      { kind: "ithome", show_all_when_selected: 0 }
    ])
  );
});

// tests/source/listSourceCards.test.ts
it("reads showAllWhenSelected from content_sources", async () => {
  db.prepare(
    `
      UPDATE content_sources
      SET show_all_when_selected = 1
      WHERE kind = 'openai'
    `
  ).run();

  const cards = listSourceCards(db);
  expect(cards.find((card) => card.kind === "openai")?.showAllWhenSelected).toBe(true);
  expect(cards.find((card) => card.kind === "juya")?.showAllWhenSelected).toBe(false);
});
```

- [ ] **Step 2: 跑数据库与 source 读取测试，确认当前仓库还没有该字段**

Run: `npx vitest run tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts tests/source/listSourceCards.test.ts`

Expected: FAIL，报错点集中在 `show_all_when_selected` 列不存在，以及 `showAllWhenSelected` 还没出现在 source card 模型里

- [ ] **Step 3: 增加 migration、seed 补丁和 source 读取模型**

```ts
// src/core/db/runMigrations.ts
const schemaVersion = 4;
const sourceDisplayModeMigrationName = "004_source_display_mode";

if (!hasColumn(db, "content_sources", "show_all_when_selected")) {
  db.exec(
    `
      ALTER TABLE content_sources
      ADD COLUMN show_all_when_selected INTEGER NOT NULL DEFAULT 0
    `
  );
}

db.prepare(
  `
    INSERT INTO schema_migrations (version, name)
    VALUES (?, ?)
    ON CONFLICT(version) DO NOTHING
  `
).run(4, sourceDisplayModeMigrationName);

// src/core/source/listSourceCards.ts
type SourceRow = {
  kind: string;
  name: string;
  rss_url: string | null;
  is_enabled: number;
  show_all_when_selected: number;
};

export type SourceCard = {
  kind: string;
  name: string;
  rssUrl: string | null;
  isEnabled: boolean;
  showAllWhenSelected: boolean;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
};

SELECT kind, name, rss_url, is_enabled, show_all_when_selected
FROM content_sources

showAllWhenSelected: source.show_all_when_selected === 1,

// src/core/source/listContentSources.ts
export type ContentSourceOption = {
  kind: string;
  name: string;
  isEnabled: boolean;
  showAllWhenSelected: boolean;
};

SELECT kind, name, is_enabled, show_all_when_selected
FROM content_sources

showAllWhenSelected: row.show_all_when_selected === 1
```

- [ ] **Step 4: 重新跑相关测试，确认新字段和读取模型已经打通**

Run: `npx vitest run tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts tests/source/listSourceCards.test.ts`

Expected: PASS

- [ ] **Step 5: 提交数据库与 source 读取改动**

```bash
git add src/core/db/runMigrations.ts src/core/db/seedInitialData.ts src/core/source/listSourceCards.ts src/core/source/listContentSources.ts src/core/source/listSourceWorkbench.ts tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts tests/source/listSourceCards.test.ts
git commit -m "feat: add source display mode field"
```

### Task 2: 暴露 source 展示模式接口并接进 `/settings/sources`

**Files:**
- Modify: `src/main.ts`
- Modify: `src/server/createServer.ts`
- Modify: `src/client/services/settingsApi.ts`
- Modify: `tests/server/settingsApiRoutes.test.ts`
- Modify: `tests/server/systemRoutes.test.ts`

- [ ] **Step 1: 先写失败测试，锁定新的 source 设置动作和 API 返回字段**

```ts
// tests/server/settingsApiRoutes.test.ts
it("returns showAllWhenSelected in the sources api model", async () => {
  const app = createAuthenticatedServer();
  const cookie = await loginAndGetCookie(app);

  const response = await app.inject({
    method: "GET",
    url: "/api/settings/sources",
    headers: { cookie: cookie ?? "" }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    sources: [
      {
        kind: "openai",
        showAllWhenSelected: false
      }
    ]
  });
});

// tests/server/systemRoutes.test.ts
it("calls updateSourceDisplayMode for source display mode action", async () => {
  const updateSourceDisplayMode = vi.fn().mockResolvedValue({ ok: true });
  const app = createServer({ updateSourceDisplayMode } as never);

  const response = await app.inject({
    method: "POST",
    url: "/actions/sources/display-mode",
    payload: { kind: "openai", showAllWhenSelected: true }
  });

  expect(response.statusCode).toBe(200);
  expect(updateSourceDisplayMode).toHaveBeenCalledWith("openai", true);
});
```

- [ ] **Step 2: 跑 settings/server 测试，确认新动作和字段当前不存在**

Run: `npx vitest run tests/server/settingsApiRoutes.test.ts tests/server/systemRoutes.test.ts`

Expected: FAIL，报错点集中在 `/api/settings/sources` 返回字段缺失，以及 `/actions/sources/display-mode` 路由不存在

- [ ] **Step 3: 在 main/server/settings api 中接入展示模式读写**

```ts
// src/main.ts
type UpdateSourceDisplayModeResult = { ok: true } | { ok: false; reason: "not-found" };

const setSourceDisplayModeStatement = db.prepare(
  `
    UPDATE content_sources
    SET show_all_when_selected = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE kind = ?
  `
);

function updateSourceDisplayMode(kind: string, showAllWhenSelected: boolean): UpdateSourceDisplayModeResult {
  const run = db.transaction((normalizedKind: string, nextValue: boolean): UpdateSourceDisplayModeResult => {
    const source = readSourceByKind.get(normalizedKind) as { id: number } | undefined;

    if (!source) {
      return { ok: false, reason: "not-found" };
    }

    setSourceDisplayModeStatement.run(nextValue ? 1 : 0, normalizedKind);
    return { ok: true };
  });

  return run(kind.trim(), showAllWhenSelected);
}

// src/server/createServer.ts
type SourceCard = {
  kind: string;
  name: string;
  rssUrl: string | null;
  isEnabled: boolean;
  showAllWhenSelected: boolean;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
};

app.post("/actions/sources/display-mode", async (request, reply) => {
  if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
    return;
  }

  if (!deps.updateSourceDisplayMode) {
    return reply.code(503).send({ ok: false, reason: "sources-disabled" });
  }

  const body = request.body as { kind?: unknown; showAllWhenSelected?: unknown } | undefined;
  const kind = typeof body?.kind === "string" ? body.kind.trim() : "";
  const showAllWhenSelected =
    typeof body?.showAllWhenSelected === "boolean" ? body.showAllWhenSelected : null;

  if (!kind) {
    return reply.code(400).send({ ok: false, reason: "invalid-source-kind" });
  }

  if (showAllWhenSelected === null) {
    return reply.code(400).send({ ok: false, reason: "invalid-source-display-mode" });
  }

  const result = await deps.updateSourceDisplayMode(kind, showAllWhenSelected);
  if (!result.ok) {
    return reply.code(404).send({ ok: false, reason: "not-found" });
  }

  return reply.send({ ok: true, kind, showAllWhenSelected });
});

// src/client/services/settingsApi.ts
export type SettingsSourceItem = {
  kind: string;
  name: string;
  rssUrl: string | null;
  isEnabled: boolean;
  showAllWhenSelected: boolean;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
  // ...
};

export type UpdateSourceDisplayModeResponse = {
  ok: true;
  kind: string;
  showAllWhenSelected: boolean;
};

export function updateSourceDisplayMode(
  kind: string,
  showAllWhenSelected: boolean
): Promise<UpdateSourceDisplayModeResponse> {
  return postSettingsAction<UpdateSourceDisplayModeResponse>("/actions/sources/display-mode", {
    kind,
    showAllWhenSelected
  });
}
```

- [ ] **Step 4: 重新跑 settings/server 测试，确认 source 展示模式 API 已可用**

Run: `npx vitest run tests/server/settingsApiRoutes.test.ts tests/server/systemRoutes.test.ts`

Expected: PASS

- [ ] **Step 5: 提交 source 展示模式接口改动**

```bash
git add src/main.ts src/server/createServer.ts src/client/services/settingsApi.ts tests/server/settingsApiRoutes.test.ts tests/server/systemRoutes.test.ts
git commit -m "feat: add source display mode settings action"
```

### Task 3: 在 `/settings/sources` 页面增加“选中时全量展示”开关

**Files:**
- Modify: `src/client/pages/settings/SourcesPage.vue`
- Modify: `tests/client/sourcesPage.test.ts`

- [ ] **Step 1: 先写失败测试，锁定新开关渲染和保存动作**

```ts
// tests/client/sourcesPage.test.ts
it("renders source display mode toggle and saves it", async () => {
  vi.mocked(settingsApi.readSettingsSources)
    .mockResolvedValueOnce({
      ...createSourcesModel(),
      sources: [{ ...createSourcesModel().sources[0], showAllWhenSelected: false }]
    })
    .mockResolvedValueOnce({
      ...createSourcesModel(),
      sources: [{ ...createSourcesModel().sources[0], showAllWhenSelected: true }]
    });
  vi.mocked(settingsApi.updateSourceDisplayMode).mockResolvedValue({
    ok: true,
    kind: "openai",
    showAllWhenSelected: true
  });

  const wrapper = mount(SourcesPage, { global: { plugins: [Antd] } });
  await flushPromises();

  await wrapper.get("[data-source-display-mode='openai']").trigger("click");
  await flushPromises();

  expect(settingsApi.updateSourceDisplayMode).toHaveBeenCalledWith("openai", true);
  expect(wrapper.text()).toContain("选中该来源时全量展示");
});
```

- [ ] **Step 2: 跑 client settings 测试，确认页面还没渲染新开关**

Run: `npx vitest run tests/client/sourcesPage.test.ts`

Expected: FAIL，报错点集中在 `updateSourceDisplayMode` 尚未被调用，和新 selector 不存在

- [ ] **Step 3: 在 SourcesPage 中加展示模式开关和独立动作**

```ts
// src/client/pages/settings/SourcesPage.vue
import {
  readSettingsSources,
  toggleSource,
  updateSourceDisplayMode,
  triggerManualCollect,
  triggerManualSendLatestEmail
} from "../../services/settingsApi";

async function handleToggleSourceDisplayMode(source: SettingsSourceItem): Promise<void> {
  const nextValue = !source.showAllWhenSelected;

  await runSourcesAction(
    `display-mode:${source.kind}`,
    () => updateSourceDisplayMode(source.kind, nextValue),
    {
      fallbackMessage: "来源展示模式更新失败，请稍后再试。",
      successMessage: nextValue ? "已开启该来源的全量展示模式。" : "已关闭该来源的全量展示模式。",
      reasonMessages: {
        "invalid-source-kind": "source kind 不合法，无法更新展示模式。",
        "invalid-source-display-mode": "展示模式参数不合法。",
        "not-found": "对应 source 不存在，可能已被移除。"
      }
    }
  );
}
```

```vue
<!-- src/client/pages/settings/SourcesPage.vue -->
<a-button
  :loading="isActionPending(`display-mode:${record.kind}`)"
  data-role="source-display-mode-button"
  :data-source-display-mode="record.kind"
  @click="handleToggleSourceDisplayMode(record)"
>
  {{ record.showAllWhenSelected ? "关闭全量展示" : "选中时全量展示" }}
</a-button>
<p class="text-xs text-editorial-text-muted">选中该来源时全量展示</p>
```

- [ ] **Step 4: 重新跑 client settings 测试，确认页面行为已闭环**

Run: `npx vitest run tests/client/sourcesPage.test.ts`

Expected: PASS

- [ ] **Step 5: 提交 `/settings/sources` 页面改动**

```bash
git add src/client/pages/settings/SourcesPage.vue tests/client/sourcesPage.test.ts
git commit -m "feat: add source display mode toggle to sources page"
```

### Task 4: 改造内容选择层，支持全量来源和最终排序方式

**Files:**
- Modify: `src/core/content/buildContentViewSelection.ts`
- Modify: `src/core/content/listContentView.ts`
- Modify: `tests/content/buildContentViewSelection.test.ts`

- [ ] **Step 1: 先写失败测试，锁定“勾选时全量展示”和“按评分排序”行为**

```ts
// tests/content/buildContentViewSelection.test.ts
it("keeps full-display sources untrimmed while limiting regular sources", async () => {
  const db = await createTestDatabase(databasesToClose);
  const juya = resolveSourceByKind(db, "juya");
  const openai = resolveSourceByKind(db, "openai");

  db.prepare(
    `
      UPDATE content_sources
      SET show_all_when_selected = 1
      WHERE kind = 'juya'
    `
  ).run();

  upsertContentItems(db, {
    sourceId: juya!.id,
    items: [
      buildItem("Juya A", "2026-03-31T02:00:00.000Z"),
      buildItem("Juya B", "2026-03-31T01:00:00.000Z"),
      buildItem("Juya C", "2026-03-31T00:00:00.000Z")
    ]
  });
  upsertContentItems(db, {
    sourceId: openai!.id,
    items: [
      buildItem("OpenAI A", "2026-03-31T02:30:00.000Z"),
      buildItem("OpenAI B", "2026-03-31T01:30:00.000Z")
    ]
  });

  const selection = buildContentViewSelection(db, "hot", {
    selectedSourceKinds: ["juya", "openai"],
    limitOverride: 1
  });

  expect(selection.visibleCards.filter((card) => card.sourceKind === "juya")).toHaveLength(3);
  expect(selection.visibleCards.filter((card) => card.sourceKind === "openai")).toHaveLength(1);
});

it("does not activate full display when the source is not selected", async () => {
  const db = await createTestDatabase(databasesToClose);
  db.prepare("UPDATE content_sources SET show_all_when_selected = 1 WHERE kind = 'juya'").run();

  const selection = buildContentViewSelection(db, "hot", {
    selectedSourceKinds: ["openai"],
    limitOverride: 1
  });

  expect(selection.visibleCards.every((card) => card.sourceKind !== "juya")).toBe(true);
});

it("sorts visible cards by content score when requested", async () => {
  const db = await createTestDatabase(databasesToClose);
  const openai = resolveSourceByKind(db, "openai");

  upsertContentItems(db, {
    sourceId: openai!.id,
    items: [
      buildItem("Low score item", "2026-03-31T03:00:00.000Z"),
      buildItem("High score AI agent launch", "2026-03-31T01:00:00.000Z")
    ]
  });

  const selection = buildContentViewSelection(db, "ai", {
    sortMode: "content_score"
  });

  expect(selection.visibleCards.map((card) => card.title)).toEqual([
    "High score AI agent launch",
    "Low score item"
  ]);
});
```

- [ ] **Step 2: 跑内容选择测试，确认新参数和行为当前还不存在**

Run: `npx vitest run tests/content/buildContentViewSelection.test.ts`

Expected: FAIL，报错点集中在 `show_all_when_selected` 没有参与选择、`sortMode` 参数不存在

- [ ] **Step 3: 给内容选择器增加 `fullDisplaySourceKinds` 和 `sortMode`**

```ts
// src/core/content/buildContentViewSelection.ts
export type ContentSortMode = "published_at" | "content_score";

export type ContentViewSelectionOptions = {
  includeNlEvaluations?: boolean;
  selectedSourceKinds?: string[];
  referenceTime?: Date;
  limitOverride?: number;
  sortMode?: ContentSortMode;
};

type ContentCardRow = {
  // ...
  showAllWhenSelected: number;
};

SELECT
  ci.id AS id,
  cs.kind AS sourceKind,
  cs.show_all_when_selected AS showAllWhenSelected,
  -- ...

const sortMode = options.sortMode ?? "published_at";
const fullDisplaySourceKinds = new Set(
  rankedCards
    .filter((card) => card.showAllWhenSelected && (selectedSourceKinds === null || selectedSourceKinds.has(card.sourceKind)))
    .map((card) => card.sourceKind)
);

const fullDisplayCards = rankedCards.filter((card) => fullDisplaySourceKinds.has(card.sourceKind));
const limitedCards = rankedCards
  .filter((card) => !fullDisplaySourceKinds.has(card.sourceKind))
  .slice(0, limit);

const visibleCards = sortVisibleCards([...fullDisplayCards, ...limitedCards], sortMode);

function sortVisibleCards(cards: RankedContentCardView[], sortMode: ContentSortMode) {
  if (sortMode === "content_score") {
    return [...cards].sort((left, right) => {
      if (right.contentScore !== left.contentScore) {
        return right.contentScore - left.contentScore;
      }

      return toTimestampMs(right.rankingTimestamp) - toTimestampMs(left.rankingTimestamp) || right.id - left.id;
    });
  }

  return [...cards].sort((left, right) => {
    const rightPublishedAt = toTimestampMs(right.publishedAt ?? right.rankingTimestamp);
    const leftPublishedAt = toTimestampMs(left.publishedAt ?? left.rankingTimestamp);

    if (rightPublishedAt !== leftPublishedAt) {
      return rightPublishedAt - leftPublishedAt;
    }

    return right.id - left.id;
  });
}
```

- [ ] **Step 4: 重新跑内容选择测试，确认全量来源与排序切换都成立**

Run: `npx vitest run tests/content/buildContentViewSelection.test.ts`

Expected: PASS

- [ ] **Step 5: 提交内容选择逻辑改动**

```bash
git add src/core/content/buildContentViewSelection.ts src/core/content/listContentView.ts tests/content/buildContentViewSelection.test.ts
git commit -m "feat: support source display mode in content selection"
```

### Task 5: 给内容页加入共享排序偏好和新的首次默认 source 选择

**Files:**
- Modify: `src/client/services/contentApi.ts`
- Create: `src/client/components/content/ContentSortControl.vue`
- Modify: `src/client/pages/content/AiNewPage.vue`
- Modify: `src/client/pages/content/AiHotPage.vue`
- Modify: `tests/client/contentApi.test.ts`
- Modify: `tests/client/aiNewPage.test.ts`
- Modify: `tests/client/aiHotPage.test.ts`

- [ ] **Step 1: 先写失败测试，锁定排序偏好持久化和首次默认 source 选择**

```ts
// tests/client/contentApi.test.ts
it("persists and restores shared content sort mode", async () => {
  const {
    CONTENT_SORT_STORAGE_KEY,
    readStoredContentSortMode,
    writeStoredContentSortMode
  } = await import("../../src/client/services/contentApi");

  writeStoredContentSortMode("content_score");

  expect(window.localStorage.getItem(CONTENT_SORT_STORAGE_KEY)).toBe("content_score");
  expect(readStoredContentSortMode()).toBe("content_score");
});

it("sends shared sort mode in content page headers", async () => {
  requestJson.mockResolvedValue({ pageKey: "ai-hot", sourceFilter: undefined, featuredCard: null, cards: [], emptyState: null });

  const { readAiHotPage } = await import("../../src/client/services/contentApi");
  await readAiHotPage(["openai"], "content_score");

  expect(requestJson).toHaveBeenCalledWith(
    "/api/content/ai-hot",
    expect.objectContaining({
      headers: {
        "x-hot-now-source-filter": "openai",
        "x-hot-now-content-sort": "content_score"
      }
    })
  );
});

// tests/client/aiNewPage.test.ts
it("defaults to selecting only non-full-display sources when no local source filter exists", async () => {
  contentApiMocks.readStoredContentSourceKinds.mockReturnValue(null);
  contentApiMocks.readStoredContentSortMode.mockReturnValue(null);
  contentApiMocks.readAiNewPage.mockResolvedValueOnce(
    createModel({
      sourceFilter: {
        options: [
          { kind: "openai", name: "OpenAI", showAllWhenSelected: false },
          { kind: "juya", name: "Juya AI Daily", showAllWhenSelected: true }
        ],
        selectedSourceKinds: ["openai"]
      }
    })
  );

  mount(AiNewPage, { global: { plugins: [Antd] } });
  await flushPromises();

  expect(contentApiMocks.writeStoredContentSourceKinds).toHaveBeenCalledWith(["openai"]);
});
```

- [ ] **Step 2: 跑 client 内容页测试，确认排序存储和默认选择逻辑还不存在**

Run: `npx vitest run tests/client/contentApi.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: FAIL，报错点集中在排序 storage API、排序 header 和首次默认 source 选择逻辑不存在

- [ ] **Step 3: 在 contentApi 和内容页组件里接入共享排序偏好**

```ts
// src/client/services/contentApi.ts
export type ContentSortMode = "published_at" | "content_score";

export const CONTENT_SOURCE_STORAGE_KEY = "hot-now-content-sources";
export const CONTENT_SORT_STORAGE_KEY = "hot-now-content-sort";

export type ContentSourceFilter = {
  options: { kind: string; name: string; showAllWhenSelected: boolean }[];
  selectedSourceKinds: string[];
};

function createContentPageRequestHeaders(
  selectedSourceKinds: string[] | undefined,
  sortMode: ContentSortMode | undefined
): HeadersInit | undefined {
  const headers: Record<string, string> = {};

  if (selectedSourceKinds !== undefined) {
    headers["x-hot-now-source-filter"] = normalizeSelectedSourceKinds(selectedSourceKinds).join(",");
  }

  if (sortMode) {
    headers["x-hot-now-content-sort"] = sortMode;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function readStoredContentSortMode(): ContentSortMode | null {
  const raw = typeof window === "undefined" ? null : window.localStorage.getItem(CONTENT_SORT_STORAGE_KEY);
  return raw === "published_at" || raw === "content_score" ? raw : null;
}

export function writeStoredContentSortMode(sortMode: ContentSortMode): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CONTENT_SORT_STORAGE_KEY, sortMode);
  }
}

export function deriveInitialSelectedSourceKinds(
  options: ContentSourceFilter["options"],
  storedKinds: string[] | null
): string[] {
  if (storedKinds !== null) {
    return storedKinds;
  }

  return options.filter((option) => !option.showAllWhenSelected).map((option) => option.kind);
}
```

```vue
<!-- src/client/pages/content/AiNewPage.vue -->
<ContentSortControl :sort-mode="sortMode" @change="handleSortModeChange" />
```

```ts
// src/client/pages/content/AiNewPage.vue / AiHotPage.vue
const sortMode = ref<ContentSortMode>(readStoredContentSortMode() ?? "published_at");

async function handleSortModeChange(nextSortMode: ContentSortMode): Promise<void> {
  sortMode.value = nextSortMode;
  writeStoredContentSortMode(nextSortMode);
  await loadPage({ selectedKinds: selectedSourceKinds.value ?? undefined, sortMode: nextSortMode, silent: true });
}
```

- [ ] **Step 4: 重新跑 client 内容页测试，确认排序和首次默认勾选都闭环**

Run: `npx vitest run tests/client/contentApi.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: PASS

- [ ] **Step 5: 提交内容页排序偏好改动**

```bash
git add src/client/services/contentApi.ts src/client/components/content/ContentSortControl.vue src/client/pages/content/AiNewPage.vue src/client/pages/content/AiHotPage.vue tests/client/contentApi.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
git commit -m "feat: add shared content sort preference"
```

### Task 6: 文档同步与整体验证

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 更新 README 和 AGENTS 中关于 source 筛选与内容排序的说明**

```md
<!-- README.md -->
- `/settings/sources` 支持逐 source 配置“选中该来源时全量展示”
- 内容页首次进入时默认不勾选这类全量来源；若用户已有本地筛选记录，则保留原有选择
- 内容页支持“按发布时间 / 按评分”切换，偏好写入浏览器 `localStorage` 并在三个内容页共享
```

```md
<!-- AGENTS.md -->
- `/settings/sources` 现在同时管理 source 启停和 source 级“选中时全量展示”策略
- 内容页 source filter 的默认值会排除开启全量展示的来源，但不会覆盖已有本地筛选记录
- 内容页共享一套浏览器本地排序偏好：`按发布时间` / `按评分`
```

- [ ] **Step 2: 跑最相关测试矩阵**

Run: `npx vitest run tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts tests/source/listSourceCards.test.ts tests/server/settingsApiRoutes.test.ts tests/server/systemRoutes.test.ts tests/content/buildContentViewSelection.test.ts tests/client/contentApi.test.ts tests/client/sourcesPage.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts`

Expected: PASS

- [ ] **Step 3: 跑类型构建**

Run: `npm run build`

Expected: PASS

- [ ] **Step 4: 做本地 smoke test**

Run:

```bash
npm run dev:local
```

Expected:
- `/settings/sources` 能看到“选中该来源时全量展示”开关
- 打开某个来源的全量展示开关后，刷新内容页首次默认不再自动勾选它
- 手动勾选该来源后，列表条数明显增加
- 排序切到“按评分”后刷新仍保持
- `/`、`/articles`、`/ai` 三页共享同一排序偏好

- [ ] **Step 5: 提交文档和最终验证结果**

```bash
git add README.md AGENTS.md
git commit -m "docs: document source display mode and content sort"
```

### Spec coverage

- `content_sources.show_all_when_selected`：Task 1
- `/settings/sources` 新开关与独立动作：Task 2, Task 3
- 新用户默认不选中全量来源：Task 5
- 旧用户本地筛选不覆盖：Task 5
- 内容选择层“全量来源免 limit + 普通来源保留 limit”：Task 4
- 内容页共享排序偏好：Task 5
- 默认按发布时间、支持按评分：Task 4, Task 5
- 文档同步：Task 6

