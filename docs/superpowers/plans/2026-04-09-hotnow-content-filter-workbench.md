# HotNow Content Filter Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/settings/view-rules` into a readable and controllable content-filter workbench for `AI 新讯` and `AI 热点`, exposing the real page-level filtering toggles while keeping `反馈池` and `LLM 设置（暂未使用）`.

**Architecture:** Reuse the existing `view_rule_configs` persistence and `viewRuleRepository` normalization layer instead of introducing a new table. Extend rule config shape with per-page boolean toggles, make `buildContentViewSelection` consume those toggles, expose a dedicated settings read/write API for content filters, and render a Vue workbench that explains current behavior before letting operators save toggle changes.

**Tech Stack:** TypeScript, Fastify, Vue 3, Ant Design Vue, Tailwind CSS, SQLite, Vitest

---

### Task 1: Extend the persisted rule config shape with filter toggles

**Files:**
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/core/viewRules/viewRuleConfig.ts`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/core/viewRules/viewRuleRepository.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/db/seedInitialData.test.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/core/viewRuleRepository.test.ts`

- [ ] **Step 1: Write failing tests for the expanded config shape**

Add repository normalization tests that prove the config now carries toggle fields with deterministic defaults.

```ts
it("normalizes missing toggle fields back to rule defaults", () => {
  const normalized = normalizeViewRuleConfig("ai", {
    limit: 20,
    freshnessWindowDays: 5,
    freshnessWeight: 0.1,
    sourceWeight: 0.1,
    completenessWeight: 0.15,
    aiWeight: 0.5,
    heatWeight: 0.15
  });

  expect(normalized.enableTimeWindow).toBe(true);
  expect(normalized.enableSourceViewBonus).toBe(true);
  expect(normalized.enableAiKeywordWeight).toBe(true);
  expect(normalized.enableHeatKeywordWeight).toBe(true);
  expect(normalized.enableFreshnessWeight).toBe(true);
  expect(normalized.enableScoreRanking).toBe(true);
});

it("persists rule configs with toggle fields intact", async () => {
  const handle = await createTestDatabase("hot-now-view-rule-config-");
  const db = handle.db;

  saveViewRuleConfig(db, "hot", {
    limit: 20,
    freshnessWindowDays: 3,
    freshnessWeight: 0.35,
    sourceWeight: 0.1,
    completenessWeight: 0.1,
    aiWeight: 0.05,
    heatWeight: 0.4,
    enableTimeWindow: false,
    enableSourceViewBonus: false,
    enableAiKeywordWeight: false,
    enableHeatKeywordWeight: true,
    enableFreshnessWeight: true,
    enableScoreRanking: false
  });

  expect(getViewRuleConfig(db, "hot")).toMatchObject({
    enableSourceViewBonus: false,
    enableAiKeywordWeight: false,
    enableHeatKeywordWeight: true,
    enableScoreRanking: false
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run tests/core/viewRuleRepository.test.ts tests/db/seedInitialData.test.ts
```

Expected: FAIL because the current config type and normalization do not include the new toggle fields.

- [ ] **Step 3: Extend the rule config type, defaults, and normalization**

Update `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/core/viewRules/viewRuleConfig.ts` so `ViewRuleConfigValues` carries both numeric weights and boolean toggles.

Target shape:

```ts
export type ViewRuleConfigValues = {
  limit: number;
  freshnessWindowDays: number;
  freshnessWeight: number;
  sourceWeight: number;
  completenessWeight: number;
  aiWeight: number;
  heatWeight: number;
  enableTimeWindow: boolean;
  enableSourceViewBonus: boolean;
  enableAiKeywordWeight: boolean;
  enableHeatKeywordWeight: boolean;
  enableFreshnessWeight: boolean;
  enableScoreRanking: boolean;
};
```

Default config guidance:

```ts
{
  enableTimeWindow: ruleKey === "ai",
  enableSourceViewBonus: true,
  enableAiKeywordWeight: true,
  enableHeatKeywordWeight: true,
  enableFreshnessWeight: true,
  enableScoreRanking: true
}
```

Also update `normalizeViewRuleConfig()` so bad or missing toggle values fall back cleanly:

```ts
function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
```

- [ ] **Step 4: Keep repository reads and seeds backward-compatible**

Update `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/core/viewRules/viewRuleRepository.ts` and seed expectations so old rows without toggle fields still normalize into the new expanded shape.

The repository should continue to parse legacy `config_json`, then enrich it through `normalizeViewRuleConfig()` rather than requiring a DB migration.

