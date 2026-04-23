# Sources Theme Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 `/settings/sources` 页面在浅色主题下仍然使用深色卡片外观的问题，让操作卡和数据源卡都真正跟随当前主题。

**Architecture:** 主要在 `site.css` 中把操作主卡、操作次卡和数据源卡从写死的深色背景改成按主题 token 驱动；SSR 结构和接口协议保持不变。验证聚焦在现有 `systemRoutes` 页面测试和 TypeScript 构建。

**Tech Stack:** CSS, TypeScript SSR templates, Vitest

---

### Task 1: 把卡片背景从固定深色改成主题语义 token

**Files:**
- Modify: `src/server/public/site.css`

- [ ] 为操作主卡、操作次卡、数据源卡补一组可随 light/dark 切换的 token
- [ ] 移除这三类卡片上直接写死的深色 `rgba(...)` 背景主值
- [ ] 保持深色模式的控制台层级，同时让浅色模式使用真正的浅色卡片底色

### Task 2: 修正浅色模式下的文案对比度

**Files:**
- Modify: `src/server/public/site.css`

- [ ] 让标题、说明、元信息在浅色卡片上保持高可读性
- [ ] 保持操作卡高于数据源卡的视觉层级，但不再出现“浅色页面 + 深色卡片”的混搭感
- [ ] 如有必要，只做极少量 class 语义增强，不改结构和行为

### Task 3: 跑最相关验证

**Files:**
- Test: `tests/server/systemRoutes.test.ts`

- [ ] 运行 `npx vitest run tests/server/systemRoutes.test.ts`
- [ ] 运行 `npm run build`
