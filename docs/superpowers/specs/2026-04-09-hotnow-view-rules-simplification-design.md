# HotNow View Rules Simplification Design

## Background

The current `/settings/view-rules` page still carries the full strategy workbench model:

- four gate-based NL rule editors
- gate enable switches
- evaluation run status and cancel flow
- feedback-pool to draft conversion
- draft editing and draft-to-formal strategy flow
- provider settings tied to NL evaluation behavior

The product direction has changed. The page should no longer act as a strategy editor. It should shrink to a much simpler management page centered around `反馈池`, while keeping `LLM 设置` only as a placeholder configuration area for future reuse.

## Goals

This change should:

- remove the entire formal-strategy and draft workflow from `/settings/view-rules`
- keep `反馈池` as the only editable text-management area on the page
- keep the name `反馈池` unchanged
- keep `LLM 设置`, but clearly mark it as `暂未使用`
- stop any current page-level behavior that edits, saves, cancels, or applies NL strategies

## Non-Goals

This change should not:

- remove the `/settings/view-rules` route itself
- remove content-card feedback submission into `反馈池`
- delete underlying NL-related database tables in this round
- remove provider settings persistence
- redesign unrelated pages or navigation

## Final Page Structure

The `/settings/view-rules` page should be simplified into two sections only.

### 1. Feedback Pool

This becomes the main section of the page.

It keeps:

- list of current feedback entries
- entry content display
- entry-level delete action
- page-level `复制全部反馈`
- page-level `清空全部反馈`

It removes:

- convert feedback into draft
- any wording about drafts or formal strategy

Empty state copy should describe only the current behavior:

- `反馈池为空，内容页提交的新反馈词会显示在这里。`

### 2. LLM Settings

This section remains on the page, but is explicitly labeled as unused for now.

It keeps:

- provider settings display
- provider save / activation / delete actions

It changes:

- section-level status and helper copy must clearly state that these settings are currently not used by filtering or recalculation logic
- the page must not imply that saving provider settings will affect current content behavior

Recommended wording:

- status tag: `暂未使用`
- helper copy: `当前版本暂不使用 LLM 设置参与筛选策略或重算，先保留配置入口供后续功能复用。`

## Removed Product Behaviors

The following behavior chain is removed from current product logic:

- four gates: `base / ai_new / ai_hot / hero`
- gate enable switches
- gate NL rule text editing
- saving formal NL rules
- cancelling evaluation runs
- feedback-to-draft conversion
- strategy draft editing
- saving drafts as formal strategy
- deleting drafts from the page
- any page-level run status or recalculation overview

## Backend Changes

### Removed Routes

These routes should be removed:

- `POST /actions/view-rules/nl-rules`
- `POST /actions/view-rules/nl-rules/cancel`
- `POST /actions/feedback-pool/:id/create-draft`
- `POST /actions/strategy-drafts/:id/save`
- `POST /actions/strategy-drafts/:id/delete`

### Retained Routes

These routes stay:

- `GET /api/settings/view-rules`
- `POST /actions/view-rules/provider-settings`
- `POST /actions/view-rules/provider-settings/activation`
- `POST /actions/view-rules/provider-settings/delete`
- `POST /actions/content/:id/feedback-pool`
- `POST /actions/feedback-pool/:id/delete`
- `POST /actions/feedback-pool/clear`

### Read Model Simplification

The `/api/settings/view-rules` response should stop exposing strategy-editor state that is no longer used by the page.

Remove from the page model:

- `nlRules`
- `latestEvaluationRun`
- `isEvaluationRunning`
- `isEvaluationStopRequested`
- `strategyDrafts`

Retain:

- `feedbackPool`
- `providerSettings`
- `providerCapability`

If needed, `providerCapability` may keep enough information to show why settings are still configurable, but it must no longer imply that the page currently runs strategy evaluation.

## Main Runtime Wiring

`src/main.ts` should stop wiring the view-rules page into the strategy-editing flow.

Remove page-level dependency injection for:

- saving NL rules
- cancelling NL evaluation
- creating drafts from feedback
- saving drafts
- deleting drafts

Retain dependency injection for:

- reading the simplified workbench model
- provider settings save / activation / delete
- feedback-pool delete / clear

This change removes the page workflow without forcing a destructive cleanup of lower-level repository modules in the same round.

## Data Layer Scope

This round should not perform destructive schema cleanup.

Keep existing tables for now, including tables related to:

- NL rules
- NL evaluation runs
- strategy drafts

But the page and active route layer should stop reading or mutating them as part of `/settings/view-rules`.

## Copy and Naming Rules

- Keep the name `反馈池`
- Do not rename it to any alternative wording
- Remove wording that implies `反馈池 -> 草稿 -> 正式策略`
- Content-card success text should continue to mention saving into `反馈池`, not into drafts or strategy

## Testing Impact

Tests should be updated to reflect the simplified product surface.

At minimum:

- page tests for `/settings/view-rules`
- server route tests for removed actions
- settings API tests for removed client actions
- runtime wiring tests for removed dependencies
- documentation assertions if any tests hardcode old view-rules copy

## Documentation Impact

The following docs must be updated in the same round:

- `AGENTS.md`
- `README.md`

The documentation should stop describing `/settings/view-rules` as a gate-based NL strategy workbench and instead describe it as a `反馈池 + LLM 设置占位` page.