- [ ] **Step 5: Run the focused tests to verify they pass**

Run:

```bash
npx vitest run tests/core/viewRuleRepository.test.ts tests/db/seedInitialData.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/viewRules/viewRuleConfig.ts src/core/viewRules/viewRuleRepository.ts tests/core/viewRuleRepository.test.ts tests/db/seedInitialData.test.ts
git commit -m "feat: 扩展内容筛选规则配置开关"
```

### Task 2: Make content selection honor the new toggles

**Files:**
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/core/content/buildContentViewSelection.ts`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/core/content/buildContentPageModel.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/content/buildContentViewSelection.test.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/client/aiNewPage.test.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/client/aiHotPage.test.ts`

- [ ] **Step 1: Write failing selection tests for each new toggle**

Add or extend tests around the current selection pipeline.

```ts
it("stops blocking old ai content when enableTimeWindow is false", () => {
  const selection = buildContentViewSelection(db, "ai", {
    now: new Date("2026-04-09T12:00:00.000Z"),
    ruleConfig: {
      ...getInternalViewRuleConfig("ai"),
      enableTimeWindow: false
    }
  });

  expect(selection.visibleCards.some((card) => card.id === oldAiItemId)).toBe(true);
});

it("falls back to publish-time ordering when enableScoreRanking is false", () => {
  const selection = buildContentViewSelection(db, "hot", {
    now: referenceTime,
    ruleConfig: {
      ...getInternalViewRuleConfig("hot"),
      enableScoreRanking: false
    }
  });

  expect(selection.visibleCards.map((card) => card.id)).toEqual([
    newestItemId,
    middleItemId,
    oldestItemId
  ]);
});

it("removes source view bonus when enableSourceViewBonus is false", () => {
  const selection = buildContentViewSelection(db, "ai", {
    now: referenceTime,
    ruleConfig: {
      ...getInternalViewRuleConfig("ai"),
      enableSourceViewBonus: false
    }
  });

  expect(selection.debug?.appliedSourceViewBonus ?? 0).toBe(0);
});
```

- [ ] **Step 2: Run the focused selection tests to verify they fail**

Run:

```bash
npx vitest run tests/content/buildContentViewSelection.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
```

Expected: FAIL because the selection pipeline still treats time window, score ranking, and source bonus as always-on internal behavior.

- [ ] **Step 3: Thread persisted rule config into the selection pipeline**

Update `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/core/content/buildContentPageModel.ts` so the page model reads `getViewRuleConfig()` and passes the page-specific config into `buildContentViewSelection()`.

Expected shape:

```ts
const viewRuleKey = pageKey === "ai-hot" ? "hot" : "ai";
const viewRuleConfig = deps.getViewRuleConfig
  ? deps.getViewRuleConfig(viewRuleKey)
  : getInternalViewRuleConfig(viewRuleKey);

const selection = buildContentViewSelection(db, viewRuleKey, {
  now: referenceTime,
  selectedSourceKinds,
  includeNlEvaluations: options.includeNlEvaluations ?? false,
  ruleConfig: viewRuleConfig
});
```

- [ ] **Step 4: Gate the current ranking signals behind the new toggles**

Update `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/core/content/buildContentViewSelection.ts`.

Implementation rules:

```ts
const shouldApplyTimeWindow = viewKey === "ai" && ruleConfig.enableTimeWindow;
const shouldApplySourceViewBonus = ruleConfig.enableSourceViewBonus;
const aiKeywordScore = ruleConfig.enableAiKeywordWeight ? baseScores.ai : 0;
const heatKeywordScore = ruleConfig.enableHeatKeywordWeight ? baseScores.heat : 0;
const freshnessScore = ruleConfig.enableFreshnessWeight ? baseScores.freshness : 0;
const sourceViewBonus = shouldApplySourceViewBonus ? calculateMatchingSourceViewBonus(viewKey, row.kind) : 0;
```

Also gate fallback ordering:

```ts
const rankedVisibleCards = ruleConfig.enableScoreRanking
  ? sortByCompositeRanking(visibleCards)
  : sortByPublishedAtDesc(visibleCards);
```

If `enableScoreRanking` is off, the final page order must not depend on `rankingScore`.

- [ ] **Step 5: Expose a compact runtime summary for the page model**

Augment the page model so later UI tasks can render a human-readable strategy summary without rebuilding logic on the client.

Target shape:

```ts
strategySummary: {
  pageKey: "ai-new" | "ai-hot";
  items: string[];
}
```

