# HotNow AI Strategy Gates Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy numeric-rule + `global / hot / articles / ai` strategy system with a four-gate `enabled + ruleText` model (`base / ai_new / ai_hot / hero`) across storage, evaluation, content selection, and the Vue settings workbench in one cutover.

**Architecture:** Keep the existing numeric ranking engine only as fixed internal defaults for content ordering; remove all user-facing numeric rule editing and stop reading numeric rule rows from SQLite. Introduce one shared gate-scope module consumed by repositories, provider prompts, content selection, server contracts, and the Vue settings page; `base` behaves like the old global gate, `ai_new` and `ai_hot` act as page gates, and `hero` is only used when picking the featured card for `/` and `/ai-new`.

**Tech Stack:** TypeScript, Fastify, Vue 3, Ant Design Vue, SQLite, Vitest

---

## File Map

**Create**

- `src/core/strategy/strategyGateScopes.ts`
  Centralize `base / ai_new / ai_hot / hero` constants, labels, default order, and helpers for gate-rule vs draft-scope validation.
- `src/core/content/buildContentPageModel.ts`
  Build `/ai-new` and `/ai-hot` page models from the shared content selection pipeline, including hero-card selection logic.

**Modify**

- `src/core/strategy/nlRuleRepository.ts`
  Seed, validate, list, and save only the new gate scopes.
- `src/core/db/runMigrations.ts`
  Add `nl_rule_sets.is_enabled` so each gate persists its own enable switch.
- `src/core/strategy/strategyDraftRepository.ts`
  Accept only `unspecified / base / ai_new / ai_hot / hero`; coerce legacy suggested scopes to `unspecified`.
- `src/core/strategy/runNlEvaluationCycle.ts`
  Build the provider input map with the new gate scopes and stop emitting old scope names.
- `src/core/llm/providers/shared.ts`
  Update provider prompt/schema text to the new four-gate contract.
- `src/core/viewRules/viewRuleConfig.ts`
  Keep only internal fixed ranking defaults for `ai-new` and `ai-hot`; stop exporting user-facing field metadata.
- `src/core/content/buildContentViewSelection.ts`
  Stop reading DB-backed numeric configs, apply `base + page gate` evaluations, and expose enough metadata for hero selection.
- `src/core/viewRules/viewRuleRepository.ts`
  Delete the DB-backed numeric rule persistence path after content selection switches to fixed internal defaults.
- `src/main.ts`
  Stop wiring numeric-rule repository/actions into the server workbench, wire the new gate workbench payload, and inject `getContentPageModel`.
- `src/server/createServer.ts`
  Change the settings API contract from `numericRules` to `gateRules`, remove `/actions/view-rules/:ruleKey`, and use the new content page model builder.
- `src/server/renderSystemPages.ts`
  Update `ViewRulesWorkbenchView` types so the server/client contract no longer mentions numeric rules.
- `src/client/services/settingsApi.ts`
  Replace numeric-rule types and old scopes with the new gate model.
- `src/client/pages/settings/ViewRulesPage.vue`
  Delete numeric-rule forms and rebuild the page around four gate cards with `enabled + ruleText`.
- `README.md`
  Update strategy page behavior and strategy scope terminology.
- `AGENTS.md`
  Update the current route/behavior snapshot and settings-page description to match the new gate model.

**Test**

- `tests/strategy/nlRuleRepository.test.ts`
- `tests/strategy/strategyDraftRepository.test.ts`
- `tests/strategy/runNlEvaluationCycle.test.ts`
- `tests/content/buildContentViewSelection.test.ts`
- `tests/server/createServer.test.ts`
- `tests/server/settingsApiRoutes.test.ts`
- `tests/client/viewRulesPage.test.ts`
- `tests/content/listContentView.test.ts`
- `tests/viewRules/viewRuleConfig.test.ts`
- `tests/server/systemRoutes.test.ts`
- `tests/client/appShell.test.ts`

## Task 1: Shared Gate Scopes And Repository Cutover

