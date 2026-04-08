# HotNow 微信公众号 Relay 解析迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 HotNow 本地不再直接访问公共公众号 bridge/provider，而是只通过一个远端 relay 解析公众号来源并继续复用现有 RSS-first 采集链路。

**Architecture:** 保留现有 `/settings/sources -> resolveSourceUserInput -> saveSource -> content_sources.rss_url` 主流程，但把 `resolveSourceUserInput` 中的微信公众号分支从“本地直连 bridge/provider”改成“调用 relay client”。本仓库只实现 resolver client、配置切换、错误映射和回归测试；远端 relay 自身不在本仓库实现。

**Tech Stack:** Node.js、TypeScript、Fastify、Vue 3、Vite、Vitest、现有 SQLite source 仓储

---

### Task 1: 切换运行时配置到 Relay 语义

**Files:**
- Modify: `src/core/types/appConfig.ts`
- Modify: `src/core/config/loadRuntimeConfig.ts`
- Modify: `tests/config/loadRuntimeConfig.test.ts`
- Modify: `.env.example`
- Test: `tests/config/loadRuntimeConfig.test.ts`

- [ ] **Step 1: 先写配置测试，要求只认 resolver 配置，不再认 bridge 配置**

```ts
it("loads optional wechat resolver env values when provided", async () => {
  const config = await loadRuntimeConfig({
    configPath: path.resolve("config/hot-now.config.json"),
    env: {
      ...baseEnv,
      WECHAT_RESOLVER_BASE_URL: "https://resolver.example.test",
      WECHAT_RESOLVER_TOKEN: "resolver-secret"
    }
  });

  expect(config.wechatResolver).toEqual({
    baseUrl: "https://resolver.example.test",
    token: "resolver-secret"
  });
});

it("keeps wechat resolver config null when env values are missing", async () => {
  const config = await loadRuntimeConfig({
    configPath: path.resolve("config/hot-now.config.json"),
    env: baseEnv
  });

  expect(config.wechatResolver).toBeNull();
});
```

- [ ] **Step 2: 跑配置测试，确认新字段还不存在时先失败**

Run: `npx vitest run tests/config/loadRuntimeConfig.test.ts -v`
Expected: FAIL，提示 `wechatResolver` 字段或新环境变量断言不成立

- [ ] **Step 3: 修改运行时类型和配置加载逻辑**

```ts
export type RuntimeConfig = {
  // ...existing fields...
  wechatResolver?: {
    baseUrl: string;
    token: string;
  } | null;
};
```

```ts
const wechatResolverBaseUrl = env.WECHAT_RESOLVER_BASE_URL?.trim();
const wechatResolverToken = env.WECHAT_RESOLVER_TOKEN?.trim();

return {
  // ...existing config...
  wechatResolver:
    wechatResolverBaseUrl && wechatResolverToken
      ? {
          baseUrl: wechatResolverBaseUrl,
          token: wechatResolverToken
        }
      : null
};
```

```env
WECHAT_RESOLVER_BASE_URL=https://resolver.example.com
WECHAT_RESOLVER_TOKEN=replace_with_internal_resolver_token
```

- [ ] **Step 4: 重跑配置测试**

Run: `npx vitest run tests/config/loadRuntimeConfig.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/types/appConfig.ts src/core/config/loadRuntimeConfig.ts tests/config/loadRuntimeConfig.test.ts .env.example
git commit -m "refactor: 切换微信公众号配置到 resolver 语义"
```

### Task 2: 新增 Relay Client 并替换本地直连 bridge/provider 的入口

**Files:**
- Create: `src/core/wechat/wechatResolverClient.ts`
- Modify: `src/core/source/resolveSourceUserInput.ts`
- Modify: `src/core/source/sourceMutationRepository.ts`
- Modify: `src/main.ts`
- Modify: `src/server/createServer.ts`
- Modify: `tests/source/resolveSourceUserInput.test.ts`
- Modify: `tests/source/sourceMutationRepository.test.ts`
- Modify: `tests/server/systemRoutes.test.ts`
- Test: `tests/source/resolveSourceUserInput.test.ts`
- Test: `tests/source/sourceMutationRepository.test.ts`
- Test: `tests/server/systemRoutes.test.ts`

- [ ] **Step 1: 先把微信公众号输入解析测试改成“调用 relay”，不再断言直连 addurl/list**

```ts
it("resolves a wechat source via relay from article url", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        ok: true,
        rssUrl: "https://resolver.example.test/feed/123.xml",
        resolvedName: "数字生命卡兹克",
        siteUrl: "https://mp.weixin.qq.com/",
        resolverSummary: "resolved-via:wechat2rss-article"
      }),
      { status: 200 }
    )
  );

  await expect(
    resolveSourceUserInput(
      {
        mode: "create",
        sourceType: "wechat_bridge",
        wechatName: "数字生命卡兹克",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
      },
      {
        fetch: fetchMock,
        wechatResolver: { baseUrl: "https://resolver.example.test", token: "resolver-secret" }
      }
    )
  ).resolves.toMatchObject({
    sourceType: "wechat_bridge",
    name: "数字生命卡兹克",
    siteUrl: "https://mp.weixin.qq.com/",
    rssUrl: "https://resolver.example.test/feed/123.xml"
  });
});
```

