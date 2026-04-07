# HotNow WeChat Bridge Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/settings/sources` manage third-party WeChat public-account sources by accepting either an existing bridge feed URL or a public-account article URL, resolving article URLs into a final feed during save, and keeping HotNow's collection pipeline RSS-first.

**Architecture:** Extend `content_sources` with `source_type + bridge_kind + bridge_config_json`, but continue storing a final resolved `rss_url` for every saveable source. Add a small `src/core/wechat/` registration module that either validates a feed URL or calls an external bridge service (`WECHAT_BRIDGE_BASE_URL + WECHAT_BRIDGE_TOKEN`) via `addurl`, then persists the resolved feed into `content_sources.rss_url`; collection code remains unchanged because bridge work happens only during source save/update.

**Tech Stack:** TypeScript, Fastify, Vue 3, Ant Design Vue, SQLite, Vitest

---

## File Map

**Create**

- `src/core/wechat/wechatBridgeTypes.ts`
  Define bridge input modes, provider kinds, and validated config/result types.
- `src/core/wechat/wechatBridgeProviders.ts`
  Call the external bridge service and normalize its responses into a resolved feed URL.
- `src/core/wechat/registerWechatBridgeSource.ts`
  Convert a bridge source form payload into `{ rssUrl, bridgeConfigJson }`, either by validating a direct feed URL or registering an article URL.
- `src/core/source/sourceMutationRepository.ts`
  Centralize source create / update / delete validation and persistence.

**Modify**

- `src/core/types/appConfig.ts`
  Add optional `wechatBridge` runtime config block.
- `src/core/config/loadRuntimeConfig.ts`
  Read `WECHAT_BRIDGE_BASE_URL` and `WECHAT_BRIDGE_TOKEN`.
- `.env.example`
  Document the new bridge env vars.
- `src/core/db/runMigrations.ts`
  Add `source_type`, `bridge_kind`, and `bridge_config_json` to `content_sources`.
- `src/core/db/seedInitialData.ts`
  Seed built-ins as `source_type = rss`.
- `src/core/source/listSourceCards.ts`
  Return source type and bridge metadata summary for the workbench.
- `src/core/source/listSourceWorkbench.ts`
  Carry source type metadata into sources analytics rows.
- `src/server/createServer.ts`
  Extend settings sources read model and add create / update / delete source JSON actions.
- `src/server/renderSystemPages.ts`
  Update `SourcesSettingsView` types to include source type and bridge metadata.
- `src/main.ts`
  Wire the bridge-aware source mutation repository and remove direct SQLite source creation logic from the server assembly point.
- `src/client/services/settingsApi.ts`
  Add source form payload types and create / update / delete requests.
- `src/client/pages/settings/SourcesPage.vue`
  Add a unified source modal with RSS / 微信公众号 modes, feed-url vs article-url input switching, and delete flow.
- `README.md`
  Document bridge env vars and the new sources-page flow.
- `AGENTS.md`
  Document the new source type and sources-page maintenance behavior.

**Test**

- `tests/config/loadRuntimeConfig.test.ts`
- `tests/db/runMigrations.test.ts`
- `tests/db/seedInitialData.test.ts`
- `tests/source/sourceMutationRepository.test.ts`
- `tests/source/listSourceCards.test.ts`
- `tests/source/listSourceWorkbench.test.ts`
- `tests/server/systemRoutes.test.ts`
- `tests/server/createServer.test.ts`
- `tests/client/settingsApi.test.ts`
- `tests/client/sourcesPage.test.ts`

## Task 1: Extend Source Storage And Runtime Config

**Files:**
- Modify: `src/core/types/appConfig.ts`
- Modify: `src/core/config/loadRuntimeConfig.ts`
- Modify: `.env.example`
- Modify: `src/core/db/runMigrations.ts`
- Modify: `src/core/db/seedInitialData.ts`
- Test: `tests/config/loadRuntimeConfig.test.ts`
- Test: `tests/db/runMigrations.test.ts`
- Test: `tests/db/seedInitialData.test.ts`

- [ ] **Step 1: Write the failing config and migration tests**

