# Sources Operations Visual Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/settings/sources` 页面拆成“即时操作”和“数据源状态”两类明确区域，让操作卡和 source 卡在结构与视觉上明显分层。

**Architecture:** 保持现有 Fastify SSR 和 `data-system-action` 契约不变，只在 `renderSystemPages.ts` 上重组 `/settings/sources` 的 HTML 结构，在 `site.css` 中补充分区和差异化视觉规则，并用 `systemRoutes` 页面测试锁住新的 section 结构。

**Tech Stack:** TypeScript SSR templates, CSS, Vitest

---

### Task 1: 重组 `/settings/sources` 的页面结构

**Files:**
- Modify: `src/server/renderSystemPages.ts`
- Test: `tests/server/systemRoutes.test.ts`

- [ ] 为 `/settings/sources` 输出两个 section 容器：`即时操作` 和 `数据源状态`
- [ ] 把 `手动执行采集` 与 `手动发送最新报告` 卡片放进操作区
- [ ] 把 source 卡片放进数据源区
- [ ] 保持所有 `data-system-action`、按钮文案和状态文案不变

### Task 2: 拉开两类卡片的视觉语义

**Files:**
- Modify: `src/server/public/site.css`

- [ ] 为“即时操作”区增加独立标题、说明和更强的卡片样式
- [ ] 为“数据源状态”区增加独立标题、说明和更克制的列表样式
- [ ] 提高操作卡按钮和面板权重，降低 source 卡噪音
- [ ] 保持响应式下的可读性，不让小屏布局失衡

### Task 3: 锁定结构回归并做局部验证

**Files:**
- Modify: `tests/server/systemRoutes.test.ts`

- [ ] 断言 `/settings/sources` 页面存在“即时操作”和“数据源状态”两个分区
- [ ] 断言操作卡只出现在操作区，source 卡只出现在数据源区
- [ ] 运行 `npx vitest run tests/server/systemRoutes.test.ts`
- [ ] 如结构改动影响渲染，补跑 `npm run build`
