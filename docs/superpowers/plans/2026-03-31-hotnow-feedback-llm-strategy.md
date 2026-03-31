# HotNow Feedback And LLM Strategy Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 HotNow 增加“内容页反馈池 + 草稿池 + LLM 厂商配置 + 正式自然语言策略 + 保存后全量重算 + 采集后增量重算”的完整工作台链路，同时保持现有收藏、点赞、点踩和数值权重策略不回归。

**Architecture:** 继续沿用当前 Fastify SSR + browser `site.js` + SQLite 的单机场景实现模式。新增数据层按 `feedback pool / strategy drafts / nl rule sets / evaluation results / provider settings / evaluation runs` 六个持久化单元拆开；运行时由 `main.ts` 统一装配 repository、LLM provider factory 和自然语言评估服务；内容页只读取预计算结果，不在页面访问时直接调 LLM。

**Tech Stack:** TypeScript, Fastify SSR, better-sqlite3, Node `crypto`, plain browser JS, Vitest, JSDOM

---

## File Map

- Modify: `src/core/db/runMigrations.ts`
  - 升级 schema version，新增反馈池、草稿池、厂商设置、正式规则、评估结果、评估运行表
- Modify: `src/core/types/appConfig.ts`
  - 给运行时配置增加可选的 `llm.settingsMasterKey`
- Modify: `src/core/config/loadRuntimeConfig.ts`
  - 读取 `LLM_SETTINGS_MASTER_KEY`，但不把它变成启动时必填项
- Create: `src/core/feedback/feedbackPoolRepository.ts`
  - 管理反馈池的新增、覆盖、列表、删除、清空和“转草稿”输入准备
- Create: `src/core/strategy/strategyDraftRepository.ts`
  - 管理草稿池的新增、更新、列表、删除
- Create: `src/core/strategy/nlRuleRepository.ts`
  - 管理 `global / hot / articles / ai` 的正式自然语言规则
- Create: `src/core/strategy/nlDecision.ts`
  - 固定 `decision + strength => scoreDelta` 映射，避免模型直接给任意分数
- Create: `src/core/strategy/nlEvaluationRepository.ts`
  - 保存 `content_nl_evaluations` 和 `nl_evaluation_runs`
- Create: `src/core/llm/providerSettingsCrypto.ts`
  - 使用主密钥做 API key 加密/解密
- Create: `src/core/llm/providerSettingsRepository.ts`
  - 管理单活厂商配置、尾号展示和删除逻辑
- Create: `src/core/llm/providers/deepseekProvider.ts`
  - 适配 DeepSeek
- Create: `src/core/llm/providers/minimaxProvider.ts`
  - 适配 MiniMax
- Create: `src/core/llm/providers/kimiProvider.ts`
  - 适配 Kimi
- Create: `src/core/llm/providers/shared.ts`
  - 承载 OpenAI-compatible provider 的公共请求与 JSON 解析 helper
- Create: `src/core/llm/createLlmProvider.ts`
  - 根据当前配置创建统一 provider 接口
- Create: `src/core/strategy/runNlEvaluationCycle.ts`
  - 执行全量/增量自然语言评估任务，写入评估结果和运行状态
- Modify: `src/core/content/listContentView.ts`
  - 读取预计算的 block/scoreDelta，叠加到现有排序和过滤逻辑
- Modify: `src/core/pipeline/runCollectionCycle.ts`
  - collection-only 成功后触发增量自然语言评估
- Modify: `src/main.ts`
  - 装配新 repository、provider setting、重算运行锁和 Fastify 依赖
- Modify: `src/server/createServer.ts`
  - 增加反馈池、草稿池、厂商设置、正式规则、重算相关的 GET/POST 依赖与路由
- Modify: `src/server/renderSystemPages.ts`
  - 把 `/settings/view-rules` 升级成完整策略工作台
- Modify: `src/server/renderContentPages.ts`
  - 在内容卡片操作区增加 `补充反馈` 和局部反馈面板的 SSR 骨架
- Modify: `src/server/public/site.js`
  - 处理局部反馈面板开合、反馈提交、复制、删除确认、草稿写入编辑器、规则保存提示
- Modify: `tests/db/runMigrations.test.ts`
  - 锁定新增表和 schema version
- Modify: `tests/config/loadRuntimeConfig.test.ts`
  - 锁定 `LLM_SETTINGS_MASTER_KEY` 的可选读取行为
- Create: `tests/helpers/testDatabase.ts`
  - 为新增 repository / service 测试提供统一的 SQLite 引导与种子 helper
- Create: `tests/feedback/feedbackPoolRepository.test.ts`
  - 验证反馈池覆盖写入、列表、删除、清空
- Create: `tests/strategy/strategyDraftRepository.test.ts`
  - 验证草稿池新增、更新、删除
- Create: `tests/strategy/nlRuleRepository.test.ts`
  - 验证正式规则的 scope 列表和保存
- Create: `tests/strategy/nlEvaluationRepository.test.ts`
  - 验证评估结果 upsert 和运行状态记录
- Create: `tests/llm/providerSettingsRepository.test.ts`
  - 验证加密存储、尾号展示、无主密钥时报错
- Create: `tests/strategy/runNlEvaluationCycle.test.ts`
  - 验证全量/增量评估、partial-failure、无 provider 降级
- Modify: `tests/content/listContentView.test.ts`
  - 锁定 `block` 过滤和 `scoreDelta` 排序叠加
- Modify: `tests/pipeline/runCollectionCycle.test.ts`
  - 锁定采集后增量评估触发
- Modify: `tests/server/systemRoutes.test.ts`
  - 锁定工作台结构和新增系统 action 路由
- Modify: `tests/server/contentRoutes.test.ts`
  - 锁定内容卡片反馈面板骨架和反馈 action 路由
- Modify: `tests/server/siteThemeClient.test.ts`
  - 锁定 `site.js` 的反馈面板和工作台交互
- Modify: `README.md`
  - 更新系统页能力、自然语言策略说明和环境变量
- Modify: `AGENTS.md`
  - 更新项目内协作文档关于 `/settings/view-rules` 的职责与新增环境变量
- Modify: `.env.example`
  - 新增 `LLM_SETTINGS_MASTER_KEY`

### Task 1: 扩展运行时配置与 SQLite schema

**Files:**
- Modify: `src/core/db/runMigrations.ts`
- Modify: `src/core/types/appConfig.ts`
- Modify: `src/core/config/loadRuntimeConfig.ts`
- Modify: `tests/db/runMigrations.test.ts`
- Modify: `tests/config/loadRuntimeConfig.test.ts`

- [ ] **Step 1: 先补迁移和配置失败断言，锁定新增 schema 与可选主密钥配置**

```ts
// tests/db/runMigrations.test.ts
const expectedTables = [
  "collection_runs",
  "content_feedback",
  "content_items",
  "content_nl_evaluations",
  "content_ratings",
  "content_sources",
  "digest_reports",
  "feedback_pool",
  "llm_provider_settings",
  "nl_evaluation_runs",
  "nl_rule_sets",
  "rating_dimensions",
  "strategy_drafts",
  "user_profile",
  "view_rule_configs"
];

expect(schemaVersion).toBe(3);
expect(appliedMigrations).toEqual([
  { version: 1, name: "001_unified_site_baseline" },
  { version: 2, name: "002_digest_report_mail_attempts" },
  { version: 3, name: "003_feedback_and_llm_strategy_workbench" }
]);
```

```ts
// tests/config/loadRuntimeConfig.test.ts
it("loads optional llm master key when provided", async () => {
  const config = await loadRuntimeConfig({
    configPath: path.resolve("config/hot-now.config.json"),
    env: { ...baseEnv, LLM_SETTINGS_MASTER_KEY: "master-key-123" }
  });

  expect(config.llm).toEqual({ settingsMasterKey: "master-key-123" });
});

it("keeps llm master key nullable when env is missing", async () => {
  const config = await loadRuntimeConfig({
    configPath: path.resolve("config/hot-now.config.json"),
    env: baseEnv
  });

  expect(config.llm).toEqual({ settingsMasterKey: null });
});
```

- [ ] **Step 2: 跑迁移和配置测试，确认当前实现还缺新表和 `llm` 配置**

Run: `npx vitest run tests/db/runMigrations.test.ts tests/config/loadRuntimeConfig.test.ts`

Expected: FAIL，提示缺少新增表、schema version 仍为 `2`，或 `RuntimeConfig` 不包含 `llm`

- [ ] **Step 3: 在迁移文件里新增 version 3 与六张新表**

```ts
// src/core/db/runMigrations.ts
const schemaVersion = 3;
const feedbackAndLlmWorkbenchMigrationName = "003_feedback_and_llm_strategy_workbench";

const migrationStatements = [
  `
    CREATE TABLE IF NOT EXISTS feedback_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_item_id INTEGER NOT NULL UNIQUE,
      reaction_snapshot TEXT,
      free_text TEXT,
      suggested_effect TEXT,
      strength_level TEXT,
      positive_keywords_json TEXT NOT NULL DEFAULT '[]',
      negative_keywords_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS strategy_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_feedback_id INTEGER,
      draft_text TEXT NOT NULL,
      suggested_scope TEXT NOT NULL DEFAULT 'unspecified',
      draft_effect_summary TEXT,
      positive_keywords_json TEXT NOT NULL DEFAULT '[]',
      negative_keywords_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_feedback_id) REFERENCES feedback_pool(id) ON DELETE SET NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS llm_provider_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider_kind TEXT NOT NULL,
      encrypted_api_key TEXT NOT NULL,
      api_key_last4 TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS nl_rule_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL UNIQUE,
      rule_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS content_nl_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_item_id INTEGER NOT NULL,
      scope TEXT NOT NULL,
      decision TEXT NOT NULL,
      strength_level TEXT,
      score_delta INTEGER NOT NULL DEFAULT 0,
      matched_keywords_json TEXT NOT NULL DEFAULT '[]',
      reason TEXT,
      provider_kind TEXT NOT NULL,
      evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(content_item_id, scope),
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS nl_evaluation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_kind TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      item_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `
];
```

- [ ] **Step 4: 在运行时配置里加入可选主密钥，且不让启动因为它缺失而失败**

```ts
// src/core/types/appConfig.ts
export type RuntimeConfig = {
  auth: {
    username: string;
    password: string;
    sessionSecret: string;
  };
  llm: {
    settingsMasterKey: string | null;
  };
};
```

```ts
// src/core/config/loadRuntimeConfig.ts
return {
  auth: {
    username: required(env.AUTH_USERNAME, "AUTH_USERNAME"),
    password: required(env.AUTH_PASSWORD, "AUTH_PASSWORD"),
    sessionSecret: required(env.SESSION_SECRET, "SESSION_SECRET")
  },
  llm: {
    settingsMasterKey: typeof env.LLM_SETTINGS_MASTER_KEY === "string" && env.LLM_SETTINGS_MASTER_KEY.trim().length > 0
      ? env.LLM_SETTINGS_MASTER_KEY.trim()
      : null
  }
};
```

- [ ] **Step 5: 回跑迁移和配置测试，确认 schema 与运行时配置都已就位**

Run: `npx vitest run tests/db/runMigrations.test.ts tests/config/loadRuntimeConfig.test.ts`

Expected: PASS

- [ ] **Step 6: 提交 schema 与运行时配置基础改动**

```bash
git add src/core/db/runMigrations.ts src/core/types/appConfig.ts src/core/config/loadRuntimeConfig.ts tests/db/runMigrations.test.ts tests/config/loadRuntimeConfig.test.ts
git commit -m "feat: add feedback and llm strategy schema"
```

### Task 2: 实现反馈池 repository

**Files:**
- Create: `tests/helpers/testDatabase.ts`
- Create: `src/core/feedback/feedbackPoolRepository.ts`
- Create: `tests/feedback/feedbackPoolRepository.test.ts`