```ts
it("loads optional wechat bridge env vars into runtime config", async () => {
  const config = await loadRuntimeConfig({
    configPath: FIXTURE_CONFIG_PATH,
    env: {
      ...BASE_ENV,
      WECHAT_BRIDGE_BASE_URL: "https://bridge.example.test",
      WECHAT_BRIDGE_TOKEN: "secret-token"
    }
  });

  expect(config.wechatBridge).toEqual({
    baseUrl: "https://bridge.example.test",
    token: "secret-token"
  });
});

it("adds source_type, bridge_kind, and bridge_config_json to content_sources", async () => {
  const handle = await createTestDatabase("hot-now-source-migration-");
  const columns = handle.db.prepare("PRAGMA table_info(content_sources)").all() as Array<{ name: string }>;

  expect(columns.map((column) => column.name)).toEqual(
    expect.arrayContaining(["source_type", "bridge_kind", "bridge_config_json"])
  );
});

it("seeds built-ins as rss source rows", async () => {
  const handle = await createTestDatabase("hot-now-source-seed-");
  const rows = handle.db
    .prepare("SELECT kind, source_type, bridge_kind, bridge_config_json FROM content_sources ORDER BY id ASC")
    .all() as Array<{ kind: string; source_type: string; bridge_kind: string | null; bridge_config_json: string | null }>;

  expect(rows.every((row) => row.source_type === "rss" && row.bridge_kind === null && row.bridge_config_json === null)).toBe(true);
});
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run: `npx vitest run tests/config/loadRuntimeConfig.test.ts tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts -v`

Expected: FAIL because runtime config has no `wechatBridge` block and `content_sources` has no bridge metadata columns.

- [ ] **Step 3: Add the config block and source columns**

```ts
// src/core/types/appConfig.ts
export type RuntimeConfig = {
  // existing fields...
  wechatBridge?: {
    baseUrl: string;
    token: string;
  } | null;
};
```

```ts
// src/core/config/loadRuntimeConfig.ts
const wechatBridgeBaseUrl = env.WECHAT_BRIDGE_BASE_URL?.trim();
const wechatBridgeToken = env.WECHAT_BRIDGE_TOKEN?.trim();

return {
  // existing config...
  wechatBridge:
    wechatBridgeBaseUrl && wechatBridgeToken
      ? {
          baseUrl: wechatBridgeBaseUrl,
          token: wechatBridgeToken
        }
      : null
};
```

```dotenv
# .env.example
WECHAT_BRIDGE_BASE_URL=https://bridge.example.com
WECHAT_BRIDGE_TOKEN=replace_with_bridge_token
```

```ts
// src/core/db/runMigrations.ts
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
// src/core/db/seedInitialData.ts
INSERT INTO content_sources (
  kind, name, site_url, rss_url, source_type, bridge_kind, bridge_config_json, is_enabled, is_builtin, show_all_when_selected, updated_at
) VALUES (?, ?, ?, ?, 'rss', NULL, NULL, ?, 1, ?, CURRENT_TIMESTAMP)
```

- [ ] **Step 4: Re-run the targeted tests**

Run: `npx vitest run tests/config/loadRuntimeConfig.test.ts tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts -v`

Expected: PASS with optional bridge envs loaded and built-ins explicitly tagged as RSS rows.

- [ ] **Step 5: Commit the config and schema slice**

```bash
git add src/core/types/appConfig.ts \
  src/core/config/loadRuntimeConfig.ts \
  .env.example \
  src/core/db/runMigrations.ts \
  src/core/db/seedInitialData.ts \
  tests/config/loadRuntimeConfig.test.ts \
  tests/db/runMigrations.test.ts \
  tests/db/seedInitialData.test.ts
