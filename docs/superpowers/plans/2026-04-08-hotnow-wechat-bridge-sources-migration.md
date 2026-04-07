# HotNow WeChat Bridge Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add batch-ready third-party WeChat public-account sources by introducing an in-repo bridge source type, keeping HotNow's collection pipeline RSS-first, and exposing source create/edit/delete flows in `/settings/sources`.

**Architecture:** Extend `content_sources` with `source_type + bridge_kind + bridge_config_json` so RSS and WeChat bridge rows share one source table and one workbench. Add a small `src/core/wechat/` bridge module that resolves `wechat_bridge` rows into a final feed URL, then let the existing feed loader and downstream content pipeline continue unchanged; the Vue sources page gets a unified source modal that can create, edit, and delete both RSS and bridge rows through new Fastify JSON actions.

**Tech Stack:** TypeScript, Fastify, Vue 3, Ant Design Vue, SQLite, Vitest

---

## File Map

**Create**

- `src/core/wechat/wechatBridgeTypes.ts`
  Define `wechat_bridge` provider kinds, JSON config shape, and helpers for config parsing.
- `src/core/wechat/wechatBridgeProviders.ts`
  Build final feed URLs from validated bridge configs.
- `src/core/wechat/resolveWechatBridgeFeed.ts`
  Normalize one source row into a resolved feed URL for the source loader.
- `src/core/source/sourceMutationRepository.ts`
  Centralize source create / update / delete validation and persistence instead of pushing SQLite details into `main.ts`.

**Modify**

- `src/core/db/runMigrations.ts`
  Add `source_type`, `bridge_kind`, and `bridge_config_json` to `content_sources`.
- `src/core/db/seedInitialData.ts`
  Seed built-ins as `source_type = rss` and preserve manual RSS overrides.
- `src/core/source/loadEnabledSourceIssues.ts`
  Resolve RSS vs bridge source rows before fetching feeds.
- `src/core/source/loadActiveSourceIssue.ts`
  Mirror the same resolution path for legacy single-source loader behavior.
- `src/core/source/listSourceCards.ts`
  Return source type and bridge summary fields to the workbench.
- `src/core/source/listSourceWorkbench.ts`
  Carry source type metadata into analytics rows without changing existing stats semantics.
- `src/core/source/listContentSources.ts`
  Keep content-page source filtering compatible with mixed source types.
- `src/server/createServer.ts`
  Extend settings sources read model and add create/update/delete source JSON actions.
- `src/server/renderSystemPages.ts`
  Update `SourcesSettingsView` types for the richer source payload.
- `src/main.ts`
  Wire source mutation repository functions and remove direct SQLite source mutation logic from the HTTP assembly point.
- `src/client/services/settingsApi.ts`
  Add source form types plus create/update/delete requests.
- `src/client/pages/settings/SourcesPage.vue`
  Add a unified add/edit modal, render source type metadata, and wire delete flow.
- `README.md`
  Document WeChat bridge sources and sources-page maintenance flow.
- `AGENTS.md`
  Document the new source type and `/settings/sources` capabilities.

**Test**

- `tests/db/runMigrations.test.ts`
- `tests/db/seedInitialData.test.ts`
- `tests/source/loadEnabledSourceIssues.test.ts`
- `tests/source/listSourceCards.test.ts`
- `tests/source/listSourceWorkbench.test.ts`
- `tests/source/sourceMutationRepository.test.ts`
- `tests/server/systemRoutes.test.ts`
- `tests/server/createServer.test.ts`
- `tests/client/settingsApi.test.ts`
- `tests/client/sourcesPage.test.ts`

## Task 1: Extend Source Storage To Support Bridge Rows

**Files:**
- Create: `src/core/source/sourceMutationRepository.ts`
- Modify: `src/core/db/runMigrations.ts`
- Modify: `src/core/db/seedInitialData.ts`
- Test: `tests/db/runMigrations.test.ts`
- Test: `tests/db/seedInitialData.test.ts`
- Test: `tests/source/sourceMutationRepository.test.ts`

- [ ] **Step 1: Write the failing storage tests for the new source columns and mutations**