**Files:**
- Create: `src/core/strategy/strategyGateScopes.ts`
- Modify: `src/core/strategy/nlRuleRepository.ts`
- Modify: `src/core/db/runMigrations.ts`
- Modify: `src/core/strategy/strategyDraftRepository.ts`
- Test: `tests/strategy/nlRuleRepository.test.ts`
- Test: `tests/strategy/strategyDraftRepository.test.ts`

- [ ] **Step 1: Write the failing repository tests for the new scopes**

```ts
it("seeds only base, ai_new, ai_hot, hero gate rules", async () => {
  const handle = await createTestDatabase("hot-now-nl-rules-");

  expect(listNlRuleSets(handle.db)).toEqual([
    expect.objectContaining({ scope: "base", enabled: true }),
    expect.objectContaining({ scope: "ai_new", enabled: true }),
    expect.objectContaining({ scope: "ai_hot", enabled: true }),
    expect.objectContaining({ scope: "hero", enabled: true })
  ]);
});

it("normalizes legacy draft scopes to unspecified", async () => {
  const handle = await createTestDatabase("hot-now-strategy-draft-");

  const draftId = createStrategyDraft(handle.db, {
    draftText: "旧作用域草稿",
    suggestedScope: "hot" as never
  });

  expect(listStrategyDrafts(handle.db).find((draft) => draft.id === draftId)?.suggestedScope).toBe("unspecified");
});
```

- [ ] **Step 2: Run the repository tests to verify they fail on the current legacy scope model**

Run: `npx vitest run tests/strategy/nlRuleRepository.test.ts tests/strategy/strategyDraftRepository.test.ts -v`

Expected: FAIL because `DEFAULT_NL_RULE_SCOPES` still seeds `global / hot / articles / ai`, and drafts still accept legacy scopes.

- [ ] **Step 3: Add the shared scope module and rewire both repositories**

```ts
// src/core/strategy/strategyGateScopes.ts
export const STRATEGY_GATE_SCOPES = ["base", "ai_new", "ai_hot", "hero"] as const;
export type StrategyGateScope = (typeof STRATEGY_GATE_SCOPES)[number];

export const STRATEGY_DRAFT_SCOPES = ["unspecified", ...STRATEGY_GATE_SCOPES] as const;
export type StrategyDraftScope = (typeof STRATEGY_DRAFT_SCOPES)[number];

export const STRATEGY_GATE_LABELS: Record<StrategyGateScope, string> = {
  base: "基础入池门",
  ai_new: "AI 新讯入池门",
  ai_hot: "AI 热点入池门",
  hero: "首条精选门"
};

export function isStrategyGateScope(value: string): value is StrategyGateScope {
  return STRATEGY_GATE_SCOPES.includes(value as StrategyGateScope);
}

export function normalizeStrategyDraftScope(value: string | undefined): StrategyDraftScope {
  return value === "unspecified" || isStrategyGateScope(value ?? "") ? (value as StrategyDraftScope) : "unspecified";
}
```

```ts
// src/core/db/runMigrations.ts
if (!hasColumn(db, "nl_rule_sets", "is_enabled")) {
  db.exec("ALTER TABLE nl_rule_sets ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1");
}
```

```ts
// src/core/strategy/nlRuleRepository.ts
import {
  STRATEGY_GATE_SCOPES,
  isStrategyGateScope,
  type StrategyGateScope
} from "./strategyGateScopes.js";

export const DEFAULT_NL_RULE_SCOPES = STRATEGY_GATE_SCOPES;
export type NlRuleScope = StrategyGateScope;
export type NlRuleSet = {
  scope: NlRuleScope;
  enabled: boolean;
  ruleText: string;
  createdAt: string;
  updatedAt: string;
};

function normalizeScope(value: string): NlRuleScope {
  return isStrategyGateScope(value) ? value : "base";
}

export function saveNlRuleSet(
  db: SqliteDatabase,
  scope: string,
  input: { enabled: boolean; ruleText: string }
): SaveNlRuleSetResult {
  if (!isStrategyGateScope(scope)) {
    return { ok: false, reason: "not-found" };
  }

  db.prepare(
    `
      UPDATE nl_rule_sets
      SET is_enabled = ?,
          rule_text = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE scope = ?
    `
  ).run(input.enabled ? 1 : 0, input.ruleText.trim(), scope);

  return { ok: true };
}
```