- [ ] **Step 1: 先创建通用测试 helper，避免每个新测试文件重复搭 SQLite 引导**

```ts
// tests/helpers/testDatabase.ts
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { upsertFeedbackPoolEntry } from "../../src/core/feedback/feedbackPoolRepository.js";

export async function createTestDatabase() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-feedback-"));
  const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
  runMigrations(db);
  seedInitialData(db, {
    username: "admin",
    password: "bootstrap-password"
  });
  return db;
}

export function seedContentItem(
  db: ReturnType<typeof openDatabase>,
  input: { title: string; canonicalUrl: string; summary?: string; bodyMarkdown?: string; sourceKind?: "openai" | "juya" }
) {
  const source = resolveSourceByKind(db, input.sourceKind ?? "openai");

  if (!source) {
    throw new Error("missing source");
  }

  upsertContentItems(db, {
    sourceId: source.id,
    items: [
      {
        title: input.title,
        canonicalUrl: input.canonicalUrl,
        summary: input.summary ?? "summary",
        bodyMarkdown: input.bodyMarkdown ?? "body",
        publishedAt: "2026-03-31T09:00:00.000Z",
        fetchedAt: "2026-03-31T09:05:00.000Z"
      }
    ]
  });

  const row = db.prepare("SELECT id FROM content_items WHERE canonical_url = ? LIMIT 1").get(input.canonicalUrl) as { id: number };
  return row.id;
}

export function seedFeedbackEntry(
  db: ReturnType<typeof openDatabase>,
  input: {
    title: string;
    canonicalUrl: string;
    freeText: string;
    suggestedEffect: "boost" | "penalize" | "block" | "neutral";
    strengthLevel: "low" | "medium" | "high";
    positiveKeywords: string[];
  }
) {
  const contentItemId = seedContentItem(db, {
    title: input.title,
    canonicalUrl: input.canonicalUrl
  });

  upsertFeedbackPoolEntry(db, {
    contentItemId,
    reactionSnapshot: "like",
    freeText: input.freeText,
    suggestedEffect: input.suggestedEffect,
    strengthLevel: input.strengthLevel,
    positiveKeywords: input.positiveKeywords,
    negativeKeywords: []
  });

  const row = db.prepare("SELECT id FROM feedback_pool WHERE content_item_id = ? LIMIT 1").get(contentItemId) as { id: number };
  return row.id;
}
```

- [ ] **Step 2: 再写反馈池 repository 测试，锁定“同一内容只保留一条反馈并可覆盖”**

```ts
// tests/feedback/feedbackPoolRepository.test.ts
import { createTestDatabase, seedContentItem } from "../helpers/testDatabase.js";

it("upserts one feedback entry per content item and overwrites the previous entry", async () => {
  const db = await createTestDatabase();
  const itemId = seedContentItem(db, { title: "AI note", canonicalUrl: "https://example.com/ai-note" });

  expect(
    upsertFeedbackPoolEntry(db, {
      contentItemId: itemId,
      reactionSnapshot: "like",
      freeText: "这类 AI 工具合集值得加分",
      suggestedEffect: "boost",
      strengthLevel: "medium",
      positiveKeywords: ["AI 工具", "效率"],
      negativeKeywords: []
    })
  ).toEqual({ ok: true });

  expect(
    upsertFeedbackPoolEntry(db, {
      contentItemId: itemId,
      reactionSnapshot: "dislike",
      freeText: "这类广告口吻内容先压一下",
      suggestedEffect: "penalize",
      strengthLevel: "high",
      positiveKeywords: [],
      negativeKeywords: ["营销", "广告"]
    })
  ).toEqual({ ok: true });

  const entries = listFeedbackPoolEntries(db);

  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    contentItemId: itemId,
    reactionSnapshot: "dislike",
    freeText: "这类广告口吻内容先压一下",
    suggestedEffect: "penalize",
    strengthLevel: "high",
    positiveKeywords: ["营销", "广告"]
  });
});
```

- [ ] **Step 3: 再补删除与清空测试，锁定反馈池管理动作**

```ts
it("deletes one feedback entry and clears the whole pool", async () => {
  const db = await createTestDatabase();
  const firstId = seedContentItem(db, { title: "One", canonicalUrl: "https://example.com/one" });
  const secondId = seedContentItem(db, { title: "Two", canonicalUrl: "https://example.com/two" });

  upsertFeedbackPoolEntry(db, {
    contentItemId: firstId,
    reactionSnapshot: "like",
    freeText: "保留",
    suggestedEffect: "boost",
    strengthLevel: "low",
    positiveKeywords: ["OpenAI"],
    negativeKeywords: []
  });
  upsertFeedbackPoolEntry(db, {
    contentItemId: secondId,
    reactionSnapshot: "none",
    freeText: "屏蔽",
    suggestedEffect: "block",
    strengthLevel: "high",
    positiveKeywords: [],
    negativeKeywords: ["软文"]
  });

  const [firstEntry] = listFeedbackPoolEntries(db);
  expect(deleteFeedbackPoolEntry(db, firstEntry.id)).toEqual({ ok: true });
  expect(clearFeedbackPool(db)).toBe(1);
  expect(listFeedbackPoolEntries(db)).toEqual([]);
});
```

- [ ] **Step 4: 跑反馈池测试，确认 repository 还不存在**

Run: `npx vitest run tests/feedback/feedbackPoolRepository.test.ts`

Expected: FAIL，提示缺少 `feedbackPoolRepository.ts` 或导出函数未定义

- [ ] **Step 5: 实现反馈池 repository，沿用当前 better-sqlite3 事务风格**

```ts
// src/core/feedback/feedbackPoolRepository.ts
import type { ReactionValue } from "./feedbackRepository.js";
import type { SqliteDatabase } from "../db/openDatabase.js";

export type FeedbackPoolEffect = "boost" | "penalize" | "block" | "neutral";
export type FeedbackPoolStrength = "low" | "medium" | "high";
export type FeedbackPoolSaveResult = { ok: true } | { ok: false; reason: "not-found" };

export function upsertFeedbackPoolEntry(
  db: SqliteDatabase,
  input: {
    contentItemId: number;
    reactionSnapshot: ReactionValue;
    freeText?: string;
    suggestedEffect?: FeedbackPoolEffect | null;
    strengthLevel?: FeedbackPoolStrength | null;
    positiveKeywords: string[];
    negativeKeywords: string[];
  }
): FeedbackPoolSaveResult {
  const exists = db.prepare("SELECT id FROM content_items WHERE id = ? LIMIT 1").get(input.contentItemId) as { id: number } | undefined;

  if (!exists) {
    return { ok: false, reason: "not-found" };
  }

  db.prepare(
    `
      INSERT INTO feedback_pool (
        content_item_id,
        reaction_snapshot,
        free_text,
        suggested_effect,
        strength_level,
        positive_keywords_json,
        negative_keywords_json,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(content_item_id) DO UPDATE SET
        reaction_snapshot = excluded.reaction_snapshot,
        free_text = excluded.free_text,
        suggested_effect = excluded.suggested_effect,
        strength_level = excluded.strength_level,
        positive_keywords_json = excluded.positive_keywords_json,
        negative_keywords_json = excluded.negative_keywords_json,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(
    input.contentItemId,
    input.reactionSnapshot,
    input.freeText?.trim() || null,
    input.suggestedEffect ?? null,
    input.strengthLevel ?? null,
    JSON.stringify(normalizeKeywords(input.positiveKeywords)),
    JSON.stringify(normalizeKeywords(input.negativeKeywords))
  );

  return { ok: true };
}

function normalizeKeywords(values: string[]) {
  return values.map((item) => item.trim()).filter(Boolean);
}
```

- [ ] **Step 6: 实现列表与删除辅助函数，确保系统页能直接拿到标题和链接**

```ts
export function listFeedbackPoolEntries(db: SqliteDatabase) {
  const rows = db.prepare(
    `
      SELECT
        fp.id,
        fp.content_item_id AS contentItemId,
        fp.reaction_snapshot AS reactionSnapshot,
        fp.free_text AS freeText,
        fp.suggested_effect AS suggestedEffect,
        fp.strength_level AS strengthLevel,
        fp.positive_keywords_json AS positiveKeywordsJson,
        fp.negative_keywords_json AS negativeKeywordsJson,
        fp.updated_at AS updatedAt,
        ci.title AS title,
        ci.canonical_url AS canonicalUrl,
        cs.name AS sourceName
      FROM feedback_pool fp
      JOIN content_items ci ON ci.id = fp.content_item_id
      JOIN content_sources cs ON cs.id = ci.source_id
      ORDER BY datetime(fp.updated_at) DESC, fp.id DESC
    `
  ).all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: Number(row.id),
    contentItemId: Number(row.contentItemId),
    title: String(row.title),
    canonicalUrl: String(row.canonicalUrl),
    sourceName: String(row.sourceName),
    reactionSnapshot: (row.reactionSnapshot as ReactionValue) ?? "none",
    freeText: typeof row.freeText === "string" ? row.freeText : "",
    suggestedEffect: row.suggestedEffect,
    strengthLevel: row.strengthLevel,
    positiveKeywords: parseKeywordJson(row.positiveKeywordsJson),
    negativeKeywords: parseKeywordJson(row.negativeKeywordsJson),
    updatedAt: String(row.updatedAt)
  }));
}

export function deleteFeedbackPoolEntry(db: SqliteDatabase, id: number) {
  const result = db.prepare("DELETE FROM feedback_pool WHERE id = ?").run(id);
  return result.changes > 0 ? { ok: true as const } : { ok: false as const, reason: "not-found" as const };
}

export function clearFeedbackPool(db: SqliteDatabase) {
  return db.prepare("DELETE FROM feedback_pool").run().changes;
}

