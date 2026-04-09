# HotNow View Rules Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify `/settings/view-rules` into a `反馈池 + LLM 设置（暂未使用）` page by removing the gate-based NL rule editor, the draft workflow, and the page-level strategy/evaluation logic.

**Architecture:** Keep the route and the feedback-pool write path intact, but cut the strategy chain at the page/read-model/action layer. The implementation removes UI sections, deletes unused page routes and handlers, shrinks the settings API payload, and updates runtime wiring so `/settings/view-rules` no longer depends on NL-rule or draft operations. Existing NL-related tables remain in place for now; this is a product-surface simplification, not a schema cleanup.

**Tech Stack:** Vue 3, Ant Design Vue, Tailwind CSS, Fastify, TypeScript, Vitest

---

### Task 1: Simplify the settings API client contract

**Files:**
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/services/settingsApi.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/client/settingsApi.test.ts`

- [ ] **Step 1: Write the failing client contract tests**

Add or update tests so the settings API client no longer exposes or calls draft/NL-rule actions.

```ts
it("reads the simplified view-rules payload without nl-rules or drafts", async () => {
  requestJson.mockResolvedValueOnce({
    providerCapability: {
      featureAvailable: false,
      hasMasterKey: true,
      enabledProviderKind: null
    },
    providerSettings: [],
    feedbackPool: []
  });

  const result = await readSettingsViewRules();

  expect("nlRules" in result).toBe(false);
  expect("strategyDrafts" in result).toBe(false);
  expect("latestEvaluationRun" in result).toBe(false);
});

it("does not export draft or nl-rule write helpers anymore", async () => {
  const module = await import("../../src/client/services/settingsApi");

  expect("saveNlRules" in module).toBe(false);
  expect("cancelNlEvaluation" in module).toBe(false);
  expect("createDraftFromFeedback" in module).toBe(false);
  expect("saveStrategyDraft" in module).toBe(false);
  expect("deleteStrategyDraft" in module).toBe(false);
});
```

- [ ] **Step 2: Run the client API test to verify it fails**

Run:

```bash
npx vitest run tests/client/settingsApi.test.ts
```

Expected: FAIL because `settingsApi.ts` still defines draft / nl-rule types and helpers.

- [ ] **Step 3: Remove the unused client-side strategy helpers and types**

Update `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/services/settingsApi.ts`:

- remove types related to:
  - `SettingsStrategyGateScope`
  - `SettingsStrategyDraftScope`
  - `SettingsStrategyDraftItem`
  - `SaveNlRulesResponse`
  - `CancelNlEvaluationResponse`
  - draft response types
- keep only:
  - `providerCapability`
  - `providerSettings`
  - `feedbackPool`
  - provider save / activation / delete helpers
  - feedback clear / delete helpers

Expected shape after the edit:

```ts
export type SettingsViewRulesResponse = {
  providerCapability: {
    featureAvailable: boolean;
    hasMasterKey: boolean;
    enabledProviderKind: SettingsProviderKind | null;
  };
  providerSettings: SettingsProviderSettingsSummary[];
  feedbackPool: SettingsFeedbackPoolItem[];
};

export async function readSettingsViewRules(): Promise<SettingsViewRulesResponse> {
  return requestJson<SettingsViewRulesResponse>("/api/settings/view-rules");
}
```

- [ ] **Step 4: Run the client API test to verify it passes**

Run:

```bash
npx vitest run tests/client/settingsApi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit yet if the branch still contains unrelated unstaged work. If the worker has isolated only the API-contract diff, commit with:

```bash
git add src/client/services/settingsApi.ts tests/client/settingsApi.test.ts
git commit -m "refactor: 收口筛选策略页客户端接口契约"
```

### Task 2: Remove strategy and draft sections from the Vue page

**Files:**
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/pages/settings/ViewRulesPage.vue`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/client/viewRulesPage.test.ts`

- [ ] **Step 1: Write failing page tests for the simplified UI**

Update the page test so `/settings/view-rules` keeps only `反馈池` and `LLM 设置`.