```ts
// src/core/strategy/strategyDraftRepository.ts
import { normalizeStrategyDraftScope, type StrategyDraftScope } from "./strategyGateScopes.js";

function normalizeSuggestedScope(value: string | undefined): StrategyDraftScope {
  return normalizeStrategyDraftScope(value);
}
```

- [ ] **Step 4: Run the repository tests again**

Run: `npx vitest run tests/strategy/nlRuleRepository.test.ts tests/strategy/strategyDraftRepository.test.ts -v`

Expected: PASS with the new seed order and `unspecified` fallback for legacy draft rows.

- [ ] **Step 5: Commit the repository cutover**

```bash
git add src/core/strategy/strategyGateScopes.ts \
  src/core/db/runMigrations.ts \
  src/core/strategy/nlRuleRepository.ts \
  src/core/strategy/strategyDraftRepository.ts \
  tests/strategy/nlRuleRepository.test.ts \
  tests/strategy/strategyDraftRepository.test.ts
git commit -m "refactor: 切换策略仓储到四道门 scope"
```

## Task 2: Evaluation Cycle And Content Selection Cutover

**Files:**
- Create: `src/core/content/buildContentPageModel.ts`
- Modify: `src/core/strategy/runNlEvaluationCycle.ts`
- Modify: `src/core/llm/providers/shared.ts`
- Modify: `src/core/viewRules/viewRuleConfig.ts`
- Modify: `src/core/content/buildContentViewSelection.ts`
- Modify: `src/core/viewRules/viewRuleRepository.ts`
- Modify: `src/main.ts`
- Modify: `src/server/createServer.ts`
- Test: `tests/strategy/runNlEvaluationCycle.test.ts`
- Test: `tests/content/buildContentViewSelection.test.ts`
- Test: `tests/content/listContentView.test.ts`
- Test: `tests/viewRules/viewRuleConfig.test.ts`
- Test: `tests/server/createServer.test.ts`

- [ ] **Step 1: Write the failing evaluation/content tests for `base / ai_new / ai_hot / hero`**

```ts
it("stores base, ai_new, ai_hot, hero evaluations", async () => {
  saveNlRuleSet(handle.db, "base", { enabled: true, ruleText: "过滤噪音。" });
  saveNlRuleSet(handle.db, "ai_new", { enabled: true, ruleText: "优先 agent 新信号。" });

  const result = await runNlEvaluationCycle(handle.db, { mode: "full-recompute" }, deps);

  expect(result.status).toBe("completed");
  expect(listNlEvaluationsForContent(handle.db, contentId).map((row) => row.scope)).toEqual([
    "ai_hot",
    "ai_new",
    "base",
    "hero"
  ]);
});

it("picks the featured card from hero-positive ai-new cards and falls back to the first visible card", () => {
  const pageModel = buildContentPageModel(handle.db, "ai-new", { includeNlEvaluations: true });
  expect(pageModel.featuredCard?.id).toBe(heroPreferredId);
});
```

- [ ] **Step 2: Run the targeted tests to confirm the old scope model still breaks them**

Run: `npx vitest run tests/strategy/runNlEvaluationCycle.test.ts tests/content/buildContentViewSelection.test.ts tests/content/listContentView.test.ts tests/viewRules/viewRuleConfig.test.ts tests/server/createServer.test.ts -v`

Expected: FAIL because providers still emit `global / hot / articles / ai`, content selection still reads DB-backed numeric rules, and featured-card selection still takes `cards[0]`.

- [ ] **Step 3: Rewire the evaluation pipeline, freeze numeric defaults, and add featured-card selection**

```ts
// src/core/viewRules/viewRuleConfig.ts
export type InternalViewRuleKey = "ai-new" | "ai-hot";

const INTERNAL_VIEW_RULE_DEFAULTS: Record<InternalViewRuleKey, ViewRuleConfigValues> = {
  "ai-new": {
    limit: 20,
    freshnessWindowDays: 5,
    freshnessWeight: 0.1,
    sourceWeight: 0.1,
    completenessWeight: 0.15,
    aiWeight: 0.5,
    heatWeight: 0.15
  },
  "ai-hot": {
    limit: 20,
    freshnessWindowDays: 3,
    freshnessWeight: 0.35,
    sourceWeight: 0.1,
    completenessWeight: 0.1,
    aiWeight: 0.05,
    heatWeight: 0.4
  }
};

export function getInternalViewRuleConfig(viewKey: InternalViewRuleKey): ViewRuleConfigValues {
  return INTERNAL_VIEW_RULE_DEFAULTS[viewKey];
}
```