function parseKeywordJson(value: unknown) {
  try {
    const parsed = JSON.parse(typeof value === "string" ? value : "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 7: 回跑反馈池测试并提交**

Run: `npx vitest run tests/feedback/feedbackPoolRepository.test.ts`

Expected: PASS

```bash
git add src/core/feedback/feedbackPoolRepository.ts tests/feedback/feedbackPoolRepository.test.ts
git commit -m "feat: add feedback pool repository"
```

### Task 3: 实现草稿池与正式自然语言规则 repository

**Files:**
- Create: `src/core/strategy/strategyDraftRepository.ts`
- Create: `src/core/strategy/nlRuleRepository.ts`
- Create: `tests/strategy/strategyDraftRepository.test.ts`
- Create: `tests/strategy/nlRuleRepository.test.ts`

- [ ] **Step 1: 先写草稿池测试，锁定“从反馈转草稿、再编辑草稿”的基本行为**

```ts
// tests/strategy/strategyDraftRepository.test.ts
import { createTestDatabase, seedFeedbackEntry } from "../helpers/testDatabase.js";

it("creates a draft from feedback data and allows later edits", async () => {
  const db = await createTestDatabase();
  const feedbackId = seedFeedbackEntry(db, {
    title: "AI 编程工具合集",
    canonicalUrl: "https://example.com/dev-tools",
    freeText: "这类工具盘点值得在文章页加一点分",
    suggestedEffect: "boost",
    strengthLevel: "medium",
    positiveKeywords: ["AI 编程", "工具合集"]
  });

  const draftId = createStrategyDraft(db, {
    sourceFeedbackId: feedbackId,
    suggestedScope: "articles",
    draftText: "文章页优先保留 AI 编程工具合集、实践经验与可复用清单。",
    draftEffectSummary: "boost:medium",
    positiveKeywords: ["AI 编程", "工具合集"],
    negativeKeywords: []
  });

  updateStrategyDraft(db, draftId, {
    suggestedScope: "hot",
    draftText: "热点页只给真正高讨论度的 AI 编程工具清单加分。"
  });

  const [draft] = listStrategyDrafts(db);
  expect(draft).toMatchObject({
    id: draftId,
    sourceFeedbackId: feedbackId,
    suggestedScope: "hot",
    draftText: "热点页只给真正高讨论度的 AI 编程工具清单加分。"
  });
});
```

- [ ] **Step 2: 再写正式规则测试，锁定四个 scope 的保存与读取**

```ts
// tests/strategy/nlRuleRepository.test.ts
import { createTestDatabase } from "../helpers/testDatabase.js";

it("upserts nl rules by scope and returns all four scopes", async () => {
  const db = await createTestDatabase();

  saveNlRule(db, "global", "暂时不展示泛营销软文。");
  saveNlRule(db, "ai", "AI 页面优先真正的模型能力、工程实践与产品更新。");

  expect(listNlRules(db)).toEqual([
    { scope: "global", ruleText: "暂时不展示泛营销软文。" },
    { scope: "hot", ruleText: "" },
    { scope: "articles", ruleText: "" },
    { scope: "ai", ruleText: "AI 页面优先真正的模型能力、工程实践与产品更新。" }
  ]);
});
```

- [ ] **Step 3: 跑 strategy repository 测试，确认当前 repository 还不存在**

Run: `npx vitest run tests/strategy/strategyDraftRepository.test.ts tests/strategy/nlRuleRepository.test.ts`

Expected: FAIL，提示缺少 `strategyDraftRepository.ts` 或 `nlRuleRepository.ts`

- [ ] **Step 4: 实现草稿池 repository，保持字段与 spec 对齐**

```ts
// src/core/strategy/strategyDraftRepository.ts
import type { SqliteDatabase } from "../db/openDatabase.js";

export type StrategyDraftScope = "unspecified" | "global" | "hot" | "articles" | "ai";

export function createStrategyDraft(
  db: SqliteDatabase,
  input: {
    sourceFeedbackId?: number | null;
    suggestedScope: StrategyDraftScope;
    draftText: string;
    draftEffectSummary?: string | null;
    positiveKeywords: string[];
    negativeKeywords: string[];
  }
) {
  const result = db.prepare(
    `
      INSERT INTO strategy_drafts (
        source_feedback_id,
        suggested_scope,
        draft_text,
        draft_effect_summary,
        positive_keywords_json,
        negative_keywords_json,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `
  ).run(
    input.sourceFeedbackId ?? null,
    input.suggestedScope,
    input.draftText.trim(),
    input.draftEffectSummary ?? null,
    JSON.stringify(input.positiveKeywords),
    JSON.stringify(input.negativeKeywords)
  );

  return Number(result.lastInsertRowid);
}

export function updateStrategyDraft(
  db: SqliteDatabase,
  id: number,
  input: { suggestedScope: StrategyDraftScope; draftText: string }
) {
  return db.prepare(
    `
      UPDATE strategy_drafts
      SET suggested_scope = ?,
          draft_text = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
  ).run(input.suggestedScope, input.draftText.trim(), id).changes;
}

export function listStrategyDrafts(db: SqliteDatabase) {
  const rows = db.prepare(
    `
      SELECT
        id,
        source_feedback_id AS sourceFeedbackId,
        suggested_scope AS suggestedScope,
        draft_text AS draftText,
        draft_effect_summary AS draftEffectSummary,
        positive_keywords_json AS positiveKeywordsJson,
        negative_keywords_json AS negativeKeywordsJson
      FROM strategy_drafts
      ORDER BY datetime(updated_at) DESC, id DESC
    `
  ).all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: Number(row.id),
    sourceFeedbackId: row.sourceFeedbackId ? Number(row.sourceFeedbackId) : null,
    suggestedScope: String(row.suggestedScope) as StrategyDraftScope,
    draftText: String(row.draftText),
    draftEffectSummary: typeof row.draftEffectSummary === "string" ? row.draftEffectSummary : "",
    positiveKeywords: parseKeywords(row.positiveKeywordsJson),
    negativeKeywords: parseKeywords(row.negativeKeywordsJson)
  }));
}

export function deleteStrategyDraft(db: SqliteDatabase, id: number) {
  return db.prepare("DELETE FROM strategy_drafts WHERE id = ?").run(id).changes;
}