git commit -m "feat: 增加公众号桥接来源配置与存储字段"
```

## Task 2: Add Bridge Registration And Source Mutation Repository

**Files:**
- Create: `src/core/wechat/wechatBridgeTypes.ts`
- Create: `src/core/wechat/wechatBridgeProviders.ts`
- Create: `src/core/wechat/registerWechatBridgeSource.ts`
- Create: `src/core/source/sourceMutationRepository.ts`
- Test: `tests/source/sourceMutationRepository.test.ts`

- [ ] **Step 1: Write the failing repository tests for direct feed URLs and article URLs**

```ts
it("creates a bridge source from an existing feed url", async () => {
  const handle = await createTestDatabase("hot-now-feed-url-source-");

  const result = await saveSource(handle.db, {
    mode: "create",
    sourceType: "wechat_bridge",
    kind: "wechat_demo",
    name: "微信 Demo",
    siteUrl: "https://mp.weixin.qq.com/",
    bridgeKind: "wechat2rss",
    inputMode: "feed_url",
    feedUrl: "https://bridge.example.test/feed/demo.xml"
  }, { wechatBridge: null });

  expect(result).toEqual({ ok: true });
  expect(
    handle.db.prepare("SELECT rss_url FROM content_sources WHERE kind = 'wechat_demo'").get()
  ).toEqual(expect.objectContaining({ rss_url: "https://bridge.example.test/feed/demo.xml" }));
});

it("creates a bridge source from an article url by calling addurl", async () => {
  const handle = await createTestDatabase("hot-now-article-url-source-");
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ err: "", data: "https://bridge.example.test/feed/123.xml" }), { status: 200 })
  );

  const result = await saveSource(handle.db, {
    mode: "create",
    sourceType: "wechat_bridge",
    kind: "wechat_demo",
    name: "微信 Demo",
    siteUrl: "https://mp.weixin.qq.com/",
    bridgeKind: "wechat2rss",
    inputMode: "article_url",
    articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
  }, {
    wechatBridge: { baseUrl: "https://bridge.example.test", token: "secret-token" },
    fetch: fetchMock
  });

  expect(result).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledWith(
    "https://bridge.example.test/addurl?url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%3F__biz%3Dabc&k=secret-token"
  );
});

it("rejects article-url mode when bridge env vars are missing", async () => {
  const handle = await createTestDatabase("hot-now-missing-bridge-config-");

  const result = await saveSource(handle.db, {
    mode: "create",
    sourceType: "wechat_bridge",
    kind: "wechat_demo",
    name: "微信 Demo",
    siteUrl: "https://mp.weixin.qq.com/",
    bridgeKind: "wechat2rss",
    inputMode: "article_url",
    articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
  }, { wechatBridge: null });

  expect(result).toEqual({ ok: false, reason: "wechat-bridge-disabled" });
});
```

- [ ] **Step 2: Run the repository tests and verify they fail**

Run: `npx vitest run tests/source/sourceMutationRepository.test.ts -v`

Expected: FAIL because there is no bridge registration module or source mutation repository yet.

- [ ] **Step 3: Implement bridge registration and source persistence**

```ts
// src/core/wechat/wechatBridgeTypes.ts
export type WechatBridgeKind = "wechat2rss";
export type WechatBridgeInput =
  | { bridgeKind: "wechat2rss"; inputMode: "feed_url"; feedUrl: string }
  | { bridgeKind: "wechat2rss"; inputMode: "article_url"; articleUrl: string };