```ts
// src/core/content/buildContentViewSelection.ts
import { getInternalViewRuleConfig } from "../viewRules/viewRuleConfig.js";

const internalRuleConfig = getInternalViewRuleConfig(viewKey);
const limit = options.limitOverride ?? internalRuleConfig.limit;
```

```ts
// src/core/viewRules/viewRuleRepository.ts
// Delete this file after the last import is replaced; numeric rule rows are no longer part of runtime behavior.
```

```ts
// src/core/strategy/runNlEvaluationCycle.ts
function readRuleSetMap(db: SqliteDatabase): Record<NlRuleScope, string> {
  const rules = listNlRuleSets(db);

  return {
    base: rules.find((rule) => rule.scope === "base" && rule.enabled)?.ruleText ?? "",
    ai_new: rules.find((rule) => rule.scope === "ai_new" && rule.enabled)?.ruleText ?? "",
    ai_hot: rules.find((rule) => rule.scope === "ai_hot" && rule.enabled)?.ruleText ?? "",
    hero: rules.find((rule) => rule.scope === "hero" && rule.enabled)?.ruleText ?? ""
  };
}
```

```ts
// src/core/llm/providers/shared.ts
function buildSystemPrompt(): string {
  return [
    "You are evaluating HotNow content against four scopes: base, ai_new, ai_hot, hero.",
    "Return strict JSON only.",
    'Use this schema: {"evaluations":[{"scope":"base|ai_new|ai_hot|hero","decision":"boost|penalize|block|neutral","strengthLevel":"low|medium|high|null","matchedKeywords":["string"],"reason":"string|null"}]}',
    "Always return exactly four evaluations, one for each scope, in any order."
  ].join(" ");
}
```

```ts
// src/core/content/buildContentViewSelection.ts
const viewScopeByPage = {
  "ai-new": "ai_new",
  "ai-hot": "ai_hot"
} as const;

LEFT JOIN content_nl_evaluations base_eval
  ON base_eval.content_item_id = ci.id
 AND base_eval.scope = 'base'
LEFT JOIN content_nl_evaluations view_eval
  ON view_eval.content_item_id = ci.id
 AND view_eval.scope = @viewScope
LEFT JOIN content_nl_evaluations hero_eval
  ON hero_eval.content_item_id = ci.id
 AND hero_eval.scope = 'hero'
```

```ts
// src/core/content/buildContentPageModel.ts
export function selectFeaturedCard(cards: RankedContentCardView[]): ContentCardView | null {
  const heroPreferred = cards
    .filter((card) => card.heroDecision !== "block")
    .sort((left, right) => (right.heroScoreDelta ?? 0) - (left.heroScoreDelta ?? 0));

  return heroPreferred[0] ?? cards[0] ?? null;
}
```

```ts
// src/main.ts
getContentPageModel: async (pageKey, options) =>
  buildContentPageModel(db, pageKey, {
    ...options,
    includeNlEvaluations: isNlFeatureAvailable()
  }),
```

- [ ] **Step 4: Run the targeted tests again**

Run: `npx vitest run tests/strategy/runNlEvaluationCycle.test.ts tests/content/buildContentViewSelection.test.ts tests/content/listContentView.test.ts tests/viewRules/viewRuleConfig.test.ts tests/server/createServer.test.ts -v`

Expected: PASS with new gate scopes, DB-ignored numeric defaults, and hero-featured selection.

- [ ] **Step 5: Commit the evaluation/content cutover**