```ts
it("returns wechat-resolver-disabled when resolver config is missing", async () => {
  const result = await saveSource(
    handle.db,
    {
      mode: "create",
      sourceType: "wechat_bridge",
      wechatName: "数字生命卡兹克"
    },
    { wechatResolver: null }
  );

  expect(result).toEqual({ ok: false, reason: "wechat-resolver-disabled" });
});
```

- [ ] **Step 2: 运行最小测试矩阵，让新入口先红**

Run: `npx vitest run tests/source/resolveSourceUserInput.test.ts tests/source/sourceMutationRepository.test.ts tests/server/systemRoutes.test.ts -v`
Expected: FAIL，旧实现仍在调用 `wechatBridge` 或返回旧错误码

- [ ] **Step 3: 新增 relay client，并在解析层接入**

```ts
export type WechatResolverRuntimeConfig = {
  baseUrl: string;
  token: string;
};

export async function resolveWechatSourceViaRelay(
  input: { wechatName?: string; articleUrl?: string },
  runtime: WechatResolverRuntimeConfig,
  fetchFn: typeof fetch = fetch
): Promise<{
  rssUrl: string;
  resolvedName: string;
  siteUrl: string;
  resolverSummary: string;
}> {
  const response = await fetchFn(`${runtime.baseUrl.replace(/\/$/, "")}/wechat/resolve-source`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${runtime.token}`
    },
    body: JSON.stringify(input)
  });

  // Map relay errors into local business errors here.
}
```

```ts
const resolved = await resolveWechatSourceViaRelay(
  {
    wechatName: name,
    ...(input.articleUrl ? { articleUrl: normalizeHttpUrl(input.articleUrl) } : {})
  },
  deps.wechatResolver,
  deps.fetch
);

return {
  mode: input.mode,
  sourceType: "wechat_bridge",
  kind: input.mode === "update" ? normalizeKind(input.kind) : buildWechatKind(resolved.resolvedName),
  name: resolved.resolvedName,
  siteUrl: resolved.siteUrl,
  rssUrl: resolved.rssUrl,
  bridgeKind: "resolver",
  bridgeConfigJson: JSON.stringify({
    inputMode: input.articleUrl ? "article_url" : "name_lookup",
    wechatName: name,
    ...(input.articleUrl ? { articleUrl: normalizeHttpUrl(input.articleUrl) } : {}),
    resolvedFrom: resolved.resolverSummary
  })
};
```

- [ ] **Step 4: 把 repository / main / server 全部改成 `wechatResolver` 依赖和错误码**

```ts
// sourceMutationRepository.ts
export type SaveSourceResult =
  | { ok: true; kind: string }
  | { ok: false; reason: "wechat-resolver-disabled" | "wechat-resolver-not-found" | "resolver-unavailable" | "invalid-rss-feed" | "invalid-input" | "already-exists" | "not-found" | "built-in" };
```

```ts
// main.ts
createSource: async (input) =>
  await persistSource(db, input, {
    wechatResolver: config.wechatResolver ?? null
  }),
```

```ts
// createServer.ts
if (result.reason === "wechat-resolver-disabled") {
  return reply.code(503).send({ ok: false, reason: "wechat-resolver-disabled" });
}
```

- [ ] **Step 5: 重跑后端相关测试**

Run: `npx vitest run tests/source/resolveSourceUserInput.test.ts tests/source/sourceMutationRepository.test.ts tests/server/systemRoutes.test.ts -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/wechat/wechatResolverClient.ts src/core/source/resolveSourceUserInput.ts src/core/source/sourceMutationRepository.ts src/main.ts src/server/createServer.ts tests/source/resolveSourceUserInput.test.ts tests/source/sourceMutationRepository.test.ts tests/server/systemRoutes.test.ts
git commit -m "feat: 接入微信公众号 resolver client"
```

### Task 3: 收口 Sources 页面与提示文案到 Resolver 模型

**Files:**
- Modify: `src/client/services/settingsApi.ts`
- Modify: `src/client/pages/settings/SourcesPage.vue`
- Modify: `tests/client/settingsApi.test.ts`
- Modify: `tests/client/sourcesPage.test.ts`
- Test: `tests/client/settingsApi.test.ts`
- Test: `tests/client/sourcesPage.test.ts`

- [ ] **Step 1: 先写前端断言，要求 UI 和接口都不再出现 bridge 词汇**

```ts
expect(settingsApi.createSource).toHaveBeenCalledWith({
  sourceType: "wechat_bridge",
  wechatName: "数字生命卡兹克",
  articleUrl: "https://mp.weixin.qq.com/s?__biz=abc"
});
```

```ts
expect(wrapper.text()).toContain("当前已配置公众号解析服务，可直接填写公众号名称");
expect(wrapper.text()).not.toContain("bridge");
expect(wrapper.text()).not.toContain("feed URL");
```

- [ ] **Step 2: 运行前端测试，让旧 capability 文案和 reason 映射先失败**

Run: `npx vitest run tests/client/settingsApi.test.ts tests/client/sourcesPage.test.ts -v`
Expected: FAIL，仍然命中 `bridge` 文案或旧 reason

- [ ] **Step 3: 修改 client payload、capability 文案和错误映射**

```ts
export type SettingsSourcesCapability = {
  wechatResolverEnabled: boolean;
  wechatResolverMessage: string;
};
```

```ts
const wechatResolverAvailable = computed(
  () => sourcesModel.value?.capability.wechatResolverEnabled ?? false
);
```

```ts
const message = readActionErrorMessage(error, fallback, {
  "wechat-resolver-disabled": "当前未配置公众号解析服务，暂时无法新增公众号来源。",
  "wechat-resolver-not-found": "没有找到这个公众号的可用来源，请检查名称或补一篇文章链接。",
  "resolver-unavailable": "公众号解析服务当前不可用，请稍后再试。"
});
```

- [ ] **Step 4: 重跑前端测试**

Run: `npx vitest run tests/client/settingsApi.test.ts tests/client/sourcesPage.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/services/settingsApi.ts src/client/pages/settings/SourcesPage.vue tests/client/settingsApi.test.ts tests/client/sourcesPage.test.ts
git commit -m "refactor: 收口 sources 页到 resolver 文案"
```

### Task 4: 清理本地 bridge 直连残留并补文档

**Files:**
- Modify: `src/core/wechat/registerWechatBridgeSource.ts`
- Modify: `src/core/wechat/wechatBridgeProviders.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `.env.example`
- Modify: `tests/source/listSourceCards.test.ts`
- Modify: `tests/source/listSourceWorkbench.test.ts` (only if required by display changes)
- Test: `tests/source/listSourceCards.test.ts`