```ts
it("adds source_type, bridge_kind, and bridge_config_json to content_sources", async () => {
  const handle = await createTestDatabase("hot-now-source-migration-");

  const columns = handle.db.prepare("PRAGMA table_info(content_sources)").all() as Array<{ name: string }>;

  expect(columns.map((column) => column.name)).toEqual(
    expect.arrayContaining(["source_type", "bridge_kind", "bridge_config_json"])
  );
});

it("seeds built-ins as rss sources", async () => {
  const handle = await createTestDatabase("hot-now-seed-source-type-");

  const rows = handle.db
    .prepare("SELECT kind, source_type, bridge_kind FROM content_sources ORDER BY id ASC")
    .all() as Array<{ kind: string; source_type: string; bridge_kind: string | null }>;

  expect(rows.every((row) => row.source_type === "rss" && row.bridge_kind === null)).toBe(true);
});

it("creates and updates a wechat bridge source", async () => {
  const handle = await createTestDatabase("hot-now-source-mutation-");

  const created = saveSource(handle.db, {
    mode: "create",
    sourceType: "wechat_bridge",
    kind: "wechat_jike_ai",
    name: "极客公园",
    siteUrl: "https://mp.weixin.qq.com/",
    bridgeKind: "rsshub_wechat2rss",
    bridgeConfig: { accountId: "abc123" }
  });

  expect(created.ok).toBe(true);

  const updated = saveSource(handle.db, {
    mode: "update",
    kind: "wechat_jike_ai",
    name: "极客公园 AI",
    siteUrl: "https://mp.weixin.qq.com/",
    bridgeKind: "rsshub_wechat2rss",
    bridgeConfig: { accountId: "xyz789" }
  });

  expect(updated).toEqual({ ok: true });
});
```

- [ ] **Step 2: Run the storage tests to confirm the current schema cannot satisfy them**

Run: `npx vitest run tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts tests/source/sourceMutationRepository.test.ts -v`

Expected: FAIL because `content_sources` does not yet have the new columns and there is no source mutation repository.

- [ ] **Step 3: Add source columns and the source mutation repository**

```ts
// src/core/db/runMigrations.ts
const sourceBridgeMetadataMigrationName = "007_source_bridge_metadata";

if (!hasColumn(db, "content_sources", "source_type")) {
  db.exec("ALTER TABLE content_sources ADD COLUMN source_type TEXT NOT NULL DEFAULT 'rss'");
}

if (!hasColumn(db, "content_sources", "bridge_kind")) {
  db.exec("ALTER TABLE content_sources ADD COLUMN bridge_kind TEXT");
}

if (!hasColumn(db, "content_sources", "bridge_config_json")) {
  db.exec("ALTER TABLE content_sources ADD COLUMN bridge_config_json TEXT");
}
```

```ts
// src/core/source/sourceMutationRepository.ts
export type SaveSourceInput =
  | {
      mode: "create";
      sourceType: "rss";
      kind: string;
      name: string;
      siteUrl: string;
      rssUrl: string;
    }
  | {
      mode: "create";
      sourceType: "wechat_bridge";
      kind: string;
      name: string;
      siteUrl: string;
      bridgeKind: "rsshub_wechat2rss";
      bridgeConfig: { accountId: string };
    }
  | {
      mode: "update";
      kind: string;
      name: string;
      siteUrl: string;
      rssUrl?: string;
      bridgeKind?: "rsshub_wechat2rss";
      bridgeConfig?: { accountId: string };
    };

export function saveSource(db: SqliteDatabase, input: SaveSourceInput) {
  if (input.mode === "create" && input.sourceType === "rss") {
    db.prepare(
      `
        INSERT INTO content_sources (
          kind, name, site_url, rss_url, source_type, bridge_kind, bridge_config_json, is_enabled, is_builtin, updated_at
        ) VALUES (?, ?, ?, ?, 'rss', NULL, NULL, 1, 0, CURRENT_TIMESTAMP)
      `
    ).run(input.kind.trim(), input.name.trim(), input.siteUrl.trim(), input.rssUrl.trim());
    return { ok: true } as const;
  }

  if (input.mode === "create") {
    db.prepare(
      `
        INSERT INTO content_sources (
          kind, name, site_url, rss_url, source_type, bridge_kind, bridge_config_json, is_enabled, is_builtin, updated_at
        ) VALUES (?, ?, ?, NULL, 'wechat_bridge', ?, ?, 1, 0, CURRENT_TIMESTAMP)
      `
    ).run(
      input.kind.trim(),
      input.name.trim(),
      input.siteUrl.trim(),
      input.bridgeKind,
      JSON.stringify(input.bridgeConfig)
    );
    return { ok: true } as const;
  }

  db.prepare(
    `
      UPDATE content_sources
      SET name = ?,
          site_url = ?,
          rss_url = ?,
          bridge_kind = ?,
          bridge_config_json = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE kind = ?
    `
  ).run(
    input.name.trim(),
    input.siteUrl.trim(),
    input.rssUrl ?? null,
    input.bridgeKind ?? null,
    input.bridgeConfig ? JSON.stringify(input.bridgeConfig) : null,
    input.kind.trim()
  );

  return { ok: true } as const;
}
```