```

```ts
// src/core/wechat/wechatBridgeProviders.ts
export async function registerWechat2rssArticleUrl(
  articleUrl: string,
  runtime: { baseUrl: string; token: string },
  fetchImpl: typeof fetch
): Promise<string> {
  const requestUrl = `${runtime.baseUrl.replace(/\\/$/, "")}/addurl?url=${encodeURIComponent(articleUrl)}&k=${encodeURIComponent(runtime.token)}`;
  const response = await fetchImpl(requestUrl);

  if (response.status !== 200) {
    throw new Error(`Wechat bridge addurl failed with ${response.status}`);
  }

  const payload = (await response.json()) as { err?: string; data?: string };

  if (payload.err || typeof payload.data !== "string" || !payload.data.trim()) {
    throw new Error(payload.err?.trim() || "Wechat bridge did not return a feed url");
  }

  return payload.data.trim();
}
```

```ts
// src/core/wechat/registerWechatBridgeSource.ts
export async function registerWechatBridgeSource(
  input: WechatBridgeInput,
  deps: { wechatBridge: { baseUrl: string; token: string } | null; fetch: typeof fetch }
): Promise<{ rssUrl: string; bridgeConfigJson: string }> {
  if (input.inputMode === "feed_url") {
    return {
      rssUrl: input.feedUrl.trim(),
      bridgeConfigJson: JSON.stringify({ inputMode: "feed_url", feedUrl: input.feedUrl.trim() })
    };
  }

  if (!deps.wechatBridge) {
    throw new Error("wechat-bridge-disabled");
  }

  const rssUrl = await registerWechat2rssArticleUrl(input.articleUrl.trim(), deps.wechatBridge, deps.fetch);

  return {
    rssUrl,
    bridgeConfigJson: JSON.stringify({
      inputMode: "article_url",
      articleUrl: input.articleUrl.trim(),
      resolvedFrom: "wechat2rss"
    })
  };
}
```

```ts
// src/core/source/sourceMutationRepository.ts
export async function saveSource(
  db: SqliteDatabase,
  input: SaveSourceInput,
  deps: { wechatBridge: { baseUrl: string; token: string } | null; fetch: typeof fetch }
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // validate common fields...
  // for wechat_bridge call registerWechatBridgeSource(), store returned rssUrl into content_sources.rss_url
}
```

- [ ] **Step 4: Re-run the repository tests**

Run: `npx vitest run tests/source/sourceMutationRepository.test.ts -v`

Expected: PASS with both direct-feed and article-url modes covered.

- [ ] **Step 5: Commit the bridge registration slice**

```bash
git add src/core/wechat/wechatBridgeTypes.ts \
  src/core/wechat/wechatBridgeProviders.ts \
  src/core/wechat/registerWechatBridgeSource.ts \
  src/core/source/sourceMutationRepository.ts \
  tests/source/sourceMutationRepository.test.ts
git commit -m "feat: 接入公众号桥接来源注册模块"
```

## Task 3: Add Source Mutation APIs And Server Wiring

**Files:**
- Modify: `src/server/createServer.ts`
- Modify: `src/server/renderSystemPages.ts`
- Modify: `src/main.ts`
- Modify: `src/core/source/listSourceCards.ts`
- Modify: `src/core/source/listSourceWorkbench.ts`
- Test: `tests/server/systemRoutes.test.ts`
- Test: `tests/server/createServer.test.ts`

- [ ] **Step 1: Write the failing server tests for create / update / delete source actions**

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
      bridgeKind: "wechat2rss",
      inputMode: "article_url",
      articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
    }
  });

  expect(response.statusCode).toBe(200);
  expect(createSource).toHaveBeenCalledWith(
    expect.objectContaining({ sourceType: "wechat_bridge", inputMode: "article_url" })
  );
});

it("returns 400 for invalid wechat bridge payloads", async () => {
  const app = createServer({ auth: AUTH_CONFIG, createSource: vi.fn() });

  const response = await app.inject({
    method: "POST",
    url: "/actions/sources",
    cookies: AUTH_COOKIES,
    payload: { sourceType: "wechat_bridge", kind: "wechat_demo" }
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({ ok: false, reason: "invalid-source-payload" });
});
```

- [ ] **Step 2: Run the server tests and verify they fail**

Run: `npx vitest run tests/server/systemRoutes.test.ts tests/server/createServer.test.ts -v`

Expected: FAIL because source create / update / delete actions do not exist yet.

- [ ] **Step 3: Implement server deps, read-model expansion, and source actions**

```ts
// src/server/createServer.ts
type ServerDeps = {
  createSource?: (input: SaveSourceInput) => Promise<{ ok: true } | { ok: false; reason: string }>;
  updateSource?: (input: SaveSourceInput) => Promise<{ ok: true } | { ok: false; reason: string }>;
  deleteSource?: (kind: string) => Promise<boolean> | boolean;
  // existing deps...
};

app.post("/actions/sources", async (request, reply) => {
  // auth
  // parseSourcePayload(request.body)
  // deps.createSource(...)
});

app.post("/actions/sources/:kind", async (request, reply) => {
  // auth
  // parseSourcePayload(request.body, existing kind)
  // deps.updateSource(...)
});

app.post("/actions/sources/:kind/delete", async (request, reply) => {
  // auth
  // deps.deleteSource(kind)
});
```

```ts
// src/main.ts
const saveSourceFromServer = async (input: SaveSourceInput) =>
  await saveSource(db, input, {
    wechatBridge: config.wechatBridge ?? null,
    fetch
  });
```