```ts
it("renders only feedback pool and llm settings on the simplified page", async () => {
  settingsApiMocks.readSettingsViewRules.mockResolvedValueOnce({
    providerCapability: {
      featureAvailable: false,
      hasMasterKey: true,
      enabledProviderKind: null
    },
    providerSettings: [],
    feedbackPool: []
  });

  const wrapper = mount(ViewRulesPage, {
    global: { plugins: [Antd] }
  });

  await flushPromises();

  expect(wrapper.text()).toContain("反馈池");
  expect(wrapper.text()).toContain("LLM 设置");
  expect(wrapper.text()).toContain("暂未使用");

  expect(wrapper.find("[data-settings-section='feedback-pool']").exists()).toBe(true);
  expect(wrapper.find("[data-settings-section='provider-settings']").exists()).toBe(true);

  expect(wrapper.find("[data-settings-section='nl-rules']").exists()).toBe(false);
  expect(wrapper.find("[data-settings-section='strategy-drafts']").exists()).toBe(false);
  expect(wrapper.text()).not.toContain("正式自然语言策略");
  expect(wrapper.text()).not.toContain("草稿池");
});
```

- [ ] **Step 2: Run the page test to verify it fails**

Run:

```bash
npx vitest run tests/client/viewRulesPage.test.ts
```

Expected: FAIL because the page still renders NL rules, drafts, and related action buttons.

- [ ] **Step 3: Strip the page down to feedback pool and unused LLM settings**

In `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/pages/settings/ViewRulesPage.vue`:

- remove imports and state for:
  - `saveNlRules`
  - `cancelNlEvaluation`
  - `createDraftFromFeedback`
  - `saveStrategyDraft`
  - `deleteStrategyDraft`
  - draft forms
  - gate-rule forms
  - run-status timers and summary state
- keep:
  - provider settings form and actions
  - feedback pool list
  - feedback copy / clear / delete actions
- add static “暂未使用” messaging for the provider section

The retained section structure should look like this:

```vue
<section :class="editorialContentSubpanelClass" data-settings-section="feedback-pool">
  <header class="flex items-start justify-between gap-3">
    <div>
      <h2 class="text-lg font-semibold text-editorial-text-main">反馈池</h2>
      <p class="text-sm text-editorial-text-body">这里集中查看、整理和清理内容页写入的反馈词。</p>
    </div>
  </header>
  <!-- feedback rows / empty state -->
</section>

<section :class="editorialContentSubpanelClass" data-settings-section="provider-settings">
  <header class="flex items-start justify-between gap-3">
    <div>
      <h2 class="text-lg font-semibold text-editorial-text-main">LLM 设置</h2>
      <p class="text-sm text-editorial-text-body">
        当前版本暂不使用 LLM 设置参与筛选策略或重算，先保留配置入口供后续功能复用。
      </p>
    </div>
    <a-tag color="default">暂未使用</a-tag>
  </header>
  <!-- provider settings form -->
</section>
```

- [ ] **Step 4: Update empty-state copy and action text**

Ensure the feedback-pool empty state and card-level copy no longer mention drafts or formal strategy.

Target copy:

```ts
const feedbackEmptyState = {
  title: "反馈池为空",
  description: "内容页提交的新反馈词会显示在这里。"
};
```

Any existing status/help text like `转成草稿` or `写入正式策略` must be removed.

- [ ] **Step 5: Run the page test to verify it passes**

Run:

```bash
npx vitest run tests/client/viewRulesPage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

If the page diff is isolated:

```bash
git add src/client/pages/settings/ViewRulesPage.vue tests/client/viewRulesPage.test.ts
git commit -m "refactor: 精简筛选策略页为反馈池与LLM设置"
```

### Task 3: Remove strategy and draft routes from the Fastify server

**Files:**
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/server/createServer.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/server/systemRoutes.test.ts`

- [ ] **Step 1: Write failing server-route tests**

Replace existing expectations so removed actions now return 404 and the retained actions still work.

```ts
it("does not register nl-rule or draft actions anymore", async () => {
  const app = createSystemTestServer();

  for (const url of [
    "/actions/view-rules/nl-rules",
    "/actions/view-rules/nl-rules/cancel",
    "/actions/feedback-pool/1/create-draft",
    "/actions/strategy-drafts/1/save",
    "/actions/strategy-drafts/1/delete"
  ]) {
    const response = await app.inject({ method: "POST", url });
    expect(response.statusCode).toBe(404);
  }
});
```