Example items:

```ts
["24 小时窗口 开", "来源偏置 开", "AI 关键词 开", "热点关键词 关", "评分排序 开"]
```

- [ ] **Step 6: Run the focused tests to verify they pass**

Run:

```bash
npx vitest run tests/content/buildContentViewSelection.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/content/buildContentViewSelection.ts src/core/content/buildContentPageModel.ts tests/content/buildContentViewSelection.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
git commit -m "feat: 让内容选择流程尊重筛选规则开关"
```

### Task 3: Expand the settings read model and add a content-filter save action

**Files:**
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/server/createServer.ts`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/server/renderSystemPages.ts`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/main.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/server/settingsApiRoutes.test.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/server/systemRoutes.test.ts`

- [ ] **Step 1: Write failing server tests for the new filter workbench payload and save route**

Add server tests that assert `/api/settings/view-rules` now includes `filterWorkbench` and that a dedicated save route exists.

```ts
it("returns ai and hot filter workbench payload from view-rules api", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/settings/view-rules",
    cookies: authCookies
  });

  const body = response.json();

  expect(body.filterWorkbench.aiRule.displayName).toBe("AI 新讯筛选");
  expect(body.filterWorkbench.hotRule.displayName).toBe("AI 热点筛选");
  expect(body.filterWorkbench.aiRule.toggles.enableTimeWindow).toBeTypeOf("boolean");
});

it("saves content filter toggles through a dedicated action route", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/actions/view-rules/content-filters",
    cookies: authCookies,
    payload: {
      ruleKey: "ai",
      toggles: {
        enableTimeWindow: false,
        enableSourceViewBonus: true,
        enableAiKeywordWeight: true,
        enableHeatKeywordWeight: false,
        enableFreshnessWeight: true,
        enableScoreRanking: true
      }
    }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ ok: true, ruleKey: "ai" });
});
```

- [ ] **Step 2: Run the server tests to verify they fail**

Run:

```bash
npx vitest run tests/server/settingsApiRoutes.test.ts tests/server/systemRoutes.test.ts
```

Expected: FAIL because the API response has no `filterWorkbench` and the save route does not exist.

- [ ] **Step 3: Expand the view-rules read model**

Update `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/server/renderSystemPages.ts` and `readSettingsViewRulesApiData()` in `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/server/createServer.ts`.

Add a workbench view shape like:

```ts
type FilterRuleWorkbenchView = {
  ruleKey: "ai" | "hot";
  displayName: string;
  summary: string;
  toggles: {
    enableTimeWindow: boolean;
    enableSourceViewBonus: boolean;
    enableAiKeywordWeight: boolean;
    enableHeatKeywordWeight: boolean;
    enableFreshnessWeight: boolean;
    enableScoreRanking: boolean;
  };
  weights: {
    freshnessWeight: number;
    sourceWeight: number;
    completenessWeight: number;
    aiWeight: number;
    heatWeight: number;
  };
};
```

Top-level API shape:

```ts
{
  filterWorkbench: {
    aiRule: FilterRuleWorkbenchView;
    hotRule: FilterRuleWorkbenchView;
  },
  feedbackPool,
  providerSettings,
  providerCapability
}
```

- [ ] **Step 4: Add a dedicated content-filter save route and runtime dependency**

Update `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/main.ts` and `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/server/createServer.ts` so the server can save toggles through a dedicated action.

Route contract:

```ts
app.post("/actions/view-rules/content-filters", async (request, reply) => {
  const body = request.body as {
    ruleKey?: unknown;
    toggles?: unknown;
  };

  const result = deps.saveContentFilterRule?.({
    ruleKey: typeof body.ruleKey === "string" ? body.ruleKey : "",
    toggles: body.toggles
  });

  if (!result || result.ok === false) {
    return reply.code(400).send({ ok: false, reason: "invalid-content-filter-config" });
  }

  return reply.send({ ok: true, ruleKey: result.ruleKey });
});
```

The runtime save path should merge incoming toggle updates with the persisted numeric config instead of overwriting the weight fields.

- [ ] **Step 5: Run the server tests to verify they pass**

Run:

```bash
npx vitest run tests/server/settingsApiRoutes.test.ts tests/server/systemRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/createServer.ts src/server/renderSystemPages.ts src/main.ts tests/server/settingsApiRoutes.test.ts tests/server/systemRoutes.test.ts
git commit -m "feat: 暴露内容筛选工作台接口与保存动作"
```

### Task 4: Render the content-filter workbench in the Vue settings page

**Files:**
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/services/settingsApi.ts`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/pages/settings/ViewRulesPage.vue`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/client/settingsApi.test.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/client/viewRulesPage.test.ts`