```ts
// src/core/source/listSourceCards.ts
export type SourceCard = {
  kind: string;
  name: string;
  sourceType: "rss" | "wechat_bridge";
  rssUrl: string | null;
  bridgeKind: string | null;
  bridgeConfigSummary: string | null;
  // existing fields...
};
```

- [ ] **Step 4: Re-run the targeted server tests**

Run: `npx vitest run tests/server/systemRoutes.test.ts tests/server/createServer.test.ts -v`

Expected: PASS with auth-protected source mutation actions wired and source read models carrying type metadata.

- [ ] **Step 5: Commit the server-wiring slice**

```bash
git add src/server/createServer.ts \
  src/server/renderSystemPages.ts \
  src/main.ts \
  src/core/source/listSourceCards.ts \
  src/core/source/listSourceWorkbench.ts \
  tests/server/systemRoutes.test.ts \
  tests/server/createServer.test.ts
git commit -m "feat: 增加来源工作台桥接来源接口"
```

## Task 4: Add The Unified Source Modal To `/settings/sources`

**Files:**
- Modify: `src/client/services/settingsApi.ts`
- Modify: `src/client/pages/settings/SourcesPage.vue`
- Test: `tests/client/settingsApi.test.ts`
- Test: `tests/client/sourcesPage.test.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Write the failing client tests for bridge form modes**

```ts
it("submits a wechat bridge source from article-url mode", async () => {
  vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
  vi.mocked(settingsApi.createSource).mockResolvedValue({ ok: true });

  const wrapper = mountWithApp(SourcesPage);
  await flushPromises();

  await wrapper.get("[data-action='add-source']").trigger("click");
  await wrapper.get("[data-source-type='wechat_bridge']").trigger("click");
  await wrapper.get("[data-bridge-input-mode='article_url']").trigger("click");
  await wrapper.get("[data-source-form='kind']").setValue("wechat_demo");
  await wrapper.get("[data-source-form='name']").setValue("微信 Demo");
  await wrapper.get("[data-source-form='article-url']").setValue("https://mp.weixin.qq.com/s?__biz=abc");
  await wrapper.get("[data-source-form='submit']").trigger("click");
  await flushPromises();

  expect(settingsApi.createSource).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceType: "wechat_bridge",
      inputMode: "article_url",
      articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
    })
  );
});

it("submits a wechat bridge source from feed-url mode", async () => {
  vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());
  vi.mocked(settingsApi.createSource).mockResolvedValue({ ok: true });

  const wrapper = mountWithApp(SourcesPage);
  await flushPromises();

  await wrapper.get("[data-action='add-source']").trigger("click");
  await wrapper.get("[data-source-type='wechat_bridge']").trigger("click");
  await wrapper.get("[data-bridge-input-mode='feed_url']").trigger("click");
  await wrapper.get("[data-source-form='feed-url']").setValue("https://bridge.example.test/feed/demo.xml");
  await wrapper.get("[data-source-form='submit']").trigger("click");
  await flushPromises();

  expect(settingsApi.createSource).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceType: "wechat_bridge",
      inputMode: "feed_url",
      feedUrl: "https://bridge.example.test/feed/demo.xml"
    })
  );
});
```

- [ ] **Step 2: Run the client tests and verify they fail**

Run: `npx vitest run tests/client/settingsApi.test.ts tests/client/sourcesPage.test.ts -v`

Expected: FAIL because the client service and page have no source modal, no bridge input modes, and no create/update/delete requests.

- [ ] **Step 3: Implement the client service and modal flow**

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
      bridgeKind: "wechat2rss";
      inputMode: "feed_url";
      feedUrl: string;
    }
  | {
      sourceType: "wechat_bridge";
      kind: string;
      name: string;
      siteUrl: string;
      bridgeKind: "wechat2rss";
      inputMode: "article_url";
      articleUrl: string;
    };
```