function parseKeywords(value: unknown) {
  try {
    const parsed = JSON.parse(typeof value === "string" ? value : "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: 实现正式规则 repository，并在首次读取时补齐四个 scope 空行**

```ts
// src/core/strategy/nlRuleRepository.ts
import type { SqliteDatabase } from "../db/openDatabase.js";

const nlScopes = ["global", "hot", "articles", "ai"] as const;
export type NlRuleScope = (typeof nlScopes)[number];

export function ensureDefaultNlRules(db: SqliteDatabase): void {
  const insert = db.prepare(
    `
      INSERT INTO nl_rule_sets (scope, rule_text)
      VALUES (?, '')
      ON CONFLICT(scope) DO NOTHING
    `
  );

  const seed = db.transaction(() => {
    for (const scope of nlScopes) {
      insert.run(scope);
    }
  });

  seed();
}

export function listNlRules(db: SqliteDatabase) {
  ensureDefaultNlRules(db);
  return db.prepare("SELECT scope, rule_text AS ruleText FROM nl_rule_sets ORDER BY id ASC").all() as Array<{
    scope: NlRuleScope;
    ruleText: string;
  }>;
}

export function saveNlRule(db: SqliteDatabase, scope: NlRuleScope, ruleText: string) {
  ensureDefaultNlRules(db);
  db.prepare(
    `
      UPDATE nl_rule_sets
      SET rule_text = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE scope = ?
    `
  ).run(ruleText.trim(), scope);
}
```

- [ ] **Step 6: 回跑 strategy repository 测试并提交**

Run: `npx vitest run tests/strategy/strategyDraftRepository.test.ts tests/strategy/nlRuleRepository.test.ts`

Expected: PASS

```bash
git add src/core/strategy/strategyDraftRepository.ts src/core/strategy/nlRuleRepository.ts tests/strategy/strategyDraftRepository.test.ts tests/strategy/nlRuleRepository.test.ts
git commit -m "feat: add strategy draft and nl rule repositories"
```

### Task 4: 实现厂商设置加密与 repository

**Files:**
- Create: `src/core/llm/providerSettingsCrypto.ts`
- Create: `src/core/llm/providerSettingsRepository.ts`
- Create: `tests/llm/providerSettingsRepository.test.ts`

- [ ] **Step 1: 先写厂商设置测试，锁定“有主密钥才允许保存，读取时只暴露尾号”**

```ts
// tests/llm/providerSettingsRepository.test.ts
it("encrypts provider api key with the master key and only exposes the tail for reads", async () => {
  const db = await createTestDatabase();

  expect(
    saveLlmProviderSettings(db, {
      masterKey: "local-master-key",
      providerKind: "deepseek",
      apiKey: "deepseek-secret-key-123456"
    })
  ).toEqual({ ok: true });

  const row = db.prepare("SELECT provider_kind, encrypted_api_key, api_key_last4 FROM llm_provider_settings WHERE id = 1").get() as {
    provider_kind: string;
    encrypted_api_key: string;
    api_key_last4: string;
  };

  expect(row.provider_kind).toBe("deepseek");
  expect(row.encrypted_api_key).not.toContain("deepseek-secret-key-123456");
  expect(row.api_key_last4).toBe("3456");
  expect(getLlmProviderSettings(db, "local-master-key")).toMatchObject({
    providerKind: "deepseek",
    apiKeyLast4: "3456",
    isConfigured: true
  });
});

it("rejects saving provider settings when the master key is missing", async () => {
  const db = await createTestDatabase();

  expect(
    saveLlmProviderSettings(db, {
      masterKey: null,
      providerKind: "kimi",
      apiKey: "kimi-secret"
    })
  ).toEqual({ ok: false, reason: "missing-master-key" });
});
```

- [ ] **Step 2: 跑 provider settings 测试，确认加密与 repository 还没实现**

Run: `npx vitest run tests/llm/providerSettingsRepository.test.ts`

Expected: FAIL，提示缺少 `providerSettingsRepository.ts` 或 `providerSettingsCrypto.ts`

- [ ] **Step 3: 先实现加密 helper，使用 Node `crypto` 做对称加密**

```ts
// src/core/llm/providerSettingsCrypto.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function deriveKey(masterKey: string) {
  return createHash("sha256").update(masterKey).digest();
}

export function encryptProviderApiKey(masterKey: string, apiKey: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(masterKey), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptProviderApiKey(masterKey: string, encryptedValue: string): string {
  const raw = Buffer.from(encryptedValue, "base64");
  const iv = raw.subarray(0, 16);
  const tag = raw.subarray(16, 32);
  const body = raw.subarray(32);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(masterKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: 再实现 provider settings repository，保持单活 `id = 1` 约束**

```ts
// src/core/llm/providerSettingsRepository.ts
import type { SqliteDatabase } from "../db/openDatabase.js";
import { decryptProviderApiKey, encryptProviderApiKey } from "./providerSettingsCrypto.js";

export type LlmProviderKind = "deepseek" | "minimax" | "kimi";

export function saveLlmProviderSettings(
  db: SqliteDatabase,
  input: { masterKey: string | null; providerKind: LlmProviderKind; apiKey: string }
) {
  if (!input.masterKey) {
    return { ok: false as const, reason: "missing-master-key" as const };
  }

  const trimmedApiKey = input.apiKey.trim();
  const encryptedApiKey = encryptProviderApiKey(input.masterKey, trimmedApiKey);

  db.prepare(
    `
      INSERT INTO llm_provider_settings (
        id,
        provider_kind,
        encrypted_api_key,
        api_key_last4,
        is_enabled,
        updated_at
      )
      VALUES (1, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        provider_kind = excluded.provider_kind,
        encrypted_api_key = excluded.encrypted_api_key,
        api_key_last4 = excluded.api_key_last4,
        is_enabled = excluded.is_enabled,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(input.providerKind, encryptedApiKey, trimmedApiKey.slice(-4));

  return { ok: true as const };
}

export function getLlmProviderSettings(db: SqliteDatabase, masterKey: string | null) {
  const row = db.prepare(
    `
      SELECT provider_kind AS providerKind, encrypted_api_key AS encryptedApiKey, api_key_last4 AS apiKeyLast4, is_enabled AS isEnabled
      FROM llm_provider_settings
      WHERE id = 1
    `
  ).get() as
    | { providerKind: LlmProviderKind; encryptedApiKey: string; apiKeyLast4: string; isEnabled: number }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    providerKind: row.providerKind,
    apiKeyLast4: row.apiKeyLast4,
    isConfigured: true,
    isEnabled: row.isEnabled === 1,
    decryptedApiKey: masterKey ? decryptProviderApiKey(masterKey, row.encryptedApiKey) : null
  };
}
```

- [ ] **Step 5: 加上删除逻辑并回跑测试**

```ts
export function deleteLlmProviderSettings(db: SqliteDatabase) {
  return db.prepare("DELETE FROM llm_provider_settings WHERE id = 1").run().changes;
}
```

Run: `npx vitest run tests/llm/providerSettingsRepository.test.ts`

Expected: PASS

- [ ] **Step 6: 提交厂商设置改动**

```bash
git add src/core/llm/providerSettingsCrypto.ts src/core/llm/providerSettingsRepository.ts tests/llm/providerSettingsRepository.test.ts
git commit -m "feat: add encrypted llm provider settings"
```

### Task 5: 实现评估结果 repository 与固定分值映射

**Files:**
- Create: `src/core/strategy/nlDecision.ts`
- Create: `src/core/strategy/nlEvaluationRepository.ts`
- Create: `tests/strategy/nlEvaluationRepository.test.ts`

- [ ] **Step 1: 先写评估结果测试，锁定 `decision + strength => scoreDelta` 与结果 upsert**

```ts
// tests/strategy/nlEvaluationRepository.test.ts
import { createTestDatabase, seedContentItem } from "../helpers/testDatabase.js";

it("maps decision and strength into fixed score deltas", () => {
  expect(toScoreDelta({ decision: "boost", strengthLevel: "low" })).toBe(10);
  expect(toScoreDelta({ decision: "boost", strengthLevel: "medium" })).toBe(24);
  expect(toScoreDelta({ decision: "boost", strengthLevel: "high" })).toBe(42);
  expect(toScoreDelta({ decision: "penalize", strengthLevel: "high" })).toBe(-42);
  expect(toScoreDelta({ decision: "neutral", strengthLevel: null })).toBe(0);
  expect(toScoreDelta({ decision: "block", strengthLevel: "low" })).toBe(0);
});

it("upserts one evaluation row per content item and scope", async () => {
  const db = await createTestDatabase();
  const contentItemId = seedContentItem(db, { title: "Prompt guide", canonicalUrl: "https://example.com/prompt" });

  saveNlEvaluationResults(db, {
    providerKind: "minimax",
    rows: [
      {
        contentItemId,
        scope: "global",
        decision: "neutral",
        strengthLevel: null,
        matchedKeywords: [],
        reason: "无全局影响"
      },
      {
        contentItemId,
        scope: "ai",
        decision: "boost",
        strengthLevel: "high",
        matchedKeywords: ["AI", "模型"],
        reason: "高度匹配 AI 策略"
      }
    ]
  });

  const aiResult = readNlEvaluationByScope(db, contentItemId, "ai");
  expect(aiResult).toMatchObject({
    decision: "boost",
    strengthLevel: "high",
    scoreDelta: 42,
    providerKind: "minimax"
  });
});
```

- [ ] **Step 2: 跑评估结果测试，确认决策映射和 repository 尚未存在**

Run: `npx vitest run tests/strategy/nlEvaluationRepository.test.ts`

Expected: FAIL，提示缺少 `nlDecision.ts` 或 `nlEvaluationRepository.ts`

- [ ] **Step 3: 先实现固定映射 helper，避免后续 LLM 直接控制任意分值**

```ts
// src/core/strategy/nlDecision.ts
export type NlDecision = "boost" | "penalize" | "block" | "neutral";
export type NlStrengthLevel = "low" | "medium" | "high";

export function toScoreDelta(input: { decision: NlDecision; strengthLevel: NlStrengthLevel | null }) {
  if (input.decision === "block" || input.decision === "neutral" || !input.strengthLevel) {
    return 0;
  }

  const magnitude = input.strengthLevel === "low" ? 10 : input.strengthLevel === "medium" ? 24 : 42;
  return input.decision === "boost" ? magnitude : -magnitude;
}
```

- [ ] **Step 4: 再实现评估结果与运行状态 repository**

```ts
// src/core/strategy/nlEvaluationRepository.ts
import type { SqliteDatabase } from "../db/openDatabase.js";
import { toScoreDelta, type NlDecision, type NlStrengthLevel } from "./nlDecision.js";
import type { LlmProviderKind } from "../llm/providerSettingsRepository.js";

export function saveNlEvaluationResults(
  db: SqliteDatabase,
  input: {
    providerKind: LlmProviderKind;
    rows: Array<{
      contentItemId: number;
      scope: "global" | "hot" | "articles" | "ai";
      decision: NlDecision;
      strengthLevel: NlStrengthLevel | null;
      matchedKeywords: string[];
      reason: string;
    }>;
  }
) {
  const upsert = db.prepare(
    `
      INSERT INTO content_nl_evaluations (
        content_item_id,
        scope,
        decision,
        strength_level,
        score_delta,
        matched_keywords_json,
        reason,
        provider_kind,
        evaluated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(content_item_id, scope) DO UPDATE SET
        decision = excluded.decision,
        strength_level = excluded.strength_level,
        score_delta = excluded.score_delta,
        matched_keywords_json = excluded.matched_keywords_json,
        reason = excluded.reason,
        provider_kind = excluded.provider_kind,
        evaluated_at = CURRENT_TIMESTAMP
    `
  );

  const transaction = db.transaction(() => {
    for (const row of input.rows) {
      upsert.run(
        row.contentItemId,
        row.scope,
        row.decision,
        row.strengthLevel,
        toScoreDelta({ decision: row.decision, strengthLevel: row.strengthLevel }),
        JSON.stringify(row.matchedKeywords),
        row.reason,
        input.providerKind
      );
    }
  });

  transaction();
}
```

- [ ] **Step 5: 把评估运行表的开始/结束记录一并补上并回跑测试**

```ts
export function createNlEvaluationRun(
  db: SqliteDatabase,
  input: { runType: "full-recompute" | "incremental-after-collect"; providerKind: LlmProviderKind | null; startedAt: string }
) {
  const result = db.prepare(
    `
      INSERT INTO nl_evaluation_runs (run_type, status, provider_kind, started_at)
      VALUES (?, 'running', ?, ?)
    `
  ).run(input.runType, input.providerKind, input.startedAt);

  return Number(result.lastInsertRowid);
}

export function finishNlEvaluationRun(
  db: SqliteDatabase,
  input: { id: number; status: "success" | "partial-failure" | "failed"; finishedAt: string; itemCount: number; successCount: number; failureCount: number; notes?: string }
) {
  db.prepare(
    `
      UPDATE nl_evaluation_runs
      SET status = ?,
          finished_at = ?,
          item_count = ?,
          success_count = ?,
          failure_count = ?,
          notes = ?
      WHERE id = ?
    `
  ).run(input.status, input.finishedAt, input.itemCount, input.successCount, input.failureCount, input.notes ?? null, input.id);
}

export function readNlEvaluationByScope(
  db: SqliteDatabase,
  contentItemId: number,
  scope: "global" | "hot" | "articles" | "ai"
) {
  return db.prepare(
    `
      SELECT
        decision,
        strength_level AS strengthLevel,
        score_delta AS scoreDelta,
        provider_kind AS providerKind
      FROM content_nl_evaluations
      WHERE content_item_id = ? AND scope = ?
      LIMIT 1
    `
  ).get(contentItemId, scope) as
    | { decision: NlDecision; strengthLevel: NlStrengthLevel | null; scoreDelta: number; providerKind: LlmProviderKind }
    | undefined;
}

export function getLatestNlEvaluationRun(db: SqliteDatabase) {
  return db.prepare(
    `
      SELECT
        status,
        started_at AS startedAt,
        finished_at AS finishedAt,
        item_count AS itemCount,
        success_count AS successCount,
        failure_count AS failureCount,
        notes
      FROM nl_evaluation_runs
      ORDER BY datetime(COALESCE(finished_at, started_at)) DESC, id DESC
      LIMIT 1
    `
  ).get() as
    | {
        status: "running" | "success" | "partial-failure" | "failed";
        startedAt: string;
        finishedAt: string | null;
        itemCount: number;
        successCount: number;
        failureCount: number;
        notes: string | null;
      }
    | undefined;
}
```

Run: `npx vitest run tests/strategy/nlEvaluationRepository.test.ts`

Expected: PASS

- [ ] **Step 6: 提交评估结果基础设施**

```bash
git add src/core/strategy/nlDecision.ts src/core/strategy/nlEvaluationRepository.ts tests/strategy/nlEvaluationRepository.test.ts
git commit -m "feat: add nl evaluation repository"
```

### Task 6: 实现 LLM provider adapters 与评估执行服务

**Files:**
- Create: `src/core/llm/providers/deepseekProvider.ts`
- Create: `src/core/llm/providers/minimaxProvider.ts`
- Create: `src/core/llm/providers/kimiProvider.ts`
- Create: `src/core/llm/createLlmProvider.ts`
- Create: `src/core/strategy/runNlEvaluationCycle.ts`
- Create: `tests/strategy/runNlEvaluationCycle.test.ts`

- [ ] **Step 1: 先写评估执行服务测试，锁定“一次评估返回四个 scope，并允许 partial-failure”**

```ts
// tests/strategy/runNlEvaluationCycle.test.ts
import { createTestDatabase, seedContentItem } from "../helpers/testDatabase.js";

it("runs one provider call per content item and writes four scopes of results", async () => {
  const db = await createTestDatabase();
  const contentItemId = seedContentItem(db, {
    title: "Claude Code update",
    canonicalUrl: "https://example.com/claude-code",
    summary: "编程助手更新",
    bodyMarkdown: "介绍模型能力、工程实践与产品更新。"
  });

  const provider = {
    evaluateContent: vi.fn().mockResolvedValue({
      global: { decision: "neutral", strengthLevel: null, reason: "无全局影响", matchedKeywords: [] },
      hot: { decision: "boost", strengthLevel: "low", reason: "近期热度较高", matchedKeywords: ["更新"] },
      articles: { decision: "boost", strengthLevel: "medium", reason: "适合深读", matchedKeywords: ["实践"] },
      ai: { decision: "boost", strengthLevel: "high", reason: "高度匹配 AI 页面", matchedKeywords: ["模型"] }
    })
  };

  const result = await runNlEvaluationCycle({
    db,
    runType: "full-recompute",
    providerKind: "deepseek",
    provider,
    rules: {
      global: "暂时不展示营销软文。",
      hot: "热点页保留近 24 小时高讨论内容。",
      articles: "文章页保留深读和实践经验。",
      ai: "AI 页优先模型、工程实践和产品更新。"
    }
  });

  expect(result).toMatchObject({ itemCount: 1, successCount: 1, failureCount: 0, status: "success" });
  expect(provider.evaluateContent).toHaveBeenCalledTimes(1);
  expect(readNlEvaluationByScope(db, contentItemId, "ai")?.scoreDelta).toBe(42);
});
```

- [ ] **Step 2: 再写无 provider 和部分失败测试，锁定降级行为**

```ts
it("skips execution when no provider config is available", async () => {
  const db = await createTestDatabase();

  const result = await runNlEvaluationCycle({
    db,
    runType: "full-recompute",
    providerKind: null,
    provider: null,
    rules: { global: "", hot: "", articles: "", ai: "" }
  });

  expect(result).toMatchObject({ itemCount: 0, successCount: 0, failureCount: 0, status: "failed" });
  expect(result.notes).toContain("provider-unavailable");
});
```

```ts
it("marks the run as partial-failure when one content item fails", async () => {
  const db = await createTestDatabase();
  seedContentItem(db, { title: "One", canonicalUrl: "https://example.com/one" });
  seedContentItem(db, { title: "Two", canonicalUrl: "https://example.com/two" });
  const provider = {
    evaluateContent: vi
      .fn()
      .mockResolvedValueOnce({
        global: { decision: "neutral", strengthLevel: null, reason: "", matchedKeywords: [] },
        hot: { decision: "neutral", strengthLevel: null, reason: "", matchedKeywords: [] },
        articles: { decision: "neutral", strengthLevel: null, reason: "", matchedKeywords: [] },
        ai: { decision: "neutral", strengthLevel: null, reason: "", matchedKeywords: [] }
      })
      .mockRejectedValueOnce(new Error("provider timeout"))
  };

  const result = await runNlEvaluationCycle({
    db,
    runType: "full-recompute",
    providerKind: "kimi",
    provider,
    rules: { global: "", hot: "", articles: "", ai: "" }
  });

  expect(result).toMatchObject({ itemCount: 2, successCount: 1, failureCount: 1, status: "partial-failure" });
});
```

- [ ] **Step 3: 跑评估执行测试，确认服务与 provider 工厂还不存在**

Run: `npx vitest run tests/strategy/runNlEvaluationCycle.test.ts`

Expected: FAIL，提示缺少 `runNlEvaluationCycle.ts`、`createLlmProvider.ts` 或 provider adapter

- [ ] **Step 4: 先定义统一 provider 接口与三家 adapter 的结构化 JSON 协议**

```ts
// src/core/llm/createLlmProvider.ts
import { createDeepSeekProvider } from "./providers/deepseekProvider.js";
import { createMiniMaxProvider } from "./providers/minimaxProvider.js";
import { createKimiProvider } from "./providers/kimiProvider.js";
import type { LlmProviderKind } from "./providerSettingsRepository.js";

export type NlProvider = {
  evaluateContent(input: {
    title: string;
    summary: string;
    bodyMarkdown: string;
    sourceName: string;
    publishedAt: string | null;
    rules: Record<"global" | "hot" | "articles" | "ai", string>;
  }): Promise<Record<"global" | "hot" | "articles" | "ai", {
    decision: "boost" | "penalize" | "block" | "neutral";
    strengthLevel: "low" | "medium" | "high" | null;
    reason: string;
    matchedKeywords: string[];
  }>>;
};

export function createLlmProvider(input: { providerKind: LlmProviderKind; apiKey: string }): NlProvider {
  if (input.providerKind === "deepseek") {
    return createDeepSeekProvider(input.apiKey);
  }

  if (input.providerKind === "minimax") {
    return createMiniMaxProvider(input.apiKey);
  }

  return createKimiProvider(input.apiKey);
}
```

```ts
// src/core/llm/providers/deepseekProvider.ts
const systemPrompt = `
你是 HotNow 的自然语言筛选判断器。
只返回 JSON。
每次必须输出 global、hot、articles、ai 四个 scope。
decision 只能是 boost、penalize、block、neutral。
strengthLevel 只能是 low、medium、high 或 null。
matchedKeywords 必须是字符串数组。
`;

export function createDeepSeekProvider(apiKey: string) {
  return {
    async evaluateContent(input: {
      title: string;
      summary: string;
      bodyMarkdown: string;
      sourceName: string;
      publishedAt: string | null;
      rules: Record<"global" | "hot" | "articles" | "ai", string>;
    }) {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          response_format: { type: "json_object" },
          messages: buildNlMessages(input)
        })
      });

      return parseProviderJson(await response.json());
    }
  };
}

function buildNlMessages(input: {
  title: string;
  summary: string;
  bodyMarkdown: string;
  sourceName: string;
  publishedAt: string | null;
  rules: Record<"global" | "hot" | "articles" | "ai", string>;
}) {
  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: JSON.stringify(input)
    }
  ];
}

function parseProviderJson(payload: Record<string, unknown>) {
  const content = payload.choices?.[0]?.message?.content;
  const parsed = JSON.parse(typeof content === "string" ? content : "{}");
  return parsed as Record<"global" | "hot" | "articles" | "ai", {
    decision: "boost" | "penalize" | "block" | "neutral";
    strengthLevel: "low" | "medium" | "high" | null;
    reason: string;
    matchedKeywords: string[];
  }>;
}
```

```ts
// src/core/llm/providers/minimaxProvider.ts
export function createMiniMaxProvider(apiKey: string) {
  return createOpenAiCompatibleProvider("https://api.minimax.chat/v1/text/chatcompletion_v2", "MiniMax-Text-01", apiKey);
}

// src/core/llm/providers/kimiProvider.ts
export function createKimiProvider(apiKey: string) {
  return createOpenAiCompatibleProvider("https://api.moonshot.cn/v1/chat/completions", "moonshot-v1-8k", apiKey);
}
```

```ts
// src/core/llm/providers/shared.ts
export function createOpenAiCompatibleProvider(endpoint: string, model: string, apiKey: string) {
  return {
    async evaluateContent(input: {
      title: string;
      summary: string;
      bodyMarkdown: string;
      sourceName: string;
      publishedAt: string | null;
      rules: Record<"global" | "hot" | "articles" | "ai", string>;
    }) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: buildNlMessages(input)
        })
      });

      return parseProviderJson(await response.json());
    }
  };
}

function buildNlMessages(input: {
  title: string;
  summary: string;
  bodyMarkdown: string;
  sourceName: string;
  publishedAt: string | null;
  rules: Record<"global" | "hot" | "articles" | "ai", string>;
}) {
  return [
    {
      role: "system",
      content:
        "你是 HotNow 的自然语言筛选判断器。只返回 JSON。每次必须输出 global、hot、articles、ai 四个 scope。decision 只能是 boost、penalize、block、neutral。strengthLevel 只能是 low、medium、high 或 null。matchedKeywords 必须是字符串数组。"
    },
    {
      role: "user",
      content: JSON.stringify(input)
    }
  ];
}

function parseProviderJson(payload: Record<string, unknown>) {
  const content = payload.choices?.[0]?.message?.content;
  const parsed = JSON.parse(typeof content === "string" ? content : "{}");
  return parsed as Record<"global" | "hot" | "articles" | "ai", {
    decision: "boost" | "penalize" | "block" | "neutral";
    strengthLevel: "low" | "medium" | "high" | null;
    reason: string;
    matchedKeywords: string[];
  }>;
}
```

- [ ] **Step 5: 再实现评估执行服务，复用运行表与结果 upsert**

```ts
// src/core/strategy/runNlEvaluationCycle.ts
import type { SqliteDatabase } from "../db/openDatabase.js";
import { createNlEvaluationRun, finishNlEvaluationRun, saveNlEvaluationResults } from "./nlEvaluationRepository.js";

export async function runNlEvaluationCycle(input: {
  db: SqliteDatabase;
  runType: "full-recompute" | "incremental-after-collect";
  providerKind: "deepseek" | "minimax" | "kimi" | null;
  provider: { evaluateContent: (payload: Record<string, unknown>) => Promise<Record<string, unknown>> } | null;
  rules: Record<"global" | "hot" | "articles" | "ai", string>;
  contentItemIds?: number[];
}) {
  if (!input.providerKind || !input.provider) {
    return { itemCount: 0, successCount: 0, failureCount: 0, status: "failed" as const, notes: "provider-unavailable" };
  }

  const runId = createNlEvaluationRun(input.db, {
    runType: input.runType,
    providerKind: input.providerKind,
    startedAt: new Date().toISOString()
  });

  const rows = pickEvaluationRows(input.db, input.contentItemIds);
  let successCount = 0;
  let failureCount = 0;
  const failures: string[] = [];

  for (const row of rows) {
    try {
      const result = await input.provider.evaluateContent({
        title: row.title,
        summary: row.summary ?? "",
        bodyMarkdown: row.bodyMarkdown ?? "",
        sourceName: row.sourceName,
        publishedAt: row.publishedAt,
        rules: input.rules
      });

      saveNlEvaluationResults(input.db, {
        providerKind: input.providerKind,
        rows: (["global", "hot", "articles", "ai"] as const).map((scope) => ({
          contentItemId: row.id,
          scope,
          decision: result[scope].decision,
          strengthLevel: result[scope].strengthLevel,
          matchedKeywords: result[scope].matchedKeywords,
          reason: result[scope].reason
        }))
      });

      successCount += 1;
    } catch (error) {
      failureCount += 1;
      failures.push(`${row.id}:${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  const status = failureCount === 0 ? "success" : successCount === 0 ? "failed" : "partial-failure";
  finishNlEvaluationRun(input.db, {
    id: runId,
    status,
    finishedAt: new Date().toISOString(),
    itemCount: rows.length,
    successCount,
    failureCount,
    notes: failures.join("; ")
  });

  return { itemCount: rows.length, successCount, failureCount, status, notes: failures.join("; ") };
}

function pickEvaluationRows(db: SqliteDatabase, contentItemIds?: number[]) {
  if (contentItemIds && contentItemIds.length > 0) {
    const placeholders = contentItemIds.map(() => "?").join(", ");
    return db.prepare(
      `
        SELECT
          ci.id,
          ci.title,
          ci.summary,
          ci.body_markdown AS bodyMarkdown,
          ci.published_at AS publishedAt,
          cs.name AS sourceName
        FROM content_items ci
        JOIN content_sources cs ON cs.id = ci.source_id
        WHERE ci.id IN (${placeholders})
        ORDER BY ci.id ASC
      `
    ).all(...contentItemIds) as Array<{
      id: number;
      title: string;
      summary: string | null;
      bodyMarkdown: string | null;
      publishedAt: string | null;
      sourceName: string;
    }>;
  }

  return db.prepare(
    `
      SELECT
        ci.id,
        ci.title,
        ci.summary,
        ci.body_markdown AS bodyMarkdown,
        ci.published_at AS publishedAt,
        cs.name AS sourceName
      FROM content_items ci
      JOIN content_sources cs ON cs.id = ci.source_id
      ORDER BY ci.id ASC
    `
  ).all() as Array<{
    id: number;
    title: string;
    summary: string | null;
    bodyMarkdown: string | null;
    publishedAt: string | null;
    sourceName: string;
  }>;
}
```

- [ ] **Step 6: 回跑评估执行测试并提交**

Run: `npx vitest run tests/strategy/runNlEvaluationCycle.test.ts`

Expected: PASS

```bash
git add src/core/llm/providers/deepseekProvider.ts src/core/llm/providers/minimaxProvider.ts src/core/llm/providers/kimiProvider.ts src/core/llm/createLlmProvider.ts src/core/strategy/runNlEvaluationCycle.ts tests/strategy/runNlEvaluationCycle.test.ts
git commit -m "feat: add nl evaluation cycle service"
```

### Task 7: 把自然语言结果接进内容读取与采集链路

**Files:**
- Modify: `src/core/content/listContentView.ts`
- Modify: `src/core/pipeline/runCollectionCycle.ts`
- Modify: `tests/content/listContentView.test.ts`
- Modify: `tests/pipeline/runCollectionCycle.test.ts`

- [ ] **Step 1: 先补内容视图测试，锁定 `block` 过滤与 score delta 叠加**

```ts
// tests/content/listContentView.test.ts
it("filters blocked items and adds global plus scope deltas to ranking", async () => {
  const db = await createTestDatabase();
  const source = resolveSourceByKind(db, "openai");

  upsertContentItems(db, {
    sourceId: source!.id,
    items: [
      {
        title: "Should disappear",
        canonicalUrl: "https://example.com/blocked",
        summary: "blocked summary",
        bodyMarkdown: "blocked body",
        publishedAt: "2026-03-29T10:00:00.000Z"
      },
      {
        title: "Should rise",
        canonicalUrl: "https://example.com/rising",
        summary: "rising summary",
        bodyMarkdown: "rising body",
        publishedAt: "2026-03-29T09:00:00.000Z"
      }
    ]
  });

  const blockedId = findContentIdByTitle(db, "Should disappear");
  const risingId = findContentIdByTitle(db, "Should rise");

  saveNlEvaluationResults(db, {
    providerKind: "deepseek",
    rows: [
      { contentItemId: blockedId, scope: "global", decision: "block", strengthLevel: "high", matchedKeywords: [], reason: "全局屏蔽" },
      { contentItemId: risingId, scope: "global", decision: "boost", strengthLevel: "medium", matchedKeywords: ["AI"], reason: "全局加分" },
      { contentItemId: risingId, scope: "hot", decision: "boost", strengthLevel: "low", matchedKeywords: ["热点"], reason: "热点加分" }
    ]
  });

  const hotCards = listContentView(db, "hot");
  expect(hotCards.some((card) => card.id === blockedId)).toBe(false);
  expect(hotCards[0]?.id).toBe(risingId);
});
```

- [ ] **Step 2: 再补采集链路测试，锁定 collection-only 成功后触发增量评估**

```ts
// tests/pipeline/runCollectionCycle.test.ts
it("triggers incremental nl evaluation after persisting collected content", async () => {
  const runIncrementalNlEvaluation = vi.fn().mockResolvedValue({ status: "success", itemCount: 2 });

  await runCollectionCycle(config, "manual", {
    db,
    loadEnabledSourceIssues: async () => loadedIssues,
    fetchArticle: async () => ({ ok: true, text: "body", title: "AI Update", url: "https://example.com" }),
    runIncrementalNlEvaluation
  });

  expect(runIncrementalNlEvaluation).toHaveBeenCalledWith(expect.objectContaining({
    runType: "incremental-after-collect"
  }));
});
```

- [ ] **Step 3: 跑读取与采集测试，确认当前 list/pipeline 还没消费评估结果**

Run: `npx vitest run tests/content/listContentView.test.ts tests/pipeline/runCollectionCycle.test.ts`

Expected: FAIL，提示 `block` 仍未过滤，或 `runCollectionCycle` 不接受 `runIncrementalNlEvaluation`

- [ ] **Step 4: 在内容读取层叠加 `global + view scope` 评估结果，并优先处理 block**

```ts
// src/core/content/listContentView.ts
type ContentCardRow = {
  id: number;
  title: string;
  summary: string | null;
  bodyMarkdown: string | null;
  sourceName: string;
  sourceKind: string;
  canonicalUrl: string;
  publishedAt: string | null;
  favoriteValue: string | null;
  reactionValue: string | null;
  rankingTimestamp: string | null;
  globalDecision: string | null;
  globalScoreDelta: number | null;
  scopeDecision: string | null;
  scopeScoreDelta: number | null;
};

const contentSelectSql = `
  WITH latest_favorite AS (
    SELECT content_item_id, feedback_value
    FROM (
      SELECT
        content_item_id,
        feedback_value,
        ROW_NUMBER() OVER (
          PARTITION BY content_item_id
          ORDER BY datetime(created_at) DESC, id DESC
        ) AS row_num
      FROM content_feedback
      WHERE feedback_kind = 'favorite'
    ) ranked_favorite
    WHERE ranked_favorite.row_num = 1
  ),
  latest_reaction AS (
    SELECT content_item_id, feedback_value
    FROM (
      SELECT
        content_item_id,
        feedback_value,
        ROW_NUMBER() OVER (
          PARTITION BY content_item_id
          ORDER BY datetime(created_at) DESC, id DESC
        ) AS row_num
      FROM content_feedback
      WHERE feedback_kind = 'reaction'
    ) ranked_reaction
    WHERE ranked_reaction.row_num = 1
  ),
  global_eval AS (
    SELECT content_item_id, decision, score_delta
    FROM content_nl_evaluations
    WHERE scope = 'global'
  ),
  scope_eval AS (
    SELECT content_item_id, scope, decision, score_delta
    FROM content_nl_evaluations
  )
  SELECT
    ci.id AS id,
    ci.title AS title,
    ci.summary AS summary,
    ci.body_markdown AS bodyMarkdown,
    cs.name AS sourceName,
    cs.kind AS sourceKind,
    ci.canonical_url AS canonicalUrl,
    ci.published_at AS publishedAt,
    latest_favorite.feedback_value AS favoriteValue,
    latest_reaction.feedback_value AS reactionValue,
    COALESCE(ci.published_at, ci.fetched_at, ci.created_at) AS rankingTimestamp,
    global_eval.decision AS globalDecision,
    global_eval.score_delta AS globalScoreDelta,
    scoped.decision AS scopeDecision,
    scoped.score_delta AS scopeScoreDelta
  FROM content_items ci
  JOIN content_sources cs ON cs.id = ci.source_id
  LEFT JOIN latest_favorite ON latest_favorite.content_item_id = ci.id
  LEFT JOIN latest_reaction ON latest_reaction.content_item_id = ci.id
  LEFT JOIN global_eval ON global_eval.content_item_id = ci.id
  LEFT JOIN scope_eval scoped ON scoped.content_item_id = ci.id AND scoped.scope = @viewKey
  ORDER BY datetime(COALESCE(ci.published_at, ci.fetched_at, ci.created_at)) DESC, ci.id DESC
`;

const rows = db.prepare(contentSelectSql).all({ viewKey }) as ContentCardRow[];

return rows
  .filter((row) => row.globalDecision !== "block" && row.scopeDecision !== "block")
  .map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary?.trim() || "暂无摘要",
    sourceName: row.sourceName,
    canonicalUrl: row.canonicalUrl,
    publishedAt: row.publishedAt,
    isFavorited: row.favoriteValue === "1",
    reaction: normalizeReaction(row.reactionValue),
    contentScore: score.contentScore,
    scoreBadges: score.badges,
    rankingScore:
      calculateViewRankingScore(viewKey, viewRuleConfig, score, row.sourceKind, row.rankingTimestamp, referenceTime) +
      (row.globalScoreDelta ?? 0) +
      (row.scopeScoreDelta ?? 0)
  }))
```

- [ ] **Step 5: 在采集链路里挂上可选增量评估依赖，但保证无 provider 时不打断主流程**

```ts
// src/core/pipeline/runCollectionCycle.ts
export type RunCollectionCycleDeps = {
  db?: SqliteDatabase;
  loadEnabledSourceIssues?: () => Promise<LoadedSourceIssues>;
  fetchArticle?: (url: string) => Promise<ArticleResult>;
  runIncrementalNlEvaluation?: (input: { changedCanonicalUrls: string[]; runType: "incremental-after-collect" }) => Promise<unknown>;
};

if (deps.runIncrementalNlEvaluation) {
  await deps.runIncrementalNlEvaluation({
    changedCanonicalUrls: enrichedItems.map((item) => item.sourceUrl),
    runType: "incremental-after-collect"
  });
}
```

- [ ] **Step 6: 回跑读取与采集测试并提交**

Run: `npx vitest run tests/content/listContentView.test.ts tests/pipeline/runCollectionCycle.test.ts`

Expected: PASS

```bash
git add src/core/content/listContentView.ts src/core/pipeline/runCollectionCycle.ts tests/content/listContentView.test.ts tests/pipeline/runCollectionCycle.test.ts
git commit -m "feat: apply nl evaluation results to content views"
```

### Task 8: 扩展系统工作台 SSR 与 Fastify 路由

**Files:**
- Modify: `src/server/renderSystemPages.ts`
- Modify: `src/server/createServer.ts`
- Modify: `tests/server/systemRoutes.test.ts`

- [ ] **Step 1: 先补系统页结构测试，锁定工作台五个区块**

```ts
// tests/server/systemRoutes.test.ts
it("renders the strategy workbench with llm settings, nl rules, feedback pool, and drafts", async () => {
  const app = createServer({
    listViewRules: vi.fn().mockResolvedValue([
      {
        ruleKey: "hot",
        displayName: "热点策略",
        config: {
          limit: 20,
          freshnessWindowDays: 3,
          freshnessWeight: 0.35,
          sourceWeight: 0.1,
          completenessWeight: 0.1,
          aiWeight: 0.05,
          heatWeight: 0.4
        },
        isEnabled: true
      }
    ]),
    listFeedbackPoolEntries: vi.fn().mockResolvedValue([
      {
        id: 1,
        title: "AI 编程工具合集",
        sourceName: "OpenAI",
        canonicalUrl: "https://example.com/dev-tools",
        reactionSnapshot: "like",
        freeText: "文章页值得加分",
        suggestedEffect: "boost",
        strengthLevel: "medium",
        positiveKeywords: ["AI 编程"],
        negativeKeywords: [],
        updatedAt: "2026-03-31T09:00:00.000Z"
      }
    ]),
    listStrategyDrafts: vi.fn().mockResolvedValue([
      {
        id: 1,
        suggestedScope: "articles",
        draftText: "文章页优先 AI 编程工具合集。",
        draftEffectSummary: "boost:medium",
        positiveKeywords: ["AI 编程"],
        negativeKeywords: []
      }
    ]),
    listNlRules: vi.fn().mockResolvedValue([
      { scope: "global", ruleText: "暂时不展示营销软文。" },
      { scope: "hot", ruleText: "" },
      { scope: "articles", ruleText: "文章页优先深读和实践。" },
      { scope: "ai", ruleText: "AI 页优先模型、工程实践和产品更新。" }
    ]),
    getLlmProviderSettings: vi.fn().mockResolvedValue({
      providerKind: "deepseek",
      apiKeyLast4: "3456",
      isConfigured: true,
      isEnabled: true
    }),
    getLatestNlEvaluationRun: vi.fn().mockResolvedValue({
      status: "partial-failure",
      startedAt: "2026-03-31T09:30:00.000Z",
      finishedAt: "2026-03-31T09:32:00.000Z"
    })
  } as never);

  const response = await app.inject({ method: "GET", url: "/settings/view-rules" });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain('data-system-section="view-rules"');
  expect(response.body).toContain("LLM 设置");
  expect(response.body).toContain("正式自然语言策略");
  expect(response.body).toContain("反馈池");
  expect(response.body).toContain("草稿池");
  expect(response.body).toContain("已配置");
  expect(response.body).toContain("3456");
});
```

- [ ] **Step 2: 再补系统 action 路由测试，锁定反馈、草稿、厂商设置和正式规则保存**

```ts
it("calls feedback, draft, provider, and nl rule handlers for system workbench actions", async () => {
  const saveFeedbackEntry = vi.fn().mockResolvedValue({ ok: true });
  const promoteFeedbackToDraft = vi.fn().mockResolvedValue({ ok: true, draftId: 8 });
  const saveStrategyDraft = vi.fn().mockResolvedValue({ ok: true });
  const saveLlmProviderSettings = vi.fn().mockResolvedValue({ ok: true });
  const saveNlRule = vi.fn().mockResolvedValue({ ok: true, queuedRecompute: true });
  const app = createServer({
    saveFeedbackEntry,
    promoteFeedbackToDraft,
    saveStrategyDraft,
    saveLlmProviderSettings,
    saveNlRule
  } as never);

  await app.inject({
    method: "POST",
    url: "/actions/content/42/feedback-entry",
    payload: {
      reactionSnapshot: "like",
      freeText: "文章页值得加分",
      suggestedEffect: "boost",
      strengthLevel: "medium",
      positiveKeywords: ["AI 编程"],
      negativeKeywords: []
    }
  });

  await app.inject({ method: "POST", url: "/actions/feedback-pool/1/promote-draft", payload: { suggestedScope: "articles" } });
  await app.inject({ method: "POST", url: "/actions/strategy-drafts", payload: { suggestedScope: "articles", draftText: "文章页优先 AI 编程工具合集。" } });
  await app.inject({ method: "POST", url: "/actions/llm-provider", payload: { providerKind: "deepseek", apiKey: "abc123456" } });
  await app.inject({ method: "POST", url: "/actions/nl-rules/global", payload: { ruleText: "暂时不展示营销软文。" } });

  expect(saveFeedbackEntry).toHaveBeenCalledWith(42, expect.objectContaining({ reactionSnapshot: "like" }));
  expect(promoteFeedbackToDraft).toHaveBeenCalledWith(1, expect.objectContaining({ suggestedScope: "articles" }));
  expect(saveStrategyDraft).toHaveBeenCalled();
  expect(saveLlmProviderSettings).toHaveBeenCalledWith(expect.objectContaining({ providerKind: "deepseek" }));
  expect(saveNlRule).toHaveBeenCalledWith("global", "暂时不展示营销软文。");
});
```

- [ ] **Step 3: 跑系统页测试，确认当前 SSR 和路由依赖还没有这些能力**

Run: `npx vitest run tests/server/systemRoutes.test.ts`

Expected: FAIL，提示缺少新增依赖、路由或 HTML 结构

- [ ] **Step 4: 扩展 `createServer` 依赖与 action 路由，并对 payload 做显式校验**

```ts
// src/server/createServer.ts
type ServerDeps = {
  listFeedbackPoolEntries?: () => Promise<Array<Record<string, unknown>>> | Array<Record<string, unknown>>;
  saveFeedbackEntry?: (
    contentItemId: number,
    input: {
      reactionSnapshot: ReactionValue;
      freeText?: string;
      suggestedEffect?: string;
      strengthLevel?: string;
      positiveKeywords: string[];
      negativeKeywords: string[];
    }
  ) => Promise<{ ok: boolean; reason?: string }> | { ok: boolean; reason?: string };
  deleteFeedbackPoolEntry?: (id: number) => Promise<{ ok: boolean }> | { ok: boolean };
  clearFeedbackPool?: () => Promise<{ cleared: number }> | { cleared: number };
  promoteFeedbackToDraft?: (id: number, input: { suggestedScope: string }) => Promise<{ ok: true; draftId: number } | { ok: false; reason: string }>;
  listStrategyDrafts?: () => Promise<Array<Record<string, unknown>>> | Array<Record<string, unknown>>;
  saveStrategyDraft?: (
    input: { id?: number; suggestedScope: string; draftText: string; draftEffectSummary?: string; positiveKeywords?: string[]; negativeKeywords?: string[] }
  ) => Promise<{ ok: true; id: number } | { ok: false; reason: string }>;
  deleteStrategyDraft?: (id: number) => Promise<{ ok: boolean }> | { ok: boolean };
  listNlRules?: () => Promise<Array<{ scope: string; ruleText: string }>>;
  saveNlRule?: (scope: string, ruleText: string) => Promise<{ ok: true; queuedRecompute: boolean } | { ok: false; reason: string }>;
  getLlmProviderSettings?: () => Promise<Record<string, unknown> | null> | Record<string, unknown> | null;
  saveLlmProviderSettings?: (input: { providerKind: string; apiKey: string }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  deleteLlmProviderSettings?: () => Promise<{ ok: true }> | { ok: true };
  getLatestNlEvaluationRun?: () => Promise<Record<string, unknown> | null> | Record<string, unknown> | null;
};

app.post("/actions/content/:id/feedback-entry", async (request, reply) => {
  if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
    return;
  }

  if (!deps.saveFeedbackEntry) {
    return reply.code(503).send({ ok: false, reason: "feedback-pool-disabled" });
  }

  const contentItemId = parseContentItemId(request.params);
  const body = request.body as {
    reactionSnapshot?: unknown;
    freeText?: unknown;
    suggestedEffect?: unknown;
    strengthLevel?: unknown;
    positiveKeywords?: unknown;
    negativeKeywords?: unknown;
  };

  if (!contentItemId || !isReactionValue(body.reactionSnapshot)) {
    return reply.code(400).send({ ok: false, reason: "invalid-feedback-payload" });
  }

  const result = await deps.saveFeedbackEntry(contentItemId, normalizeFeedbackEntryPayload(body));
  return !result.ok && result.reason === "not-found"
    ? reply.code(404).send({ ok: false, reason: "not-found" })
    : reply.send({ ok: true, contentItemId });
});

function normalizeFeedbackEntryPayload(body: {
  reactionSnapshot?: unknown;
  freeText?: unknown;
  suggestedEffect?: unknown;
  strengthLevel?: unknown;
  positiveKeywords?: unknown;
  negativeKeywords?: unknown;
}) {
  return {
    reactionSnapshot: body.reactionSnapshot as ReactionValue,
    freeText: typeof body.freeText === "string" ? body.freeText.trim() : "",
    suggestedEffect: typeof body.suggestedEffect === "string" ? body.suggestedEffect.trim() : "",
    strengthLevel: typeof body.strengthLevel === "string" ? body.strengthLevel.trim() : "",
    positiveKeywords: Array.isArray(body.positiveKeywords) ? body.positiveKeywords.filter((item): item is string => typeof item === "string") : [],
    negativeKeywords: Array.isArray(body.negativeKeywords) ? body.negativeKeywords.filter((item): item is string => typeof item === "string") : []
  };
}
```

- [ ] **Step 5: 把 `/settings/view-rules` 的渲染参数扩成完整工作台模型**

```ts
// src/server/renderSystemPages.ts
export function renderViewRulesPage(input: {
  rules: ViewRuleItem[];
  nlRules: Array<{ scope: string; ruleText: string }>;
  feedbackEntries: FeedbackPoolEntryView[];
  strategyDrafts: StrategyDraftView[];
  llmProvider: LlmProviderSettingsView | null;
  latestEvaluationRun: NlEvaluationRunView | null;
  hasLlmMasterKey: boolean;
}): string {
  return `
    <section class="content-intro content-intro--system">
      <p class="content-kicker">系统菜单</p>
      <p class="content-description">筛选策略：管理数值权重、自然语言规则、反馈池和 LLM 设置。</p>
    </section>
    <section class="system-section system-section--workbench" data-system-section="view-rules">
      ${renderNumericRuleWorkbench(input.rules)}
      ${renderLlmSettingsPanel(input.llmProvider, input.latestEvaluationRun, input.hasLlmMasterKey)}
      ${renderNlRuleEditors(input.nlRules)}
      ${renderFeedbackPoolPanel(input.feedbackEntries)}
      ${renderStrategyDraftsPanel(input.strategyDrafts)}
    </section>
  `;
}
```

- [ ] **Step 6: 回跑系统页测试并提交**

Run: `npx vitest run tests/server/systemRoutes.test.ts`

Expected: PASS

```bash
git add src/server/renderSystemPages.ts src/server/createServer.ts tests/server/systemRoutes.test.ts
git commit -m "feat: add strategy workbench routes and rendering"
```

### Task 9: 在内容卡片和 `site.js` 中落地反馈面板与工作台交互

**Files:**
- Modify: `src/server/renderContentPages.ts`
- Modify: `src/server/public/site.js`
- Modify: `tests/server/contentRoutes.test.ts`
- Modify: `tests/server/siteThemeClient.test.ts`

- [ ] **Step 1: 先补内容卡片 SSR 测试，锁定 `补充反馈` 按钮和局部反馈面板骨架**

```ts
// tests/server/contentRoutes.test.ts
it("renders a local feedback panel beside like and dislike actions", async () => {
  const app = createServer({
    listContentView: vi.fn().mockResolvedValue([
      {
        id: 101,
        title: "AI Weekly Insight",
        summary: "Roundup of recent AI and product updates.",
        sourceName: "Juya AI Daily",
        canonicalUrl: "https://example.com/ai-weekly",
        publishedAt: "2026-03-28T10:00:00.000Z",
        isFavorited: false,
        reaction: "none",
        contentScore: 91,
        scoreBadges: ["24h 内", "官方源", "正文完整"]
      }
    ])
  } as never);

  const response = await app.inject({ method: "GET", url: "/" });

  expect(response.body).toContain('data-content-action="open-feedback-panel"');
  expect(response.body).toContain('class="content-feedback-panel"');
  expect(response.body).toContain('name="feedbackFreeText"');
  expect(response.body).toContain('name="suggestedEffect"');
  expect(response.body).toContain('name="strengthLevel"');
  expect(response.body).toContain('name="positiveKeywords"');
  expect(response.body).toContain('name="negativeKeywords"');
});
```

- [ ] **Step 2: 再补 `site.js` 客户端测试，锁定自动展开、提交和确认框**

```ts
// tests/server/siteThemeClient.test.ts
it("opens the local feedback panel after reaction clicks and submits feedback entries", async () => {
  const dom = new JSDOM(
    `<!doctype html>
    <html data-theme="dark">
      <body>
        <article data-content-id="42">
          <button type="button" data-content-action="reaction" data-reaction="like" aria-pressed="false">点赞</button>
          <button type="button" data-content-action="reaction" data-reaction="dislike" aria-pressed="false">点踩</button>
          <button type="button" data-content-action="open-feedback-panel">补充反馈</button>
          <form class="content-feedback-panel" data-content-feedback-form hidden>
            <textarea name="feedbackFreeText"></textarea>
            <select name="suggestedEffect"><option value="boost">加分</option></select>
            <select name="strengthLevel"><option value="medium">medium</option></select>
            <input name="positiveKeywords" />
            <input name="negativeKeywords" />
            <button type="submit">保存反馈</button>
          </form>
        </article>
      </body>
    </html>`,
    { url: "https://example.test/", runScripts: "outside-only" }
  );

  const { window } = dom;
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

  window.fetch = fetchMock as typeof window.fetch;
  window.eval(siteScript);

  const likeButton = window.document.querySelector('[data-reaction="like"]');
  const form = window.document.querySelector("[data-content-feedback-form]") as HTMLFormElement;
  likeButton?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

  expect(form.hidden).toBe(false);

  (form.querySelector('textarea[name="feedbackFreeText"]') as HTMLTextAreaElement).value = "文章页值得加分";
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "/actions/content/42/reaction",
    expect.objectContaining({ method: "POST" })
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "/actions/content/42/feedback-entry",
    expect.objectContaining({ method: "POST" })
  );
});
```

- [ ] **Step 3: 跑内容 SSR 与客户端测试，确认反馈面板相关 DOM 和 JS 还不存在**

Run: `npx vitest run tests/server/contentRoutes.test.ts tests/server/siteThemeClient.test.ts`

Expected: FAIL，提示缺少 `open-feedback-panel`、反馈表单字段或提交逻辑

- [ ] **Step 4: 在内容卡片模板里加局部反馈面板骨架，但不改变现有收藏/点赞/点踩按钮语义**

```ts
// src/server/renderContentPages.ts
function renderContentBody(card: ContentCardView, summaryText: string, variant: ContentCardVariant): string {
  return `
    <div class="content-card-body content-card-body--${variant}">
      <div class="content-summary-shell">
        <p class="content-summary">${escapeHtml(summaryText)}</p>
      </div>
      ${renderScoreBadges(card.scoreBadges)}
      <div class="content-card-region content-card-region--actions">
        <div class="content-actions">
          <button type="button" class="action-chip" data-content-action="favorite" data-favorited="${card.isFavorited ? "true" : "false"}" aria-pressed="${card.isFavorited ? "true" : "false"}">${card.isFavorited ? "已收藏" : "收藏"}</button>
          <button type="button" class="action-chip" data-content-action="reaction" data-reaction="like" aria-pressed="${card.reaction === "like" ? "true" : "false"}">点赞</button>
          <button type="button" class="action-chip" data-content-action="reaction" data-reaction="dislike" aria-pressed="${card.reaction === "dislike" ? "true" : "false"}">点踩</button>
          <button type="button" class="action-chip action-chip--secondary" data-content-action="open-feedback-panel">补充反馈</button>
        </div>
        <form class="content-feedback-panel" data-content-feedback-form hidden>
          <label><span>反馈说明</span><textarea name="feedbackFreeText" rows="3"></textarea></label>
          <label><span>建议动作</span><select name="suggestedEffect"><option value="">未设置</option><option value="boost">加分</option><option value="penalize">减分</option><option value="block">屏蔽</option><option value="neutral">无影响</option></select></label>
          <label><span>强度</span><select name="strengthLevel"><option value="">未设置</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
          <label><span>关键词加分</span><input type="text" name="positiveKeywords" /></label>
          <label><span>关键词减分</span><input type="text" name="negativeKeywords" /></label>
          <div class="content-feedback-actions">
            <button type="submit" class="primary-mini-button">保存反馈</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
```

- [ ] **Step 5: 在 `site.js` 中接入反馈面板、工作台复制与确认框动作**

```ts
// src/server/public/site.js
if (action === "reaction") {
  event.preventDefault();
  await handleReaction(card, button, contentId);
  openFeedbackPanel(card);
  closeMobileSystemDrawer();
  return;
}

if (action === "open-feedback-panel") {
  event.preventDefault();
  openFeedbackPanel(card);
  closeMobileSystemDrawer();
  return;
}

root.addEventListener("submit", async (event) => {
  const target = event.target;

  if (target instanceof HTMLFormElement && target.hasAttribute("data-content-feedback-form")) {
    event.preventDefault();
    await handleContentFeedbackSubmit(target);
    return;
  }
});

async function handleContentFeedbackSubmit(form) {
  const card = form.closest("[data-content-id]");

  if (!(card instanceof HTMLElement)) {
    showStatus("未找到内容卡片。", "error");
    return;
  }

  const contentId = Number(card.dataset.contentId);
  const formData = new FormData(form);
  const response = await postJson(`/actions/content/${contentId}/feedback-entry`, {
    reactionSnapshot: readCurrentReaction(card),
    freeText: String(formData.get("feedbackFreeText") || ""),
    suggestedEffect: String(formData.get("suggestedEffect") || ""),
    strengthLevel: String(formData.get("strengthLevel") || ""),
    positiveKeywords: splitKeywords(String(formData.get("positiveKeywords") || "")),
    negativeKeywords: splitKeywords(String(formData.get("negativeKeywords") || ""))
  });

  if (!response.ok) {
    showStatus(await readActionError(response, "反馈保存失败，请稍后再试。"), "error");
    return;
  }

  showStatus("反馈已保存。", "success");
}

function openFeedbackPanel(card) {
  const panel = card.querySelector("[data-content-feedback-form]");

  if (panel instanceof HTMLElement) {
    panel.hidden = false;
  }
}

function splitKeywords(value) {
  return value
    .split(/[,\n，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
```

- [ ] **Step 6: 回跑内容 SSR 与客户端测试并提交**

Run: `npx vitest run tests/server/contentRoutes.test.ts tests/server/siteThemeClient.test.ts`

Expected: PASS

```bash
git add src/server/renderContentPages.ts src/server/public/site.js tests/server/contentRoutes.test.ts tests/server/siteThemeClient.test.ts
git commit -m "feat: add content feedback panel interactions"
```

### Task 10: 在 `main.ts` 装配 provider、重算运行锁与系统页依赖

**Files:**
- Modify: `src/main.ts`
- Modify: `src/core/pipeline/runCollectionCycle.ts`
- Modify: `tests/server/createServer.test.ts`

- [ ] **Step 1: 先补 `main.ts` 级别行为测试，锁定正式规则保存后会排队全量重算**

```ts
// tests/server/createServer.test.ts
it("queues a follow-up full recompute when the nl evaluation lock is busy", async () => {
  const triggerFullNlRecompute = vi.fn().mockResolvedValue({ accepted: true, queued: true });
  const app = createServer({
    saveNlRule: vi.fn().mockImplementation(async (_scope, _ruleText) => {
      return await triggerFullNlRecompute();
    })
  } as never);

  const response = await app.inject({
    method: "POST",
    url: "/actions/nl-rules/global",
    payload: { ruleText: "暂时不展示营销软文。" }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ ok: true, scope: "global", queuedRecompute: true });
});
```

- [ ] **Step 2: 跑服务装配测试，确认当前 `main.ts` 还没装配这些依赖**

Run: `npx vitest run tests/server/createServer.test.ts`

Expected: FAIL，提示 `saveNlRule` 路由响应缺少 `queuedRecompute`

- [ ] **Step 3: 在 `main.ts` 中挂载新的 repository 和 provider 装配**

```ts
// src/main.ts
import { createLlmProvider } from "./core/llm/createLlmProvider.js";
import { getLlmProviderSettings, saveLlmProviderSettings, deleteLlmProviderSettings } from "./core/llm/providerSettingsRepository.js";
import { listFeedbackPoolEntries, upsertFeedbackPoolEntry, deleteFeedbackPoolEntry, clearFeedbackPool } from "./core/feedback/feedbackPoolRepository.js";
import { createStrategyDraft, listStrategyDrafts, updateStrategyDraft, deleteStrategyDraft } from "./core/strategy/strategyDraftRepository.js";
import { listNlRules, saveNlRule as saveNlRuleSet } from "./core/strategy/nlRuleRepository.js";
import { getLatestNlEvaluationRun } from "./core/strategy/nlEvaluationRepository.js";
import { runNlEvaluationCycle } from "./core/strategy/runNlEvaluationCycle.js";
import type { SqliteDatabase } from "./core/db/openDatabase.js";

const nlEvaluationLock = createRunLock();
let pendingFullNlRecompute = false;

async function triggerFullNlRecompute() {
  if (nlEvaluationLock.isRunning()) {
    pendingFullNlRecompute = true;
    return { accepted: true as const, queued: true as const };
  }

  await nlEvaluationLock.runExclusive(async () => {
    const providerSettings = getLlmProviderSettings(db, config.llm.settingsMasterKey);

    if (!providerSettings?.decryptedApiKey) {
      return;
    }

    const provider = createLlmProvider({
      providerKind: providerSettings.providerKind,
      apiKey: providerSettings.decryptedApiKey
    });

    const ruleMap = toNlRuleMap(listNlRules(db));
    await runNlEvaluationCycle({
      db,
      runType: "full-recompute",
      providerKind: providerSettings.providerKind,
      provider,
      rules: ruleMap
    });
  });

  if (pendingFullNlRecompute) {
    pendingFullNlRecompute = false;
    return await triggerFullNlRecompute();
  }

  return { accepted: true as const, queued: false as const };
}
```

- [ ] **Step 4: 把 collection-only 的增量评估依赖接到 `main.ts`，并在无 provider 时静默降级**

```ts
// src/main.ts
async function runIncrementalNlEvaluation(input: { changedCanonicalUrls: string[]; runType: "incremental-after-collect" }) {
  const providerSettings = getLlmProviderSettings(db, config.llm.settingsMasterKey);

  if (!providerSettings?.decryptedApiKey || nlEvaluationLock.isRunning()) {
    return { accepted: false as const, reason: "provider-unavailable-or-busy" as const };
  }

  return await nlEvaluationLock.runExclusive(async () => {
    const provider = createLlmProvider({
      providerKind: providerSettings.providerKind,
      apiKey: providerSettings.decryptedApiKey
    });

    return await runNlEvaluationCycle({
      db,
      runType: input.runType,
      providerKind: providerSettings.providerKind,
      provider,
      rules: toNlRuleMap(listNlRules(db)),
      contentItemIds: findContentItemIdsByCanonicalUrls(db, input.changedCanonicalUrls)
    });
  });
}

const app = createServer({
  listFeedbackPoolEntries: async () => listFeedbackPoolEntries(db),
  saveFeedbackEntry: async (contentItemId, input) => upsertFeedbackPoolEntry(db, { contentItemId, ...input }),
  deleteFeedbackPoolEntry: async (id) => deleteFeedbackPoolEntry(db, id),
  clearFeedbackPool: async () => ({ cleared: clearFeedbackPool(db) }),
  listStrategyDrafts: async () => listStrategyDrafts(db),
  saveStrategyDraft: async (input) => {
    if (typeof input.id === "number" && input.id > 0) {
      updateStrategyDraft(db, input.id, {
        suggestedScope: input.suggestedScope as "unspecified" | "global" | "hot" | "articles" | "ai",
        draftText: input.draftText
      });

      return { ok: true as const, id: input.id };
    }

    const id = createStrategyDraft(db, {
      sourceFeedbackId: null,
      suggestedScope: input.suggestedScope as "unspecified" | "global" | "hot" | "articles" | "ai",
      draftText: input.draftText,
      draftEffectSummary: input.draftEffectSummary ?? null,
      positiveKeywords: input.positiveKeywords ?? [],
      negativeKeywords: input.negativeKeywords ?? []
    });

    return { ok: true as const, id };
  },
  deleteStrategyDraft: async (id) => ({ ok: deleteStrategyDraft(db, id) > 0 }),
  listNlRules: async () => listNlRules(db),
  saveNlRule: async (scope, ruleText) => {
    saveNlRuleSet(db, scope, ruleText);
    const recompute = await triggerFullNlRecompute();
    return { ok: true as const, queuedRecompute: recompute.queued };
  },
  getLlmProviderSettings: async () => {
    const settings = getLlmProviderSettings(db, config.llm.settingsMasterKey);
    return settings
      ? {
          providerKind: settings.providerKind,
          apiKeyLast4: settings.apiKeyLast4,
          isConfigured: settings.isConfigured,
          isEnabled: settings.isEnabled
        }
      : null;
  },
  saveLlmProviderSettings: async (input) => saveLlmProviderSettings(db, { masterKey: config.llm.settingsMasterKey, ...input }),
  deleteLlmProviderSettings: async () => ({ ok: deleteLlmProviderSettings(db) >= 0 }),
  getLatestNlEvaluationRun: async () => getLatestNlEvaluationRun(db)
});

function toNlRuleMap(rows: Array<{ scope: string; ruleText: string }>) {
  return {
    global: rows.find((row) => row.scope === "global")?.ruleText ?? "",
    hot: rows.find((row) => row.scope === "hot")?.ruleText ?? "",
    articles: rows.find((row) => row.scope === "articles")?.ruleText ?? "",
    ai: rows.find((row) => row.scope === "ai")?.ruleText ?? ""
  };
}

function findContentItemIdsByCanonicalUrls(db: SqliteDatabase, canonicalUrls: string[]) {
  if (canonicalUrls.length === 0) {
    return [];
  }

  const placeholders = canonicalUrls.map(() => "?").join(", ");
  const rows = db.prepare(`SELECT id FROM content_items WHERE canonical_url IN (${placeholders})`).all(...canonicalUrls) as Array<{ id: number }>;
  return rows.map((row) => row.id);
}
```

- [ ] **Step 5: 回跑服务装配测试并提交**

Run: `npx vitest run tests/server/createServer.test.ts tests/pipeline/runCollectionCycle.test.ts`

Expected: PASS

```bash
git add src/main.ts src/core/pipeline/runCollectionCycle.ts tests/server/createServer.test.ts tests/pipeline/runCollectionCycle.test.ts
git commit -m "feat: wire nl strategy services into main runtime"
```

### Task 11: 更新协作文档、README、环境变量说明并做最终验证

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `.env.example`

- [ ] **Step 1: 先补 `.env.example`，把主密钥列成明确可见项**

```bash
LLM_SETTINGS_MASTER_KEY=replace_with_local_llm_settings_master_key
```

- [ ] **Step 2: 更新 README，把 `/settings/view-rules` 从“权重页”改成“策略工作台”**

```md
- 统一站点系统菜单（登录后访问）：`/settings/view-rules`、`/settings/sources`、`/settings/profile`
- `/settings/view-rules` 现在包含数值权重、LLM 厂商配置、正式自然语言策略、反馈池与草稿池
- 支持 `DeepSeek / MiniMax / Kimi` 三家厂商单活配置；未配置 API key 时，自然语言匹配能力会降级为不可用提示
- 正式自然语言策略保存后会立即触发当前内容库全量重算；采集完成后会对新增或变更内容执行增量自然语言匹配
```

- [ ] **Step 3: 更新 `AGENTS.md`，同步系统页职责和新增环境变量**

```md
- `/settings/view-rules`：统一站点筛选策略工作台（登录后），包括数值权重、LLM 厂商配置、正式自然语言策略、反馈池和草稿池

当前关键环境变量：

- `LLM_SETTINGS_MASTER_KEY`
```

- [ ] **Step 4: 运行最相关测试集合，先确保新增链路没有单测回归**

Run: `npx vitest run tests/db/runMigrations.test.ts tests/config/loadRuntimeConfig.test.ts tests/feedback/feedbackPoolRepository.test.ts tests/strategy/strategyDraftRepository.test.ts tests/strategy/nlRuleRepository.test.ts tests/llm/providerSettingsRepository.test.ts tests/strategy/nlEvaluationRepository.test.ts tests/strategy/runNlEvaluationCycle.test.ts tests/content/listContentView.test.ts tests/server/systemRoutes.test.ts tests/server/contentRoutes.test.ts tests/server/siteThemeClient.test.ts tests/pipeline/runCollectionCycle.test.ts`

Expected: PASS

- [ ] **Step 5: 跑类型构建，确认新增类型、依赖注入与 route payload 都已对齐**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: 提交文档和验证收口改动**

```bash
git add README.md AGENTS.md .env.example
git commit -m "docs: document feedback and llm strategy workbench"
```
