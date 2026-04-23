# HotNow Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 HotNow 产出一套可直接落库的纯图标 logo，包括高清版和普清版 PNG 资源。

**Architecture:** 先用统一的品牌 prompt 生成 1024x1024 主图标，再基于同一视觉语言导出 256x256 普清版。最终资产统一落到 `src/server/public/brand/`，避免只停留在默认生成目录里。

**Tech Stack:** Codex built-in image generation、PNG 位图资源、仓库静态资源目录

---

## File Structure

- Create: `src/server/public/brand/`
  - 存放最终可交付的 logo 资源
- Create: `src/server/public/brand/hotnow-logo-hd.png`
  - 高清版 logo，1024x1024
- Create: `src/server/public/brand/hotnow-logo-sd.png`
  - 普清版 logo，256x256
- Modify: `README.md`（可选，只有在本轮决定顺手补资源说明时才改）
  - 如果需要，把 logo 资源位置补进文档；本轮默认不改

### Task 1: 准备静态资源落点

**Files:**
- Create: `src/server/public/brand/`

- [ ] **Step 1: 确认目标目录当前不存在同名 logo**

Run:

```bash
find src/server/public -maxdepth 2 -type f | sort | rg 'hotnow-logo|brand'
```

Expected: 没有现成的 `hotnow-logo-hd.png` / `hotnow-logo-sd.png`

- [ ] **Step 2: 创建品牌资源目录**

Run:

```bash
mkdir -p src/server/public/brand
```

Expected: `src/server/public/brand/` 存在

- [ ] **Step 3: 验证目录已创建**

Run:

```bash
find src/server/public -maxdepth 2 -type d | sort | rg 'src/server/public/brand$'
```

Expected: 输出 `src/server/public/brand`

### Task 2: 生成高清主图标

**Files:**
- Create: `src/server/public/brand/hotnow-logo-hd.png`

- [ ] **Step 1: 使用固定 prompt 生成高清主图标**

Prompt:

```text
Use case: logo-brand
Asset type: app icon master logo
Primary request: create a minimal pure icon logo for HotNow
Scene/backdrop: a clean rounded-square app icon container
Subject: a central hotspot signal dot with one to two simple expanding signal rings
Style/medium: crisp modern geometric logo mark, vector-friendly look, minimal and clean
Composition/framing: perfectly centered symbol inside a rounded square, balanced negative space, no text
Lighting/mood: subtle high-contrast polished finish, calm and sharp, not flashy
Color palette: near-black or deep ink blue base with bright cyan-blue signal elements
Materials/textures: flat clean surfaces, no heavy texture, no photo realism
Text (verbatim): ""
Constraints: pure icon only, no wordmark, no letters, no radar sweep wedge, no clock metaphor, no lightning bolt, no watermark
Avoid: complex decoration, rainbow gradients, excessive glow, thin fragile details
```

Expected: 得到一张 `1024x1024` 候选主图标

- [ ] **Step 2: 选择最终高清输出并复制到仓库**

Run:

```bash
cp "$CODEX_HOME/generated_images/<selected-file>.png" src/server/public/brand/hotnow-logo-hd.png
```

Expected: `src/server/public/brand/hotnow-logo-hd.png` 存在

- [ ] **Step 3: 检查高清图尺寸**

Run:

```bash
sips -g pixelWidth -g pixelHeight src/server/public/brand/hotnow-logo-hd.png
```

Expected:

```text
pixelWidth: 1024
pixelHeight: 1024
```

- [ ] **Step 4: 人工验收高清图**

Checklist:

```text
- 图标为纯图标，不含文字
- 外轮廓为圆角方形
- 中间有明确热点信号点
- 周围只有简洁波纹，没有复杂雷达扇区
- 视觉简洁，不复杂
```

### Task 3: 生成普清版

**Files:**
- Create: `src/server/public/brand/hotnow-logo-sd.png`

- [ ] **Step 1: 基于同一视觉语言生成或缩放普清版**

Preferred prompt:

```text
Use case: logo-brand
Asset type: app icon small-size variant
Primary request: create the simplified small-size version of the same HotNow logo
Scene/backdrop: rounded-square icon container
Subject: one central hotspot dot and a simplified signal ring system
Style/medium: minimal geometric app icon, optimized for small-size clarity
Composition/framing: perfectly centered, large readable shapes, no text
Lighting/mood: restrained and crisp
Color palette: near-black or deep ink blue base with bright cyan-blue signal elements
Constraints: preserve the same logo language as the HD version, but reduce fine detail for 64x64 and 128x128 readability
Avoid: extra rings, tiny highlights, thin outlines, complex effects
```

Fallback if the generated HD version is already sufficiently clean:

```bash
sips -z 256 256 src/server/public/brand/hotnow-logo-hd.png --out src/server/public/brand/hotnow-logo-sd.png
```

Expected: `src/server/public/brand/hotnow-logo-sd.png` 存在

- [ ] **Step 2: 检查普清图尺寸**

Run:

```bash
sips -g pixelWidth -g pixelHeight src/server/public/brand/hotnow-logo-sd.png
```

Expected:

```text
pixelWidth: 256
pixelHeight: 256
```

- [ ] **Step 3: 小尺寸可读性验收**

Checklist:

```text
- 缩小后仍能看出中心热点和波纹关系
- 没有因为细节过多而发糊
- 不会误读成时钟、雷达、闪电
```

### Task 4: 最终验收与交付

**Files:**
- Verify: `src/server/public/brand/hotnow-logo-hd.png`
- Verify: `src/server/public/brand/hotnow-logo-sd.png`

- [ ] **Step 1: 列出最终产物**

Run:

```bash
find src/server/public/brand -maxdepth 1 -type f | sort
```

Expected:

```text
src/server/public/brand/hotnow-logo-hd.png
src/server/public/brand/hotnow-logo-sd.png
```

- [ ] **Step 2: 对最终文件做尺寸复核**

Run:

```bash
sips -g pixelWidth -g pixelHeight \
  src/server/public/brand/hotnow-logo-hd.png \
  src/server/public/brand/hotnow-logo-sd.png
```

Expected:

```text
hotnow-logo-hd.png -> 1024x1024
hotnow-logo-sd.png -> 256x256
```

- [ ] **Step 3: 提交品牌资源**

Run:

```bash
git add src/server/public/brand/hotnow-logo-hd.png src/server/public/brand/hotnow-logo-sd.png
git commit -m "feat: add hotnow app icon logo"
```

Expected: 提交成功，且只包含两张 logo 资源

## Self-Review

- Spec coverage:
  - 纯图标：Task 2 / Task 3 明确不带文字
  - 圆角方形：Task 2 / Task 3 prompt 已固定
  - 热点 / 信号波纹：Task 2 / Task 3 prompt 已固定
  - 高清 / 普清双版本：Task 2 / Task 3 已覆盖
- Placeholder scan:
  - 唯一运行时变量是 `$CODEX_HOME/generated_images/<selected-file>.png`，这是 built-in image generation 的实际输出路径占位，执行时需替换为真实选中结果
- Type consistency:
  - 两个目标文件名统一为 `hotnow-logo-hd.png` 与 `hotnow-logo-sd.png`