```ts
// src/core/db/seedInitialData.ts
INSERT INTO content_sources (
  kind, name, site_url, rss_url, source_type, bridge_kind, bridge_config_json, is_enabled, is_builtin, show_all_when_selected, updated_at
) VALUES (?, ?, ?, ?, 'rss', NULL, NULL, ?, 1, ?, CURRENT_TIMESTAMP)
```

- [ ] **Step 4: Run the storage tests again**

Run: `npx vitest run tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts tests/source/sourceMutationRepository.test.ts -v`

Expected: PASS with the new columns present, built-ins marked as `rss`, and bridge rows persisted through the repository.

- [ ] **Step 5: Commit the storage-layer changes**

```bash
git add src/core/db/runMigrations.ts \
  src/core/db/seedInitialData.ts \
  src/core/source/sourceMutationRepository.ts \
  tests/db/runMigrations.test.ts \
  tests/db/seedInitialData.test.ts \
  tests/source/sourceMutationRepository.test.ts
git commit -m "feat: 增加公众号桥接来源存储模型"
```

## Task 2: Add The WeChat Bridge Resolver To The Feed Loader

**Files:**
- Create: `src/core/wechat/wechatBridgeTypes.ts`
- Create: `src/core/wechat/wechatBridgeProviders.ts`
- Create: `src/core/wechat/resolveWechatBridgeFeed.ts`
- Modify: `src/core/source/loadEnabledSourceIssues.ts`
- Modify: `src/core/source/loadActiveSourceIssue.ts`
- Modify: `src/core/source/listSourceCards.ts`
- Modify: `src/core/source/listSourceWorkbench.ts`
- Test: `tests/source/loadEnabledSourceIssues.test.ts`
- Test: `tests/source/listSourceCards.test.ts`
- Test: `tests/source/listSourceWorkbench.test.ts`

- [ ] **Step 1: Write the failing loader tests for `wechat_bridge` rows**

```ts
it("resolves wechat bridge rows to a feed url before fetch", async () => {
  const handle = await createTestDatabase("hot-now-wechat-bridge-loader-");

  handle.db.prepare(
    `
      INSERT INTO content_sources (
        kind, name, site_url, rss_url, source_type, bridge_kind, bridge_config_json, is_enabled, is_builtin
      ) VALUES (?, ?, ?, NULL, 'wechat_bridge', 'rsshub_wechat2rss', ?, 1, 0)
    `
  ).run("wechat_demo", "微信 Demo", "https://mp.weixin.qq.com/", JSON.stringify({ accountId: "demo-id" }));

  global.fetch = vi.fn().mockResolvedValue(new Response(SAMPLE_RSS, { status: 200 })) as never;

  await loadEnabledSourceIssues(handle.db);

  expect(global.fetch).toHaveBeenCalledWith("https://bridge.example.test/wechat/demo-id.xml");
});

it("exposes sourceType and bridgeKind in source cards", async () => {
  const handle = await createTestDatabase("hot-now-wechat-bridge-card-");
  const cards = listSourceCards(handle.db);

  expect(cards[0]).toEqual(
    expect.objectContaining({
      sourceType: expect.any(String),
      bridgeKind: expect.anything()
    })
  );
});
```