```bash
git add src/core/content/buildContentPageModel.ts \
  src/core/strategy/runNlEvaluationCycle.ts \
  src/core/llm/providers/shared.ts \
  src/core/viewRules/viewRuleConfig.ts \
  src/core/content/buildContentViewSelection.ts \
  src/core/viewRules/viewRuleRepository.ts \
  src/main.ts \
  src/server/createServer.ts \
  tests/strategy/runNlEvaluationCycle.test.ts \
  tests/content/buildContentViewSelection.test.ts \
  tests/content/listContentView.test.ts \
  tests/viewRules/viewRuleConfig.test.ts \
  tests/server/createServer.test.ts
git commit -m "feat: 切换内容页与评估链到四道门策略"
```

## Task 3: Settings API And Vue Workbench Cutover

**Files:**
- Modify: `src/server/renderSystemPages.ts`
- Modify: `src/server/createServer.ts`
- Modify: `src/main.ts`
- Modify: `src/client/services/settingsApi.ts`
- Modify: `src/client/pages/settings/ViewRulesPage.vue`
- Test: `tests/server/settingsApiRoutes.test.ts`
- Test: `tests/server/systemRoutes.test.ts`
- Test: `tests/client/viewRulesPage.test.ts`
- Test: `tests/client/appShell.test.ts`

- [ ] **Step 1: Write the failing API and page tests for the new workbench contract**

```ts
expect(response.json()).toMatchObject({
  gateRules: [
    {
      scope: "base",
      displayName: "基础入池门",
      enabled: true,
      ruleText: ""
    }
  ]
});
expect(response.json()).not.toHaveProperty("numericRules");

const removedRoute = await app.inject({
  method: "POST",
  url: "/actions/view-rules/hot",
  payload: { config: { limit: 10 } }
});
expect(removedRoute.statusCode).toBe(404);
```

```ts
expect(wrapper.text()).toContain("基础入池门");
expect(wrapper.text()).toContain("AI 新讯入池门");
expect(wrapper.text()).toContain("AI 热点入池门");
expect(wrapper.text()).toContain("首条精选门");
expect(wrapper.text()).not.toContain("数值权重规则");
expect(settingsApi.saveNlRules).toHaveBeenCalledWith({
  base: { enabled: true, ruleText: "新的基础规则" },
  ai_new: { enabled: true, ruleText: "" },
  ai_hot: { enabled: true, ruleText: "" },
  hero: { enabled: true, ruleText: "" }
});
```

- [ ] **Step 2: Run the page/API tests to verify they fail against the current numeric workbench**

Run: `npx vitest run tests/server/settingsApiRoutes.test.ts tests/server/systemRoutes.test.ts tests/client/viewRulesPage.test.ts tests/client/appShell.test.ts -v`

Expected: FAIL because the API still returns `numericRules`, the page still renders weight forms, `/actions/view-rules/:ruleKey` still exists, and `saveNlRules` still expects plain strings under `global / hot / articles / ai`.

- [ ] **Step 3: Replace the workbench contract and the Vue page**

```ts
// src/client/services/settingsApi.ts
export type SettingsStrategyGateScope = "base" | "ai_new" | "ai_hot" | "hero";

export type SettingsStrategyGateItem = {
  scope: SettingsStrategyGateScope;
  displayName: string;
  enabled: boolean;
  ruleText: string;
  createdAt: string;
  updatedAt: string;
};

export type SettingsViewRulesResponse = {
  gateRules: SettingsStrategyGateItem[];
  providerSettings: SettingsProviderSettingsSummary | null;
  providerCapability: SettingsProviderCapability;
  feedbackPool: SettingsFeedbackPoolItem[];
  strategyDrafts: SettingsStrategyDraftItem[];
  latestEvaluationRun: SettingsNlEvaluationRun | null;
  isEvaluationRunning: boolean;
};

export type SaveNlRulesPayload = Record<
  SettingsStrategyGateScope,
  { enabled: boolean; ruleText: string }
>;
```