- [ ] **Step 1: 先把读模型测试收口到 relay 审计语义**

```ts
expect(cards.find((card) => card.kind === "wechat_lookup")).toMatchObject({
  sourceType: "wechat_bridge",
  bridgeKind: "resolver",
  bridgeConfigSummary: "公众号名称检索",
  bridgeInputMode: "name_lookup",
  bridgeInputValue: "数字生命卡兹克"
});
```

- [ ] **Step 2: 运行读模型测试，确认旧 `wechat2rss` 直连摘要还在时先失败**

Run: `npx vitest run tests/source/listSourceCards.test.ts -v`
Expected: FAIL，如果仍然依赖旧 `wechat2rss` 直连语义

- [ ] **Step 3: 清理或降级本地 bridge 模块，并同步文档**

```ts
// registerWechatBridgeSource.ts
throw new Error("wechat-direct-bridge-removed");
```

或直接把该模块收口成对 `wechatResolverClient` 的兼容壳，但不要再访问第三方 provider。

```md
- `WECHAT_RESOLVER_BASE_URL`
- `WECHAT_RESOLVER_TOKEN`
```

```md
`/settings/sources` 中新增公众号来源时，HotNow 本地只调用内部 resolver，不再直接访问公共 bridge/provider。
```

- [ ] **Step 4: 跑读模型测试与文档相关最小回归**

Run: `npx vitest run tests/source/listSourceCards.test.ts tests/source/listSourceWorkbench.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/wechat/registerWechatBridgeSource.ts src/core/wechat/wechatBridgeProviders.ts README.md AGENTS.md .env.example tests/source/listSourceCards.test.ts tests/source/listSourceWorkbench.test.ts
git commit -m "docs: 同步微信公众号 resolver 协作说明"
```

### Task 5: 最终验证

**Files:**
- Verify only

- [ ] **Step 1: 跑本轮最相关测试矩阵**

Run: `npx vitest run tests/config/loadRuntimeConfig.test.ts tests/source/readFeedMetadata.test.ts tests/source/resolveSourceUserInput.test.ts tests/source/sourceMutationRepository.test.ts tests/source/listSourceCards.test.ts tests/source/listSourceWorkbench.test.ts tests/server/systemRoutes.test.ts tests/client/settingsApi.test.ts tests/client/sourcesPage.test.ts`
Expected: PASS

- [ ] **Step 2: 跑客户端构建**

Run: `npm run build:client`
Expected: PASS

- [ ] **Step 3: 跑完整构建**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit final verification notes if docs changed during fixes**

```bash
git status --short
```

Expected: no unexpected modified files; if docs changed during verification, stage only the intentional updates and commit with:

```bash
git commit -m "chore: 收口微信公众号 resolver 验证与文档"
```

## Self-Review

- Spec coverage: 已覆盖本地配置切换、resolver client 引入、旧 bridge/provider 直连退出、前端文案与错误口径、文档与验证矩阵。
- Placeholder scan: 已去掉 `TODO/TBD`，每个任务都给了文件、命令和代码骨架。
- Type consistency: 计划统一使用 `wechatResolver`、`WECHAT_RESOLVER_BASE_URL`、`WECHAT_RESOLVER_TOKEN`、`resolveWechatSourceViaRelay(...)`，避免与旧 `wechatBridge` 命名混用。