- [ ] **Step 1: Write failing client tests for the new filter workbench UI**

Add tests that assert:

- the page renders `当前筛选总览`
- both `AI 新讯筛选` and `AI 热点筛选` sections exist
- each section has its own save button
- toggles are prefilled from the API

```ts
it("renders ai and hot filter workbench sections with toggle state", async () => {
  settingsApiMocks.readSettingsViewRules.mockResolvedValueOnce({
    filterWorkbench: {
      aiRule: {
        ruleKey: "ai",
        displayName: "AI 新讯筛选",
        summary: "当前 AI 新讯会优先保留最近 24 小时内容。",
        toggles: {
          enableTimeWindow: true,
          enableSourceViewBonus: true,
          enableAiKeywordWeight: true,
          enableHeatKeywordWeight: false,
          enableFreshnessWeight: true,
          enableScoreRanking: true
        },
        weights: {
          freshnessWeight: 0.1,
          sourceWeight: 0.1,
          completenessWeight: 0.15,
          aiWeight: 0.5,
          heatWeight: 0.15
        }
      },
      hotRule: {
        ruleKey: "hot",
        displayName: "AI 热点筛选",
        summary: "当前 AI 热点不会强行限制 24 小时。",
        toggles: {
          enableTimeWindow: false,
          enableSourceViewBonus: true,
          enableAiKeywordWeight: false,
          enableHeatKeywordWeight: true,
          enableFreshnessWeight: true,
          enableScoreRanking: true
        },
        weights: {
          freshnessWeight: 0.35,
          sourceWeight: 0.1,
          completenessWeight: 0.1,
          aiWeight: 0.05,
          heatWeight: 0.4
        }
      }
    },
    providerCapability: { featureAvailable: false, hasMasterKey: true, message: "未使用" },
    providerSettings: [],
    feedbackPool: []
  });

  const wrapper = mount(ViewRulesPage, { global: { plugins: [Antd] } });
  await flushPromises();

  expect(wrapper.text()).toContain("当前筛选总览");
  expect(wrapper.text()).toContain("AI 新讯筛选");
  expect(wrapper.text()).toContain("AI 热点筛选");
  expect(wrapper.find("[data-save-content-filter='ai']").exists()).toBe(true);
  expect(wrapper.find("[data-save-content-filter='hot']").exists()).toBe(true);
});
```

- [ ] **Step 2: Run the client tests to verify they fail**

Run:

```bash
npx vitest run tests/client/settingsApi.test.ts tests/client/viewRulesPage.test.ts
```

Expected: FAIL because the client contract and Vue page do not know about `filterWorkbench` or the save action.

- [ ] **Step 3: Expand the settings API client**

Update `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/services/settingsApi.ts`.

Add types:

```ts
export type SettingsContentFilterRule = {
  ruleKey: "ai" | "hot";
  displayName: string;
  summary: string;
  toggles: {
    enableTimeWindow: boolean;
    enableSourceViewBonus: boolean;
    enableAiKeywordWeight: boolean;
    enableHeatKeywordWeight: boolean;
    enableFreshnessWeight: boolean;
    enableScoreRanking: boolean;
  };
  weights: {
    freshnessWeight: number;
    sourceWeight: number;
    completenessWeight: number;
    aiWeight: number;
    heatWeight: number;
  };
};
```

Add save helper:

```ts
export function saveContentFilterRule(payload: {
  ruleKey: "ai" | "hot";
  toggles: SettingsContentFilterRule["toggles"];
}): Promise<{ ok: true; ruleKey: "ai" | "hot" }> {
  return postSettingsAction("/actions/view-rules/content-filters", payload);
}
```

- [ ] **Step 4: Build the new overview and per-page filter forms**

Update `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/pages/settings/ViewRulesPage.vue`.

Add three new UI blocks before `反馈池`:

```vue
<section data-settings-section="filter-overview">
  <!-- AI 新讯 / AI 热点 summary cards -->
</section>

<section data-settings-section="filter-ai">
  <!-- AI 新讯 toggles + read-only weights + save button -->
</section>

<section data-settings-section="filter-hot">
  <!-- AI 热点 toggles + read-only weights + save button -->
</section>
```

Use local reactive draft state per rule:

```ts
const filterForms = reactive({
  ai: createFilterToggleDraft(),
  hot: createFilterToggleDraft()
});
```

Do not auto-save on switch change. Each section should call its own save handler.

- [ ] **Step 5: Run the client tests to verify they pass**

Run:

```bash
npx vitest run tests/client/settingsApi.test.ts tests/client/viewRulesPage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/client/services/settingsApi.ts src/client/pages/settings/ViewRulesPage.vue tests/client/settingsApi.test.ts tests/client/viewRulesPage.test.ts
git commit -m "feat: 增加内容筛选工作台页面"
```

### Task 5: Surface the active strategy summary on content pages

**Files:**
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/pages/content/AiNewPage.vue`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/pages/content/AiHotPage.vue`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/services/contentApi.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/client/aiNewPage.test.ts`
- Test: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/tests/client/aiHotPage.test.ts`

- [ ] **Step 1: Write failing page tests for the visible strategy summary**

```ts
it("renders the current ai-new strategy summary above the card list", async () => {
  contentApiMocks.readAiNewPage.mockResolvedValueOnce({
    ...createAiNewResponse(),
    strategySummary: {
      pageKey: "ai-new",
      items: ["24 小时窗口 开", "来源偏置 开", "AI 关键词 开", "热点关键词 关", "评分排序 开"]
    }
  });

  const wrapper = mount(AiNewPage, { global: { plugins: [router] } });
  await flushPromises();

  expect(wrapper.text()).toContain("当前 AI 新讯");
  expect(wrapper.text()).toContain("24 小时窗口 开");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
```

Expected: FAIL because the content page contract and templates do not render `strategySummary`.

- [ ] **Step 3: Extend the content API client contracts**

Update `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/src/client/services/contentApi.ts` so both `AI 新讯` and `AI 热点` page responses include:

```ts
strategySummary: {
  pageKey: "ai-new" | "ai-hot";
  items: string[];
}
```

- [ ] **Step 4: Render a concise strategy chip row near the content controls**

Update both content pages so the strategy summary appears close to the intro or toolbar area, not buried in the cards.

Recommended rendering pattern:

```vue
<section v-if="page.strategySummary.items.length" class="flex flex-wrap gap-2" data-content-strategy-summary="ai-new">
  <span class="text-sm font-medium text-editorial-text-subtle">当前 AI 新讯：</span>
  <a-tag v-for="item in page.strategySummary.items" :key="item">{{ item }}</a-tag>
</section>
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run:

```bash
npx vitest run tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/client/pages/content/AiNewPage.vue src/client/pages/content/AiHotPage.vue src/client/services/contentApi.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
git commit -m "feat: 展示当前内容筛选策略摘要"
```

### Task 6: Update docs and run end-of-round verification

**Files:**
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/AGENTS.md`
- Modify: `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/README.md`

- [ ] **Step 1: Update the docs to match the new workbench**

Update:

- `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/AGENTS.md`
- `/Users/tc-nihao/100-tc/700-code/100-center/hot-now/README.md`

Required doc changes:

- `/settings/view-rules` now includes `AI 新讯 / AI 热点` 内容筛选说明与开关
- `反馈池` remains on the page
- `LLM 设置` remains present but marked `暂未使用`
- describe that toggles control page-level filtering, not source collection

- [ ] **Step 2: Run the most relevant test suite**

Run:

```bash
npx vitest run tests/core/viewRuleRepository.test.ts tests/db/seedInitialData.test.ts tests/content/buildContentViewSelection.test.ts tests/server/settingsApiRoutes.test.ts tests/server/systemRoutes.test.ts tests/client/settingsApi.test.ts tests/client/viewRulesPage.test.ts tests/client/aiNewPage.test.ts tests/client/aiHotPage.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the build checks**

Run:

```bash
npm run build:client
npm run build
```

Expected: both commands PASS. A Vite chunk-size warning is acceptable only if the build still succeeds and no new functional warning is introduced.

- [ ] **Step 4: Manual smoke test**

Run:

```bash
npm run dev
```

Check:

- `/settings/view-rules` shows `当前筛选总览`、`AI 新讯筛选`、`AI 热点筛选`
- toggles load current persisted state
- saving `AI 新讯` toggles affects `/ai-new`
- saving `AI 热点` toggles affects `/ai-hot`
- `反馈池` still works
- `LLM 设置` still saves but is labeled `暂未使用`

- [ ] **Step 5: Final commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: 同步内容筛选工作台说明"
```