```ts
// src/client/pages/settings/SourcesPage.vue
const sourceForm = reactive({
  sourceType: "rss" as "rss" | "wechat_bridge",
  bridgeInputMode: "feed_url" as "feed_url" | "article_url",
  kind: "",
  name: "",
  siteUrl: "",
  rssUrl: "",
  feedUrl: "",
  articleUrl: ""
});

function buildSourcePayload(): settingsApi.SaveSourcePayload {
  if (sourceForm.sourceType === "rss") {
    return {
      sourceType: "rss",
      kind: sourceForm.kind.trim(),
      name: sourceForm.name.trim(),
      siteUrl: sourceForm.siteUrl.trim(),
      rssUrl: sourceForm.rssUrl.trim()
    };
  }

  if (sourceForm.bridgeInputMode === "feed_url") {
    return {
      sourceType: "wechat_bridge",
      kind: sourceForm.kind.trim(),
      name: sourceForm.name.trim(),
      siteUrl: sourceForm.siteUrl.trim(),
      bridgeKind: "wechat2rss",
      inputMode: "feed_url",
      feedUrl: sourceForm.feedUrl.trim()
    };
  }

  return {
    sourceType: "wechat_bridge",
    kind: sourceForm.kind.trim(),
    name: sourceForm.name.trim(),
    siteUrl: sourceForm.siteUrl.trim(),
    bridgeKind: "wechat2rss",
    inputMode: "article_url",
    articleUrl: sourceForm.articleUrl.trim()
  };
}
```

```md
<!-- README.md / AGENTS.md -->
- `/settings/sources` 现在支持新增 `微信公众号` 来源，并允许通过现成 bridge feed URL 或公众号文章链接保存。
- 使用文章链接模式时，需要显式配置 `WECHAT_BRIDGE_BASE_URL` 和 `WECHAT_BRIDGE_TOKEN`。
```

- [ ] **Step 4: Re-run the client tests and build the client bundle**

Run: `npx vitest run tests/client/settingsApi.test.ts tests/client/sourcesPage.test.ts -v`
Expected: PASS with both bridge input modes wired.

Run: `npm run build:client`
Expected: PASS with the new modal and source payload types compiled.

- [ ] **Step 5: Commit the UI and docs slice**

```bash
git add src/client/services/settingsApi.ts \
  src/client/pages/settings/SourcesPage.vue \
  tests/client/settingsApi.test.ts \
  tests/client/sourcesPage.test.ts \
  README.md \
  AGENTS.md
git commit -m "feat: 支持通过文章链接新增公众号桥接源"
```

## Task 5: Final Regression And Smoke Test

**Files:**
- Modify: `docs/superpowers/specs/2026-04-08-hotnow-wechat-bridge-sources-design.md` (only if implementation forces a design correction)
- Modify: `docs/superpowers/plans/2026-04-08-hotnow-wechat-bridge-sources-migration.md` (check off steps while executing)

- [ ] **Step 1: Run the focused regression matrix**

Run: `npx vitest run tests/config/loadRuntimeConfig.test.ts tests/db/runMigrations.test.ts tests/db/seedInitialData.test.ts tests/source/sourceMutationRepository.test.ts tests/source/listSourceCards.test.ts tests/source/listSourceWorkbench.test.ts tests/server/systemRoutes.test.ts tests/server/createServer.test.ts tests/client/settingsApi.test.ts tests/client/sourcesPage.test.ts -v`

Expected: PASS with bridge config, save-time registration, source actions, and sources-page form behavior all covered.

- [ ] **Step 2: Run the full build**

Run: `npm run build`

Expected: PASS with both server and client compiling after the new bridge config and sources-page flow.

- [ ] **Step 3: Perform the manual smoke test**

Run:

```bash
npm run dev:local
```

Expected: local server starts on `http://127.0.0.1:3030`.

Then verify:
- Log into `/login`.
- Open `/settings/sources`.
- Create one `微信公众号` source using `文章链接` mode.
- Confirm save succeeds only when `WECHAT_BRIDGE_BASE_URL` and `WECHAT_BRIDGE_TOKEN` are configured.
- Confirm the saved row appears in the inventory list and now carries a resolved `rss_url`.
- Trigger manual collect once and verify the collector treats that source like a normal feed source.

- [ ] **Step 4: Commit any final doc corrections**

```bash
git add docs/superpowers/specs/2026-04-08-hotnow-wechat-bridge-sources-design.md \
  docs/superpowers/plans/2026-04-08-hotnow-wechat-bridge-sources-migration.md
git commit -m "chore: 同步公众号桥接来源计划与验证记录"
```