- [ ] **Step 2: Run the loader tests to verify the current loader rejects bridge rows**

Run: `npx vitest run tests/source/loadEnabledSourceIssues.test.ts tests/source/listSourceCards.test.ts tests/source/listSourceWorkbench.test.ts -v`

Expected: FAIL because the loader only knows `rss_url` and source cards do not yet expose bridge metadata.

- [ ] **Step 3: Add the bridge resolver and feed URL generation**

```ts
// src/core/wechat/wechatBridgeTypes.ts
export const WECHAT_BRIDGE_KINDS = ["rsshub_wechat2rss"] as const;
export type WechatBridgeKind = (typeof WECHAT_BRIDGE_KINDS)[number];
export type WechatBridgeConfig = { accountId: string };

export function parseWechatBridgeConfig(value: string | null): WechatBridgeConfig | null {
  if (!value) {
    return null;
  }

  const parsed = JSON.parse(value) as Partial<WechatBridgeConfig>;
  return typeof parsed.accountId === "string" && parsed.accountId.trim()
    ? { accountId: parsed.accountId.trim() }
    : null;
}
```

```ts
// src/core/wechat/wechatBridgeProviders.ts
export function buildWechatBridgeFeedUrl(kind: WechatBridgeKind, config: WechatBridgeConfig): string {
  if (kind === "rsshub_wechat2rss") {
    return `https://bridge.example.test/wechat/${encodeURIComponent(config.accountId)}.xml`;
  }

  throw new Error(`Unsupported wechat bridge kind: ${kind satisfies never}`);
}
```

```ts
// src/core/wechat/resolveWechatBridgeFeed.ts
export function resolveWechatBridgeFeed(source: {
  kind: string;
  source_type: string;
  rss_url: string | null;
  bridge_kind: string | null;
  bridge_config_json: string | null;
}): string {
  if (source.source_type === "rss") {
    if (!source.rss_url?.trim()) {
      throw new Error(`Content source ${source.kind} does not have an rss_url`);
    }

    return source.rss_url.trim();
  }

  const bridgeConfig = parseWechatBridgeConfig(source.bridge_config_json);

  if (!source.bridge_kind || !bridgeConfig) {
    throw new Error(`Content source ${source.kind} has an invalid wechat bridge config`);
  }

  return buildWechatBridgeFeedUrl(source.bridge_kind as WechatBridgeKind, bridgeConfig);
}
```

```ts
// src/core/source/loadEnabledSourceIssues.ts
type EnabledSourceRow = {
  kind: SourceKind;
  rss_url: string | null;
  source_type: string;
  bridge_kind: string | null;
  bridge_config_json: string | null;
};

const resolvedFeedUrl = resolveWechatBridgeFeed(source);
const response = await fetch(resolvedFeedUrl);
```

- [ ] **Step 4: Run the loader and source-card tests again**

Run: `npx vitest run tests/source/loadEnabledSourceIssues.test.ts tests/source/listSourceCards.test.ts tests/source/listSourceWorkbench.test.ts -v`

Expected: PASS with RSS rows unchanged and bridge rows resolved through the new module.

- [ ] **Step 5: Commit the bridge-loader slice**

```bash
git add src/core/wechat/wechatBridgeTypes.ts \
  src/core/wechat/wechatBridgeProviders.ts \
  src/core/wechat/resolveWechatBridgeFeed.ts \
  src/core/source/loadEnabledSourceIssues.ts \
  src/core/source/loadActiveSourceIssue.ts \
  src/core/source/listSourceCards.ts \
  src/core/source/listSourceWorkbench.ts \
  tests/source/loadEnabledSourceIssues.test.ts \
  tests/source/listSourceCards.test.ts \
  tests/source/listSourceWorkbench.test.ts
