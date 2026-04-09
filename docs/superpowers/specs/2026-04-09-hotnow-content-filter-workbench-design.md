# HotNow Content Filter Workbench Design

## Background

The current `/settings/view-rules` page no longer exposes the real filtering logic behind `AI 新讯` and `AI 热点`.

At runtime, those two pages are still built from a real internal selection pipeline:

- enabled sources are collected into the shared content pool
- user-selected source filters narrow the candidate set
- `AI 新讯` applies a hard `24 小时` time window
- both pages apply ranking signals such as source-view bonus, freshness, AI keywords, heat keywords, and content completeness
- `AI 新讯` and `AI 热点` use different default weight mixes

Today this logic is effectively hidden:

- the current `/settings/view-rules` page only exposes `反馈池` and `LLM 设置`
- internal filtering rules live in code and seeded config, not in a readable workbench
- operators cannot clearly tell why an item entered `AI 新讯` or `AI 热点`
- operators also cannot selectively disable one rule to judge whether it improves or harms results

This round should restore `/settings/view-rules` as a readable, controllable content-filter workbench without reintroducing the old NL strategy editing flow.

## Goals

This change should:

- explain the current real filtering logic for `AI 新讯` and `AI 热点`
- expose page-specific filter toggles in `/settings/view-rules`
- let operators independently enable or disable key filtering signals
- keep current weight values visible as read-only reference
- make it possible to evaluate filtering behavior without editing code

## Non-Goals

This change should not:

- reintroduce NL rule editors, draft workflow, or evaluation runs
- make weight numbers editable in this round
- add a new storage table if existing `view_rule_configs` can be reused
- redesign unrelated content pages or the source settings page
- change source collection enable/disable behavior in `/settings/sources`

## Current Runtime Logic To Make Explicit

The workbench must describe the real runtime behavior as it exists today.

### AI 新讯

The current `AI 新讯` pipeline is effectively:

- source filter selection
- hard `24 小时` time-window filtering
- source-view bonus for sources whose `navigationViews` include `ai`
- ranking with a default weight mix that favors AI-related signals

Current default internal weights:

- `freshnessWeight = 0.10`
- `sourceWeight = 0.10`
- `completenessWeight = 0.15`
- `aiWeight = 0.50`
- `heatWeight = 0.15`

### AI 热点

The current `AI 热点` pipeline is effectively:

- source filter selection
- no hard `24 小时` block
- source-view bonus for sources whose `navigationViews` include `hot`
- ranking with a default weight mix that favors freshness and heat signals

Current default internal weights:

- `freshnessWeight = 0.35`
- `sourceWeight = 0.10`
- `completenessWeight = 0.10`
- `aiWeight = 0.05`
- `heatWeight = 0.40`

### Shared Notes

- source selection from the content toolbar remains outside this workbench; it is still a user browsing filter
- this workbench controls page-level filtering and ranking behavior, not source collection
- `LLM 设置` remains unrelated to current page filtering behavior

## Page Structure

The `/settings/view-rules` page should expand into five sections, in this order:

1. `当前筛选总览`
2. `AI 新讯筛选`
3. `AI 热点筛选`
4. `反馈池`
5. `LLM 设置`

This keeps the current simplified page surface while adding a dedicated filter workbench above the existing management sections.

## Section 1: Current Filter Overview

This section must explain the currently active rules before exposing switches.

It should show two summary cards:

- `AI 新讯`
- `AI 热点`

Each card should display:

- which toggles are currently enabled
- a short natural-language summary of the page's current filtering direction
- the current read-only weight values relevant to that page

Example summary style:

- `AI 新讯当前会优先保留最近 24 小时内容，并按 AI 关键词、来源偏置和综合评分排序。`
- `AI 热点当前不会强行限制 24 小时，但会按热点关键词、新鲜度和来源偏置排序。`

The goal of this section is operator comprehension first, not configuration density.

## Section 2: AI 新讯筛选

This section manages page-specific toggles for `AI 新讯`.

It should expose these switches:

- `enableTimeWindow`
- `enableSourceViewBonus`
- `enableAiKeywordWeight`
- `enableHeatKeywordWeight`
- `enableScoreRanking`

Each switch must include an explanation of what changes when it is off.

Required behavior:

- `enableTimeWindow = false`
  - `AI 新讯` stops hard-blocking items outside the last 24 hours
- `enableSourceViewBonus = false`
  - sources whose `navigationViews` include `ai` no longer receive page-native bonus
- `enableAiKeywordWeight = false`
  - AI keyword contribution becomes `0`
- `enableHeatKeywordWeight = false`
  - heat keyword contribution becomes `0`
- `enableScoreRanking = false`
  - the page stops using composite ranking score and falls back to publish-time descending order after source filtering

This section should also show current read-only weights.

## Section 3: AI 热点筛选

This section manages page-specific toggles for `AI 热点`.

It should expose these switches:

- `enableSourceViewBonus`
- `enableAiKeywordWeight`
- `enableHeatKeywordWeight`
- `enableFreshnessWeight`
- `enableScoreRanking`

Required behavior:

- `enableSourceViewBonus = false`
  - sources whose `navigationViews` include `hot` no longer receive page-native bonus
- `enableAiKeywordWeight = false`
  - AI keyword contribution becomes `0`
- `enableHeatKeywordWeight = false`
  - heat keyword contribution becomes `0`
- `enableFreshnessWeight = false`
  - freshness contribution becomes `0`
- `enableScoreRanking = false`
  - the page stops using composite ranking score and falls back to publish-time descending order after source filtering

This section should also show current read-only weights.

## Persistence Model

This round should reuse the existing `view_rule_configs` table and repository layer.

The existing `config_json` payload should be extended from weight-only configuration to a richer shape that contains:

- numeric weights and limits
- per-page boolean toggles

The existing rule keys stay unchanged:

- `ai`
- `hot`
- `articles` remains untouched in this round

This avoids creating a parallel filter-settings table.

## Config Shape

The normalized rule config should be extended to include toggle fields.

### Shared Existing Numeric Fields

- `limit`
- `freshnessWindowDays`
- `freshnessWeight`
- `sourceWeight`
- `completenessWeight`
- `aiWeight`
- `heatWeight`

### New Toggle Fields

- `enableTimeWindow`
- `enableSourceViewBonus`
- `enableAiKeywordWeight`
- `enableHeatKeywordWeight`
- `enableFreshnessWeight`
- `enableScoreRanking`

Not every toggle needs to be surfaced for every page, but the normalized config may still carry the full shape for consistency.

## Backend Behavior Changes

The content selection pipeline should read the persisted rule config instead of relying on hidden fixed defaults alone.

The work should remain centered in `buildContentViewSelection.ts`.

### Time Window

The current `AI 新讯` hard `24 小时` block should become toggle-controlled by `enableTimeWindow`.

When disabled:

- `AI 新讯` should not block candidates only because they are older than 24 hours

### Source View Bonus

The current page-native source bonus should become toggle-controlled by `enableSourceViewBonus`.

When disabled:

- `navigationViews` should remain metadata only
- the matching source bonus should contribute `0`

### Keyword Weights

The current AI and heat keyword contributions should become independently toggleable.

When disabled:

- the corresponding contribution should be treated as `0`
- other ranking dimensions may still remain active

### Freshness Weight

Freshness contribution should become toggle-controlled where exposed.

When disabled:

- freshness should contribute `0`
- publish timestamp may still be used for fallback ordering when score ranking is off

### Score Ranking

This toggle controls whether the page uses composite ranking score or falls back to a simple ordering.

When disabled:

- after source filtering and any hard blocking, final ordering should fall back to publish-time descending
- this fallback should be deterministic and not depend on composite score

## Settings API Changes

`GET /api/settings/view-rules` should expand to include a new filter-workbench payload.

Recommended top-level structure:

- `filterWorkbench`
- `feedbackPool`
- `providerSettings`
- `providerCapability`

`filterWorkbench` should include:

- `aiRule`
- `hotRule`

Each rule payload should include:

- `ruleKey`
- `displayName`
- `summary`
- `toggles`
- `weights`

The service layer should not force the Vue page to reconstruct these semantics manually from raw DB rows.

## Settings Write Action

Add a dedicated action route for content filter settings.

Recommended route:

- `POST /actions/view-rules/content-filters`

The route should accept:

- `ruleKey`
- toggle values for that page

This route is intentionally separate from removed NL strategy routes so the product language stays clear.

## Save Interaction

Changes should not auto-apply on every switch toggle.

Instead:

- each page section manages its own local draft state
- `AI 新讯筛选` has its own save button
- `AI 热点筛选` has its own save button

This keeps experimentation understandable and avoids noisy immediate behavior changes while operators are comparing rule combinations.

## Content Page Traceability

The content pages should expose a concise strategy summary near the page controls or intro area.

Examples:

- `当前 AI 新讯：24 小时窗口 开 / 来源偏置 开 / AI 关键词 开 / 热点关键词 关 / 评分排序 开`
- `当前 AI 热点：来源偏置 开 / AI 关键词 关 / 热点关键词 开 / 新鲜度 开 / 评分排序 开`

This is important because operators need to remember which rule set is currently active while checking actual cards.

## Fallback Behavior

If all page-specific filtering toggles relevant to ranking are disabled, the page should degrade to:

- source filter selection still applies
- no page-native score-based bias
- publish-time descending ordering

This gives operators a stable comparison baseline.

## Testing Impact

At minimum, tests should cover:

- rule-config normalization with new toggle fields
- repository read/write behavior for extended config JSON
- content selection behavior when each toggle is on or off
- settings API read model for the new `filterWorkbench`
- content-filter save route
- `/settings/view-rules` page rendering and save interaction
- content-page strategy summary rendering

## Documentation Impact

The following docs must be updated in the same round if implementation lands:

- `AGENTS.md`
- `README.md`

The docs should describe `/settings/view-rules` as a page that now includes:

- content filter explanation and control for `AI 新讯` and `AI 热点`
- `反馈池`
- `LLM 设置（暂未使用）`