- [ ] **Step 2: Run the system-routes test to verify it fails**

Run:

```bash
npx vitest run tests/server/systemRoutes.test.ts
```

Expected: FAIL because these POST routes are still registered.

- [ ] **Step 3: Delete the strategy and draft action handlers**

In `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/server/createServer.ts`:

- remove handler blocks for:
  - `app.post("/actions/view-rules/nl-rules", ...)`
  - `app.post("/actions/view-rules/nl-rules/cancel", ...)`
  - `app.post("/actions/feedback-pool/:id/create-draft", ...)`
  - `app.post("/actions/strategy-drafts/:id/save", ...)`
  - `app.post("/actions/strategy-drafts/:id/delete", ...)`
- remove the corresponding `ServerDeps` entries and helper result types that become unused
- keep provider settings and feedback-pool delete/clear actions untouched

The server type section should no longer include types like:

```ts
type SaveNlRulesResult = ...
type CancelNlEvaluationResult = ...
type CreateDraftFromFeedbackResult = ...
type DeleteDraftResult = ...
```

unless still needed elsewhere in the same file after the route deletion.

- [ ] **Step 4: Run the system-routes test to verify it passes**

Run:

```bash
npx vitest run tests/server/systemRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

If isolated:

```bash
git add src/server/createServer.ts tests/server/systemRoutes.test.ts
git commit -m "refactor: 删除筛选策略页草稿与自然语言动作"
```

### Task 4: Shrink the view-rules read model and runtime wiring

**Files:**
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/main.ts`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/router.ts`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/core/types/appConfig.ts` only if type references force cleanup
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/client/appShell.test.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/server/systemRoutes.test.ts`

- [ ] **Step 1: Write failing tests for the new page model shape and route copy**

Add assertions that the view-rules route description and fetched model no longer reference NL rules or drafts.

```ts
it("describes the route as feedback-pool management, not strategy editing", async () => {
  const route = settingsRoutes.find((entry) => entry.to === "/settings/view-rules");
  expect(route?.description).toContain("反馈池");
  expect(route?.description).not.toContain("草稿池");
  expect(route?.description).not.toContain("自然语言规则");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run tests/client/appShell.test.ts tests/server/systemRoutes.test.ts
```

Expected: FAIL because the route copy and injected workbench model still include removed strategy concepts.

- [ ] **Step 3: Remove unused main.ts wiring and simplify the workbench model**

In `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/main.ts`:

- stop importing / wiring:
  - NL rule save dependencies
  - evaluation cancel dependencies
  - strategy-draft dependencies
  - feedback-to-draft bridging
- ensure `getViewRulesWorkbenchData` returns only the data needed by:
  - `providerCapability`
  - `providerSettings`
  - `feedbackPool`

Expected return shape:

```ts
return {
  providerCapability,
  providerSettings,
  feedbackPool
};
```

- [ ] **Step 4: Update route metadata copy**

In `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/router.ts`, change the route description so it reflects the simplified page.

Target direction:

```ts
description: "维护反馈池，并保留暂未使用的 LLM 设置入口。"
```

- [ ] **Step 5: Re-run the focused tests**

Run:

```bash
npx vitest run tests/client/appShell.test.ts tests/server/systemRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

If isolated:

```bash
git add src/main.ts src/client/router.ts tests/client/appShell.test.ts tests/server/systemRoutes.test.ts
git commit -m "refactor: 收口筛选策略页读模型与运行时装配"
```

### Task 5: Remove dead client interactions and legacy page copy

**Files:**
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/server/public/site.js`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/server/renderSystemPages.ts` only if legacy SSR still references strategy/drafts
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/components/content/ContentHeroCard.vue`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/components/content/ContentStandardCard.vue`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/server/siteThemeClient.test.ts`

- [ ] **Step 1: Write a failing test or assertion for removed strategy interactions**

Add expectations that no UI copy or client action handlers still reference drafts or formal strategy.

```ts
expect(pageText).not.toContain("转成草稿");
expect(pageText).not.toContain("正式自然语言策略");
expect(pageText).not.toContain("写入正式策略编辑器");
```

- [ ] **Step 2: Run the focused client-behavior test**

Run:

```bash
npx vitest run tests/server/siteThemeClient.test.ts tests/client/viewRulesPage.test.ts
```

Expected: FAIL because old strings and handlers are still present.

- [ ] **Step 3: Remove dead handlers and update content-card status text**

In `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/server/public/site.js`:

- delete branches handling:
  - `draft-apply`
  - `nl-rules-save`
  - `feedback-draft-create`
  - `draft-save`
  - `draft-delete`
- keep only handlers still reachable from retained SSR/system actions

In content cards, keep wording aligned with feedback-only behavior:

```ts
statusText.value = "反馈词已保存到反馈池";
void message.success("反馈词已保存到反馈池");
```

- [ ] **Step 4: Re-run the focused tests**

Run:

```bash
npx vitest run tests/server/siteThemeClient.test.ts tests/client/viewRulesPage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

If isolated:

```bash
git add src/server/public/site.js src/client/components/content/ContentHeroCard.vue src/client/components/content/ContentStandardCard.vue tests/server/siteThemeClient.test.ts tests/client/viewRulesPage.test.ts
git commit -m "refactor: 清理筛选策略页遗留交互与反馈文案"
```

### Task 6: Update documentation and run final verification

**Files:**
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/AGENTS.md`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/README.md`

- [ ] **Step 1: Update docs to match the simplified page**

In both docs:

- remove descriptions of:
  - four gates
  - formal NL rules
  - draft pool
  - evaluation rerun / cancel
- replace them with:
  - `/settings/view-rules` now centers on `反馈池`
  - `LLM 设置` remains on the page but is currently marked `暂未使用`

Suggested README direction:

```md
- `/settings/view-rules` 现在收口为 `反馈池 + LLM 设置` 页面；反馈词集中查看、复制、删除和清空，LLM 设置先保留但当前标记为 `暂未使用`
```

- [ ] **Step 2: Run final targeted verification**

Run:

```bash
npx vitest run tests/client/settingsApi.test.ts tests/client/viewRulesPage.test.ts tests/client/appShell.test.ts tests/server/systemRoutes.test.ts tests/server/siteThemeClient.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build verification**

Run:

```bash
npm run build
```

Expected: PASS. Existing Vite chunk-size warnings may remain, but there should be no new type or build failure.

- [ ] **Step 4: Final commit**

Only commit if the worker has isolated this feature’s diff from unrelated worktree changes:

```bash
git add AGENTS.md README.md src/client/services/settingsApi.ts src/client/pages/settings/ViewRulesPage.vue src/server/createServer.ts src/main.ts src/client/router.ts src/server/public/site.js src/client/components/content/ContentHeroCard.vue src/client/components/content/ContentStandardCard.vue tests/client/settingsApi.test.ts tests/client/viewRulesPage.test.ts tests/client/appShell.test.ts tests/server/systemRoutes.test.ts tests/server/siteThemeClient.test.ts
git commit -m "refactor: 精简筛选策略页为反馈池管理页"
```

### Spec Coverage Check

- Page surface simplification: covered by Task 2 and Task 5
- Removed backend routes: covered by Task 3
- Simplified view-rules read model: covered by Task 1 and Task 4
- Main runtime wiring cleanup: covered by Task 4
- Keep feedback-pool flow intact: covered by Task 2, Task 3, and Task 5
- Keep LLM settings but mark unused: covered by Task 2 and Task 6
- Docs update: covered by Task 6

### Placeholder Scan

The plan avoids `TODO`, `TBD`, “implement later”, and similar placeholders. Each task names exact files, exact commands, and the specific behaviors to add or remove.

### Type Consistency Check

- The simplified page model uses only `providerCapability`, `providerSettings`, and `feedbackPool` across Tasks 1, 2, and 4.
- Removed action names are consistent across client and server tasks:
  - `nl-rules`
  - `nl-rules/cancel`
  - `feedback-pool/:id/create-draft`
  - `strategy-drafts/:id/save`
  - `strategy-drafts/:id/delete`
- `反馈池` naming remains consistent throughout the plan.