```ts
// src/server/createServer.ts
function normalizeGateRulePayload(
  input: Record<NlRuleScope, { enabled?: unknown; ruleText?: unknown }> | undefined
): Record<NlRuleScope, { enabled: boolean; ruleText: string }> {
  return {
    base: { enabled: input?.base?.enabled !== false, ruleText: String(input?.base?.ruleText ?? "") },
    ai_new: { enabled: input?.ai_new?.enabled !== false, ruleText: String(input?.ai_new?.ruleText ?? "") },
    ai_hot: { enabled: input?.ai_hot?.enabled !== false, ruleText: String(input?.ai_hot?.ruleText ?? "") },
    hero: { enabled: input?.hero?.enabled !== false, ruleText: String(input?.hero?.ruleText ?? "") }
  };
}

app.post("/actions/view-rules/nl-rules", async (request, reply) => {
  const body = request.body as {
    rules?: Record<NlRuleScope, { enabled?: unknown; ruleText?: unknown }>;
  };

  const normalizedRules = normalizeGateRulePayload(body.rules);
  const result = await deps.saveNlRules!(normalizedRules);
  return reply.send({ ok: true, run: result.run });
});
```

```vue
<!-- src/client/pages/settings/ViewRulesPage.vue -->
<a-card
  v-for="gate in gateRules"
  :key="gate.scope"
  :data-gate-scope="gate.scope"
>
  <a-flex justify="space-between" align="center">
    <div>
      <h3>{{ gate.displayName }}</h3>
      <p>{{ gateDescriptions[gate.scope] }}</p>
    </div>
    <a-switch v-model:checked="gateForms[gate.scope].enabled" />
  </a-flex>
  <a-textarea
    v-model:value="gateForms[gate.scope].ruleText"
    :rows="5"
    :data-nl-rule-scope="gate.scope"
    placeholder="用自然语言描述这道门该如何判断。"
  />
</a-card>
```

```ts
// src/main.ts
function getViewRulesWorkbenchData() {
  const latestEvaluationRun = listNlEvaluationRuns(db)[0] ?? null;

  return {
    gateRules: listNlRuleSets(db).map((rule) => ({
      scope: rule.scope,
      displayName: STRATEGY_GATE_LABELS[rule.scope],
      enabled: rule.enabled,
      ruleText: rule.ruleText,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt
    })),
    providerSettings: getProviderSettingsSummary(db),
    providerCapability: readProviderCapability(),
    feedbackPool: listFeedbackPoolEntries(db),
    strategyDrafts: listStrategyDrafts(db),
    latestEvaluationRun,
    isEvaluationRunning: nlEvaluationLock.isRunning() || latestEvaluationRun?.status === "running"
  };
}

saveNlRules: async (rules) => {
  for (const scope of Object.keys(rules) as NlRuleScope[]) {
    saveNlRuleSet(db, scope, rules[scope]);
  }

  return {
    ok: true as const,
    run: await runNlEvaluationTask({ mode: "full-recompute" })
  };
},
```

- [ ] **Step 4: Run the API and page tests again**

Run: `npx vitest run tests/server/settingsApiRoutes.test.ts tests/server/systemRoutes.test.ts tests/client/viewRulesPage.test.ts tests/client/appShell.test.ts -v`

Expected: PASS with `gateRules` in the response, no numeric-rule UI, and the new `enabled + ruleText` save payload.

- [ ] **Step 5: Commit the settings workbench cutover**

```bash
git add src/server/renderSystemPages.ts \
  src/server/createServer.ts \
  src/main.ts \
  src/client/services/settingsApi.ts \
  src/client/pages/settings/ViewRulesPage.vue \
  tests/server/settingsApiRoutes.test.ts \
  tests/server/systemRoutes.test.ts \
  tests/client/viewRulesPage.test.ts \
  tests/client/appShell.test.ts
git commit -m "feat: 重建策略工作台为四道门配置"
```

## Task 4: Scope Cleanup, Documentation, And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Test: `tests/strategy/nlRuleRepository.test.ts`
- Test: `tests/strategy/strategyDraftRepository.test.ts`
- Test: `tests/strategy/runNlEvaluationCycle.test.ts`
- Test: `tests/content/buildContentViewSelection.test.ts`
- Test: `tests/server/createServer.test.ts`
- Test: `tests/server/settingsApiRoutes.test.ts`
- Test: `tests/server/systemRoutes.test.ts`
- Test: `tests/client/viewRulesPage.test.ts`
- Test: `tests/client/appShell.test.ts`
- Test: `tests/viewRules/viewRuleConfig.test.ts`
- Test: `tests/content/listContentView.test.ts`