git commit -m "feat: 接入公众号桥接来源解析模块"
```

## Task 3: Add Source Create / Update / Delete APIs And Server Wiring

**Files:**
- Modify: `src/server/createServer.ts`
- Modify: `src/server/renderSystemPages.ts`
- Modify: `src/main.ts`
- Modify: `src/client/services/settingsApi.ts`
- Test: `tests/server/systemRoutes.test.ts`
- Test: `tests/server/createServer.test.ts`
- Test: `tests/client/settingsApi.test.ts`

- [ ] **Step 1: Write the failing API tests for source create/update/delete**

```ts
it("creates a wechat bridge source through the JSON action", async () => {
  const createSource = vi.fn().mockResolvedValue({ ok: true });
  const app = createServer({ auth: AUTH_CONFIG, createSource });

  const response = await app.inject({
    method: "POST",
    url: "/actions/sources",
    cookies: AUTH_COOKIES,
    payload: {
      sourceType: "wechat_bridge",
      kind: "wechat_demo",
      name: "微信 Demo",
      siteUrl: "https://mp.weixin.qq.com/",
      bridgeKind: "rsshub_wechat2rss",
      bridgeConfig: { accountId: "demo-id" }
    }
  });

  expect(response.statusCode).toBe(200);
  expect(createSource).toHaveBeenCalledWith(
    expect.objectContaining({ sourceType: "wechat_bridge", bridgeKind: "rsshub_wechat2rss" })
  );
});