- [ ] **Step 1: Add one last regression assertion for legacy-scope rejection**

```ts
it("does not render legacy scopes back into the page model", async () => {
  vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue({
    ...createWorkbench(),
    gateRules: [
      { scope: "base", displayName: "基础入池门", enabled: true, ruleText: "", createdAt: "", updatedAt: "" }
    ]
  });

  const wrapper = mount(ViewRulesPage, { global: { plugins: [Antd] } });
  await flushPromises();

  expect(wrapper.text()).not.toContain("Articles");
  expect(wrapper.text()).not.toContain("全局");
});
```

- [ ] **Step 2: Update the docs in the same pass as the final behavior**

```md
<!-- README.md / AGENTS.md -->
- `/settings/view-rules` 现已移除数值权重规则，只保留 4 道门：
  - `基础入池门`
  - `AI 新讯入池门`
  - `AI 热点入池门`
  - `首条精选门`
- 正式自然语言策略 scope 现为 `base / ai_new / ai_hot / hero`
- 旧的 `global / hot / articles / ai` 不再渲染，也不再自动迁移
```

- [ ] **Step 3: Run the complete targeted verification set**

Run:

```bash
npx vitest run \
  tests/strategy/nlRuleRepository.test.ts \
  tests/strategy/strategyDraftRepository.test.ts \
  tests/strategy/runNlEvaluationCycle.test.ts \
  tests/content/buildContentViewSelection.test.ts \
  tests/content/listContentView.test.ts \
  tests/server/createServer.test.ts \
  tests/server/settingsApiRoutes.test.ts \
  tests/server/systemRoutes.test.ts \
  tests/client/viewRulesPage.test.ts \
  tests/client/appShell.test.ts \
  tests/viewRules/viewRuleConfig.test.ts -v
```

Expected: PASS with no remaining references to `articles` in strategy scope assertions.

- [ ] **Step 4: Run the broader safety net**

Run: `npm run test && npm run build`

Expected:
- `npm run test` PASS
- `npm run build` PASS

- [ ] **Step 5: Commit the docs and verification finish line**

```bash
git add README.md AGENTS.md \
  tests/strategy/nlRuleRepository.test.ts \
  tests/strategy/strategyDraftRepository.test.ts \
  tests/strategy/runNlEvaluationCycle.test.ts \
  tests/content/buildContentViewSelection.test.ts \
  tests/content/listContentView.test.ts \
  tests/server/createServer.test.ts \
  tests/server/settingsApiRoutes.test.ts \
  tests/server/systemRoutes.test.ts \
  tests/client/viewRulesPage.test.ts \
  tests/client/appShell.test.ts \
  tests/viewRules/viewRuleConfig.test.ts
git commit -m "docs: 同步四道门策略模型与验证门禁"
```

## Self-Review Checklist

- Spec coverage:
  - 删除数值权重规则: Task 2 freezes internal defaults; Task 3 deletes the numeric workbench API/UI.
  - 四道门 scope: Task 1 rewires repositories; Task 2 rewires evaluation/content; Task 3 rewires API/UI.
  - 一次性切换不兼容旧数据: Task 1 and Task 3 normalize legacy rows to `unspecified` or ignore them instead of migrating.
  - `hero` only for精选主卡: Task 2 introduces explicit featured-card selection logic.
  - 文档同步: Task 4 updates `README.md` and `AGENTS.md`.
- Placeholder scan:
  - No `TODO`, `TBD`, or “similar to above”.
  - Every task has concrete files, commands, and code snippets.
- Type consistency:
  - `StrategyGateScope` is always `base | ai_new | ai_hot | hero`.
  - `StrategyDraftScope` is always `unspecified | base | ai_new | ai_hot | hero`.
  - `SaveNlRulesPayload` always carries `{ enabled, ruleText }` objects.

## Notes For Execution

- Do not stage unrelated workspace changes already present on `main`.
- Do not commit `data/reports/2026-04-01/` or any report artifact changes.
- Keep the existing route path `/actions/view-rules/nl-rules`; only the payload shape changes.
- Keep provider settings, feedback pool, and draft pool flows intact; only their scope semantics change.