it("rejects invalid wechat bridge payloads", async () => {
  const app = createServer({ auth: AUTH_CONFIG, createSource: vi.fn() });

  const response = await app.inject({
    method: "POST",
    url: "/actions/sources",
    cookies: AUTH_COOKIES,
    payload: { sourceType: "wechat_bridge", kind: "wechat_demo", bridgeConfig: {} }
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({ ok: false, reason: "invalid-source-payload" });
});
```

- [ ] **Step 2: Run the targeted server/api tests to confirm the actions do not exist yet**

Run: `npx vitest run tests/server/systemRoutes.test.ts tests/server/createServer.test.ts tests/client/settingsApi.test.ts -v`

Expected: FAIL because there is no `POST /actions/sources`, `POST /actions/sources/:kind`, or delete action yet.

- [ ] **Step 3: Add server deps and route handlers for source mutations**

```ts
// src/server/createServer.ts
type ServerDeps = {
  createSource?: (input: SaveSourceInput) => Promise<{ ok: true } | { ok: false; reason: string }> | { ok: true } | { ok: false; reason: string };
  updateSource?: (input: SaveSourceInput) => Promise<{ ok: true } | { ok: false; reason: string }> | { ok: true } | { ok: false; reason: string };
  deleteSource?: (kind: string) => Promise<boolean> | boolean;
  // existing deps...
};

app.post("/actions/sources", async (request, reply) => {
  if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
    return;
  }

  const payload = parseSourcePayload(request.body);
  if (!payload.ok) {
    return reply.code(400).send({ ok: false, reason: "invalid-source-payload" });
  }

  const result = await deps.createSource?.(payload.value);
  return reply.send(result ?? { ok: false, reason: "sources-disabled" });
});

app.post("/actions/sources/:kind", async (request, reply) => {
  const payload = parseSourcePayload(request.body, { mode: "update", kind: (request.params as { kind: string }).kind });
  // same auth / 400 / 404 handling pattern as toggleSource
});

app.post("/actions/sources/:kind/delete", async (request, reply) => {
  const kind = typeof (request.params as { kind?: string }).kind === "string" ? (request.params as { kind: string }).kind.trim() : "";
  if (!kind) {
    return reply.code(400).send({ ok: false, reason: "invalid-source-kind" });
  }

  const deleted = await deps.deleteSource?.(kind);
  if (!deleted) {
    return reply.code(404).send({ ok: false, reason: "not-found" });
  }

  return reply.send({ ok: true, kind });
});
```

```ts
// src/client/services/settingsApi.ts
export type SaveSourcePayload =
  | {
      sourceType: "rss";
      kind: string;
      name: string;
      siteUrl: string;
      rssUrl: string;
    }
  | {
      sourceType: "wechat_bridge";
      kind: string;
      name: string;
      siteUrl: string;
      bridgeKind: "rsshub_wechat2rss";
      bridgeConfig: { accountId: string };
    };

export function createSource(payload: SaveSourcePayload) {
  return postSettingsAction<{ ok: true }>("/actions/sources", payload);
}

export function updateSource(kind: string, payload: SaveSourcePayload) {
  return postSettingsAction<{ ok: true }>(`/actions/sources/${encodeURIComponent(kind)}`, payload);
}

export function deleteSource(kind: string) {
  return postSettingsAction<{ ok: true }>(`/actions/sources/${encodeURIComponent(kind)}/delete`, {});
}
```

- [ ] **Step 4: Run the server and settings API tests again**

Run: `npx vitest run tests/server/systemRoutes.test.ts tests/server/createServer.test.ts tests/client/settingsApi.test.ts -v`

Expected: PASS with the new mutation endpoints authorized, validated, and exposed to the client service layer.

- [ ] **Step 5: Commit the server/API slice**

```bash
git add src/server/createServer.ts \
  src/server/renderSystemPages.ts \
  src/main.ts \
  src/client/services/settingsApi.ts \
  tests/server/systemRoutes.test.ts \
  tests/server/createServer.test.ts \
  tests/client/settingsApi.test.ts
git commit -m "feat: 增加来源工作台增删改接口"
```

## Task 4: Add The Unified Source Modal To `/settings/sources`

**Files:**
- Modify: `src/client/pages/settings/SourcesPage.vue`
- Test: `tests/client/sourcesPage.test.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Write the failing page tests for creating, editing, and deleting bridge sources**

```ts
it("opens the add-source modal and submits a wechat bridge source", async () => {
  vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
  vi.mocked(settingsApi.createSource).mockResolvedValue({ ok: true });

  const wrapper = mountWithApp(SourcesPage);
  await flushPromises();

  await wrapper.get("[data-action='add-source']").trigger("click");
  await wrapper.get("[data-source-type='wechat_bridge']").setValue();
  await wrapper.get("[data-source-form='kind']").setValue("wechat_demo");
  await wrapper.get("[data-source-form='name']").setValue("微信 Demo");
  await wrapper.get("[data-source-form='bridge-account-id']").setValue("demo-id");
  await wrapper.get("[data-source-form='submit']").trigger("click");
  await flushPromises();

  expect(settingsApi.createSource).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceType: "wechat_bridge",
      bridgeKind: "rsshub_wechat2rss",
      bridgeConfig: { accountId: "demo-id" }
    })
  );
});

it("deletes a non-built-in bridge source", async () => {
  vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModelWithBridgeRow());
  vi.mocked(settingsApi.deleteSource).mockResolvedValue({ ok: true });

  const wrapper = mountWithApp(SourcesPage);
  await flushPromises();
  await wrapper.get("[data-source-delete='wechat_demo']").trigger("click");
  await flushPromises();

  expect(settingsApi.deleteSource).toHaveBeenCalledWith("wechat_demo");
});
```

- [ ] **Step 2: Run the page test to confirm the current UI has no modal flow**

Run: `npx vitest run tests/client/sourcesPage.test.ts -v`

Expected: FAIL because the page only renders toggle/display actions and has no create/update/delete modal controls.

- [ ] **Step 3: Implement the unified add/edit modal and delete action**

```ts
// src/client/pages/settings/SourcesPage.vue
const sourceModalOpen = ref(false);
const sourceModalMode = ref<"create" | "edit">("create");
const editingSourceKind = ref<string | null>(null);
const sourceForm = reactive({
  sourceType: "rss" as "rss" | "wechat_bridge",
  kind: "",
  name: "",
  siteUrl: "",
  rssUrl: "",
  bridgeKind: "rsshub_wechat2rss" as const,
  bridgeAccountId: ""
});

function openCreateSourceModal() {
  sourceModalMode.value = "create";
  editingSourceKind.value = null;
  Object.assign(sourceForm, {
    sourceType: "rss",
    kind: "",
    name: "",
    siteUrl: "",
    rssUrl: "",
    bridgeKind: "rsshub_wechat2rss",
    bridgeAccountId: ""
  });
  sourceModalOpen.value = true;
}

async function submitSourceForm() {
  const payload =
    sourceForm.sourceType === "rss"
      ? {
          sourceType: "rss" as const,
          kind: sourceForm.kind.trim(),
          name: sourceForm.name.trim(),
          siteUrl: sourceForm.siteUrl.trim(),
          rssUrl: sourceForm.rssUrl.trim()
        }
      : {
          sourceType: "wechat_bridge" as const,
          kind: sourceForm.kind.trim(),
          name: sourceForm.name.trim(),
          siteUrl: sourceForm.siteUrl.trim(),
          bridgeKind: sourceForm.bridgeKind,
          bridgeConfig: { accountId: sourceForm.bridgeAccountId.trim() }
        };

  await runSourcesAction(
    sourceModalMode.value === "create" ? "create-source" : `update-source:${editingSourceKind.value ?? ""}`,
    () =>
      sourceModalMode.value === "create"
        ? createSource(payload)
        : updateSource(editingSourceKind.value!, payload),
    {
      fallbackMessage: "来源保存失败，请稍后再试。",
      successMessage: sourceModalMode.value === "create" ? "已新增来源。" : "已更新来源。"
    }
  );

  sourceModalOpen.value = false;
}
```

```md
<!-- README.md / AGENTS.md -->
- `/settings/sources` 现在支持可视化新增、编辑和删除 `RSS / 微信公众号桥接` 两类来源。
- 微信公众号桥接来源仍通过仓库内置 bridge 模块转换成 feed，主采集链路继续保持 RSS-first。
```

- [ ] **Step 4: Run the page test and the client bundle build**

Run: `npx vitest run tests/client/sourcesPage.test.ts -v`
Expected: PASS with the new modal flow and delete action wired.

Run: `npm run build:client`
Expected: PASS with the sources page compiling against the new API types and modal state.

- [ ] **Step 5: Commit the UI and docs slice**

```bash
git add src/client/pages/settings/SourcesPage.vue \
  tests/client/sourcesPage.test.ts \
  README.md \
  AGENTS.md
git commit -m "feat: 支持在来源页维护公众号桥接源"
```

## Task 5: Final Regression And Smoke Test

**Files:**
- Modify: `docs/superpowers/specs/2026-04-08-hotnow-wechat-bridge-sources-design.md` (only if the implementation forced a design correction)
- Modify: `docs/superpowers/plans/2026-04-08-hotnow-wechat-bridge-sources-migration.md` (check off steps during execution)

- [ ] **Step 1: Run the focused regression matrix**

Run: `npx vitest run tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts tests/source/sourceMutationRepository.test.ts tests/source/loadEnabledSourceIssues.test.ts tests/source/listSourceCards.test.ts tests/source/listSourceWorkbench.test.ts tests/server/systemRoutes.test.ts tests/server/createServer.test.ts tests/client/settingsApi.test.ts tests/client/sourcesPage.test.ts -v`

Expected: PASS with the new bridge source model covered across storage, loader, server actions, and page behavior.

- [ ] **Step 2: Run the full build**

Run: `npm run build`

Expected: PASS with both server and client entrypoints compiling after the source-type expansion.

- [ ] **Step 3: Perform the manual smoke test**

Run:

```bash
npm run dev:local
```

Expected: local server starts on `http://127.0.0.1:3030`.

Then verify:
- Log into `/login`.
- Open `/settings/sources`.
- Create one `微信公众号` source with provider `rsshub_wechat2rss`.
- Confirm the new row appears in the inventory table with the right type metadata.
- Trigger manual collect once and verify the app no longer rejects the source because of a missing `rss_url`.

- [ ] **Step 4: Commit any final doc corrections**

```bash
git add docs/superpowers/specs/2026-04-08-hotnow-wechat-bridge-sources-design.md \
  docs/superpowers/plans/2026-04-08-hotnow-wechat-bridge-sources-migration.md
git commit -m "chore: 同步公众号桥接来源计划与验证记录"
```
