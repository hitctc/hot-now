# HotNow Unified Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current daily digest tool into a single-user unified content site with SQLite-backed content storage, configurable RSS source adapters, content interactions, system menus, and preserved digest report/email behavior.

**Architecture:** Keep the existing Fastify single-process app and daily digest pipeline, but add a SQLite-backed domain layer for sources, content, feedback, ratings, view rules, and user profile. Replace the source loader with an adapter registry that supports `juya`, `openai`, `google_ai`, and `techcrunch_ai`, then build a unified app shell with server-rendered pages and light client-side form actions while preserving report file artifacts and legacy report routes.

**Tech Stack:** Node.js 20, TypeScript, Fastify, SQLite via `better-sqlite3`, rss-parser, cheerio, jsdom + @mozilla/readability, node-cron, nodemailer, Vitest, server-rendered HTML/CSS/JS

---

## Planned File Structure

- `package.json`: add SQLite dependency and any small runtime helpers required by the unified site
- `.env.example`: add auth/session bootstrap variables for the single-user site
- `config/hot-now.config.json`: add database config and keep existing schedule/report/manual run config
- `src/main.ts`: bootstrap runtime config, database, source catalog seed, auth bootstrap, server dependencies, and scheduler
- `src/core/types/appConfig.ts`: extend runtime config with database and auth fields
- `src/core/config/loadRuntimeConfig.ts`: parse the new config sections and required auth/session env vars
- `src/core/db/openDatabase.ts`: open the SQLite database connection
- `src/core/db/runMigrations.ts`: create and migrate schema for sources, content, feedback, ratings, view rules, user profile, collection runs, and digest report index
- `src/core/db/seedInitialData.ts`: seed source catalog rows, default view rules, rating dimensions, and the first admin profile
- `src/core/source/types.ts`: shared source adapter types
- `src/core/source/sourceCatalog.ts`: built-in source definitions for `juya`, `openai`, `google_ai`, `techcrunch_ai`
- `src/core/source/parseJuyaIssue.ts`: keep the current digest parser stable while adapting it to shared source types
- `src/core/source/parseArticleFeed.ts`: parse standard article RSS feeds into normalized candidates
- `src/core/source/sourceAdapters.ts`: adapter registry from `kind` to parser implementation
- `src/core/source/loadActiveSourceIssue.ts`: fetch XML for the active source row and dispatch to the right parser
- `src/core/content/deriveContentSignals.ts`: compute `content_type`, `ai_relevance`, `hot_score`, and normalized tags
- `src/core/content/contentRepository.ts`: upsert and query `content_items`
- `src/core/content/listContentView.ts`: implement the three menu views from content pool + view rules
- `src/core/feedback/feedbackRepository.ts`: favorite / like / dislike persistence
- `src/core/ratings/ratingRepository.ts`: rating dimension and score persistence
- `src/core/viewRules/viewRuleRepository.ts`: load and save per-view rule configs
- `src/core/auth/passwords.ts`: hash and verify the single-user password
- `src/core/auth/session.ts`: create, verify, and clear signed session cookies
- `src/core/pipeline/runDailyDigest.ts`: ingest source content into SQLite before generating report artifacts
- `src/core/storage/reportStore.ts`: keep report file behavior and sync digest report index rows
- `src/server/createServer.ts`: register login, unified site, content interaction, system page, and legacy report routes
- `src/server/renderAppLayout.ts`: shared shell HTML, navigation, and top-level layout
- `src/server/renderContentPages.ts`: render `热点资讯` / `热门文章` / `最新 AI 消息`
- `src/server/renderSystemPages.ts`: render `筛选策略` / `数据迭代收集` / `当前登录用户`
- `src/server/renderPages.ts`: keep legacy report pages focused on report-only concerns
- `src/server/public/site.css`: unified site visual system
- `src/server/public/site.js`: light client-side enhancement for list actions and forms
- `tests/config/loadRuntimeConfig.test.ts`: config parsing coverage for database and auth fields
- `tests/db/*.test.ts`: migration and seed coverage
- `tests/source/*.test.ts`: `juya` stability and article feed parser coverage
- `tests/content/*.test.ts`: content signal and view query coverage
- `tests/auth/*.test.ts`: password and session coverage
- `tests/server/*.test.ts`: login flow, unified shell routes, content actions, system pages, and preserved report routes
- `README.md`: local setup, new env vars, SQLite database, login flow, unified navigation, and verification
- `AGENTS.md`: update collaboration guidance when routes, config, and validation steps change

### Task 1: Add SQLite runtime config, schema bootstrap, and seed entrypoints

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `config/hot-now.config.json`
- Modify: `src/core/types/appConfig.ts`
- Modify: `src/core/config/loadRuntimeConfig.ts`
- Create: `src/core/db/openDatabase.ts`
- Create: `src/core/db/runMigrations.ts`
- Create: `src/core/db/seedInitialData.ts`
- Test: `tests/config/loadRuntimeConfig.test.ts`
- Test: `tests/db/runMigrations.test.ts`

- [ ] **Step 1: Write the failing config and migration tests**

```ts
// tests/config/loadRuntimeConfig.test.ts
it("loads database and auth settings when the new fields are provided", async () => {
  await writeFile(
    configPath,
    JSON.stringify({
      server: { port: 3010 },
      schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
      report: { topN: 10, dataDir: "../data/reports", allowDegraded: true },
      database: { file: "../data/hot-now.sqlite" },
      manualRun: { enabled: true }
    })
  );

  const config = await loadRuntimeConfig({
    configPath,
    env: {
      SMTP_HOST: "smtp.qq.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "sender@qq.com",
      SMTP_PASS: "secret",
      MAIL_TO: "receiver@example.com",
      BASE_URL: "http://127.0.0.1:3010",
      AUTH_USERNAME: "admin",
      AUTH_PASSWORD: "passw0rd!",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef"
    }
  });

  expect(config.database.file).toMatch(/hot-now\.sqlite$/);
  expect(config.auth.username).toBe("admin");
  expect(config.auth.sessionSecret).toBe("0123456789abcdef0123456789abcdef");
});

it("keeps legacy digest setups bootable by filling database and auth defaults", async () => {
  await writeFile(
    configPath,
    JSON.stringify({
      server: { port: 3010 },
      schedule: { enabled: true, dailyTime: "08:00", timezone: "Asia/Shanghai" },
      report: { topN: 10, dataDir: "../data/reports", allowDegraded: true },
      source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
      manualRun: { enabled: true }
    })
  );

  const config = await loadRuntimeConfig({
    configPath,
    env: {
      SMTP_HOST: "smtp.qq.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "sender@qq.com",
      SMTP_PASS: "secret",
      MAIL_TO: "receiver@example.com",
      BASE_URL: "http://127.0.0.1:3010"
    }
  });

  expect(config.database.file).toMatch(/hot-now\.sqlite$/);
  expect(config.auth.username).toBe("admin");
});
```

```ts
// tests/db/runMigrations.test.ts
it("creates the unified site tables and seeds built-in sources", () => {
  const db = openDatabase(":memory:");

  runMigrations(db);
  seedInitialData(db, {
    auth: {
      username: "admin",
      password: "passw0rd!"
    }
  });

  const tables = db.prepare("select name from sqlite_master where type = 'table'").all() as Array<{ name: string }>;
  const sourceKinds = db.prepare("select kind from content_sources order by kind").all() as Array<{ kind: string }>;

  expect(tables.map((row) => row.name)).toEqual(
    expect.arrayContaining([
      "content_sources",
      "content_items",
      "content_feedback",
      "rating_dimensions",
      "content_ratings",
      "view_rule_configs",
      "user_profile",
      "collection_runs",
      "digest_reports"
    ])
  );
  expect(sourceKinds).toEqual([
    { kind: "google_ai" },
    { kind: "juya" },
    { kind: "openai" },
    { kind: "techcrunch_ai" }
  ]);
});
```

- [ ] **Step 2: Run the targeted tests and confirm they fail on missing database/auth support**

Run:

```bash
npm run test -- tests/config/loadRuntimeConfig.test.ts tests/db/runMigrations.test.ts
```

Expected: FAIL with missing `src/core/db/*` modules or missing extended runtime config support.

- [ ] **Step 3: Implement runtime config parsing, database bootstrap, and seed helpers**

```json
// config/hot-now.config.json
{
  "server": { "port": 3010 },
  "schedule": { "enabled": true, "dailyTime": "08:00", "timezone": "Asia/Shanghai" },
  "report": { "topN": 10, "dataDir": "../data/reports", "allowDegraded": true },
  "database": { "file": "../data/hot-now.sqlite" },
  "manualRun": { "enabled": true }
}
```

```ts
// src/core/types/appConfig.ts
export type RuntimeConfig = {
  server: { port: number };
  schedule: { enabled: boolean; dailyTime: string; timezone: string };
  report: { topN: number; dataDir: string; allowDegraded: boolean };
  database: { file: string };
  manualRun: { enabled: boolean };
  auth: {
    username: string;
    password: string;
    sessionSecret: string;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    to: string;
    baseUrl: string;
  };
};
```

```ts
// src/core/config/loadRuntimeConfig.ts
const defaultDatabaseFile = "./data/hot-now.sqlite";
const defaultAuth = {
  username: "admin",
  password: "admin",
  sessionSecret: "dev-session-secret"
} as const;

// Keep legacy digest setups bootable while the unified-site login flow is not wired yet.
database: {
  file: requiredConfigString(database?.file ?? defaultDatabaseFile, "database.file")
},
auth: {
  username: env.AUTH_USERNAME || defaultAuth.username,
  password: env.AUTH_PASSWORD || defaultAuth.password,
  sessionSecret: env.SESSION_SECRET || defaultAuth.sessionSecret
}
```

```ts
// src/core/db/openDatabase.ts
import Database from "better-sqlite3";

export function openDatabase(filename: string) {
  return new Database(filename);
}
```

```ts
// src/core/db/runMigrations.ts
import type Database from "better-sqlite3";

export function runMigrations(db: Database.Database) {
  db.exec(`
    create table if not exists content_sources (
      id integer primary key,
      kind text not null unique,
      name text not null,
      rss_url text not null,
      enabled integer not null default 1,
      is_active integer not null default 0,
      fetch_interval_minutes integer not null default 1440,
      last_fetched_at text,
      last_fetch_status text
    );
    create table if not exists content_items (
      id integer primary key,
      source_id integer not null,
      external_id text not null,
      title text not null,
      summary text not null,
      excerpt text not null,
      url text not null unique,
      source_name text not null,
      published_at text,
      content_type text not null,
      ai_relevance real not null,
      hot_score real not null,
      tags_json text not null,
      fetch_status text not null,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists content_feedback (
      id integer primary key,
      content_item_id integer not null unique,
      is_favorited integer not null default 0,
      reaction text not null default 'none',
      updated_at text not null
    );
    create table if not exists rating_dimensions (
      id integer primary key,
      key text not null unique,
      label text not null,
      description text not null,
      weight real not null,
      enabled integer not null default 1,
      sort_order integer not null
    );
    create table if not exists content_ratings (
      id integer primary key,
      content_item_id integer not null,
      dimension_key text not null,
      score integer not null,
      updated_at text not null,
      unique(content_item_id, dimension_key)
    );
    create table if not exists view_rule_configs (
      id integer primary key,
      view_key text not null unique,
      config_json text not null,
      updated_at text not null
    );
    create table if not exists user_profile (
      id integer primary key,
      username text not null unique,
      display_name text not null,
      password_hash text not null,
      last_login_at text,
      updated_at text not null
    );
    create table if not exists collection_runs (
      id integer primary key,
      source_id integer not null,
      trigger text not null,
      started_at text not null,
      finished_at text,
      status text not null,
      summary_json text not null
    );
    create table if not exists digest_reports (
      id integer primary key,
      report_date text not null unique,
      report_json_path text not null,
      report_html_path text not null,
      mail_status text not null,
      generated_at text not null
    );
  `);
}
```

- [ ] **Step 4: Re-run targeted tests and the build**

Run:

```bash
npm run test -- tests/config/loadRuntimeConfig.test.ts tests/db/runMigrations.test.ts
npm run build
```

Expected: PASS for both targeted tests and a clean TypeScript build.

- [ ] **Step 5: Commit the SQLite foundation**

```bash
git add package.json package-lock.json .env.example config/hot-now.config.json src/core/types/appConfig.ts src/core/config/loadRuntimeConfig.ts src/core/db/openDatabase.ts src/core/db/runMigrations.ts src/core/db/seedInitialData.ts tests/config/loadRuntimeConfig.test.ts tests/db/runMigrations.test.ts
git commit -m "feat: add sqlite runtime foundation"
```

### Task 2: Replace the single RSS parser with an explicit source adapter registry

**Files:**
- Create: `src/core/source/types.ts`
- Create: `src/core/source/sourceCatalog.ts`
- Create: `src/core/source/parseArticleFeed.ts`
- Create: `src/core/source/sourceAdapters.ts`
- Create: `src/core/source/loadActiveSourceIssue.ts`
- Modify: `src/core/source/parseJuyaIssue.ts`
- Test: `tests/source/parseJuyaIssue.test.ts`
- Test: `tests/source/parseArticleFeed.test.ts`
- Create: `tests/fixtures/openai-rss.xml`
- Create: `tests/fixtures/google-ai-rss.xml`
- Create: `tests/fixtures/techcrunch-ai-rss.xml`

- [ ] **Step 1: Add failing tests for article feeds and adapter dispatch**

```ts
// tests/source/parseArticleFeed.test.ts
it("parses the OpenAI feed into ranked normalized items", async () => {
  const xml = await readFile("tests/fixtures/openai-rss.xml", "utf8");
  const issue = await parseArticleFeed(xml, {
    kind: "openai",
    name: "OpenAI News",
    category: "最新 AI 消息"
  });

  expect(issue.sourceKind).toBe("openai");
  expect(issue.items[0]).toEqual(
    expect.objectContaining({
      rank: 1,
      category: "最新 AI 消息",
      sourceName: "OpenAI News"
    })
  );
});
```

```ts
// tests/source/parseJuyaIssue.test.ts
it("dispatches the active source by kind while keeping juya behavior stable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    status: 200,
    text: vi.fn().mockResolvedValue(await readFile("tests/fixtures/juya-rss.xml", "utf8"))
  }));

  const db = openDatabase(":memory:");
  runMigrations(db);
  seedInitialData(db, { auth: { username: "admin", password: "passw0rd!" } });
  db.prepare("update content_sources set is_active = 1 where kind = 'juya'").run();

  const issue = await loadActiveSourceIssue(db);

  expect(issue.sourceKind).toBe("juya");
  expect(issue.items).toHaveLength(2);
});
```

- [ ] **Step 2: Run source tests and confirm they fail because the adapter layer does not exist yet**

Run:

```bash
npm run test -- tests/source/parseJuyaIssue.test.ts tests/source/parseArticleFeed.test.ts
```

Expected: FAIL with missing `parseArticleFeed`, `sourceKind`, or `loadActiveSourceIssue` exports.

- [ ] **Step 3: Implement normalized source types, source catalog, and dispatch**

```ts
// src/core/source/types.ts
export type SourceKind = "juya" | "openai" | "google_ai" | "techcrunch_ai";

export type CandidateItem = {
  rank: number;
  category: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  externalId: string;
  publishedAt?: string;
  summary?: string;
};

export type LoadedIssue = {
  date: string;
  issueUrl: string;
  sourceKind: SourceKind;
  items: CandidateItem[];
};
```

```ts
// src/core/source/sourceCatalog.ts
import type { SourceKind } from "./types.js";

export const BUILTIN_SOURCES: Array<{ kind: SourceKind; name: string; rssUrl: string; category: string }> = [
  { kind: "juya", name: "橘鸦AI早报", rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml", category: "热点资讯" },
  { kind: "openai", name: "OpenAI News", rssUrl: "https://openai.com/news/rss.xml", category: "最新 AI 消息" },
  { kind: "google_ai", name: "Google AI", rssUrl: "https://blog.google/technology/ai/rss/", category: "最新 AI 消息" },
  { kind: "techcrunch_ai", name: "TechCrunch AI", rssUrl: "https://techcrunch.com/category/artificial-intelligence/feed/", category: "热门文章" }
];
```

```ts
// src/core/source/sourceAdapters.ts
export const sourceAdapters = {
  juya: parseJuyaIssue,
  openai: (xml: string) => parseArticleFeed(xml, { kind: "openai", name: "OpenAI News", category: "最新 AI 消息" }),
  google_ai: (xml: string) => parseArticleFeed(xml, { kind: "google_ai", name: "Google AI", category: "最新 AI 消息" }),
  techcrunch_ai: (xml: string) => parseArticleFeed(xml, { kind: "techcrunch_ai", name: "TechCrunch AI", category: "热门文章" })
} satisfies Record<SourceKind, (xml: string) => Promise<LoadedIssue>>;
```

```ts
// src/core/source/loadActiveSourceIssue.ts
export async function loadActiveSourceIssue(db: Database.Database): Promise<LoadedIssue> {
  const active = db.prepare("select kind, rss_url from content_sources where is_active = 1 limit 1").get() as { kind: SourceKind; rss_url: string } | undefined;

  if (!active) {
    throw new Error("No active content source configured");
  }

  const response = await fetch(active.rss_url);
  if (response.status !== 200) {
    throw new Error(`RSS request failed with ${response.status}`);
  }

  const xml = await response.text();
  return await sourceAdapters[active.kind](xml);
}
```

- [ ] **Step 4: Re-run source parser tests**

Run:

```bash
npm run test -- tests/source/parseJuyaIssue.test.ts tests/source/parseArticleFeed.test.ts
```

Expected: PASS; `juya` stays green and article feeds parse into normalized candidates.

- [ ] **Step 5: Commit the source adapter layer**

```bash
git add src/core/source/types.ts src/core/source/sourceCatalog.ts src/core/source/parseJuyaIssue.ts src/core/source/parseArticleFeed.ts src/core/source/sourceAdapters.ts src/core/source/loadActiveSourceIssue.ts tests/source/parseJuyaIssue.test.ts tests/source/parseArticleFeed.test.ts tests/fixtures/openai-rss.xml tests/fixtures/google-ai-rss.xml tests/fixtures/techcrunch-ai-rss.xml
git commit -m "feat: add rss source adapter registry"
```

### Task 3: Persist ingested content and keep report generation compatible

**Files:**
- Create: `src/core/content/deriveContentSignals.ts`
- Create: `src/core/content/contentRepository.ts`
- Create: `src/core/content/listContentView.ts`
- Modify: `src/core/pipeline/runDailyDigest.ts`
- Modify: `src/main.ts`
- Modify: `src/core/storage/reportStore.ts`
- Test: `tests/content/contentRepository.test.ts`
- Test: `tests/content/listContentView.test.ts`
- Modify: `tests/pipeline/runDailyDigest.test.ts`

- [ ] **Step 1: Write failing tests for content upsert, view queries, and report compatibility**

```ts
// tests/content/contentRepository.test.ts
it("upserts normalized items without duplicating urls", () => {
  const db = openDatabase(":memory:");
  runMigrations(db);
  seedInitialData(db, { auth: { username: "admin", password: "passw0rd!" } });

  upsertContentItems(db, [
    {
      sourceKind: "openai",
      externalId: "post-1",
      title: "Inside our approach to the Model Spec",
      summary: "Model Spec article",
      excerpt: "Model behavior framework",
      url: "https://openai.com/index/our-approach-to-the-model-spec",
      sourceName: "OpenAI News",
      publishedAt: "2026-03-27T14:31:56.000Z",
      contentType: "news",
      aiRelevance: 1,
      hotScore: 0.72,
      tags: ["openai", "safety"],
      fetchStatus: "full"
    }
  ]);

  upsertContentItems(db, [/* same URL with refreshed summary */]);

  const rows = db.prepare("select count(*) as total from content_items").get() as { total: number };
  expect(rows.total).toBe(1);
});
```

```ts
// tests/pipeline/runDailyDigest.test.ts
it("writes report files and stores a digest index row after ingestion", async () => {
  const db = openDatabase(":memory:");
  runMigrations(db);
  seedInitialData(db, { auth: { username: "admin", password: "passw0rd!" } });

  const result = await runDailyDigest(config, "manual", {
    db,
    loadLatestIssue: vi.fn().mockResolvedValue(issueFixture),
    fetchArticle: vi.fn().mockResolvedValue(articleFixture),
    sendDailyEmail: vi.fn().mockResolvedValue(undefined)
  });

  expect(result.report.meta.mailStatus).toBe("sent");
  expect(db.prepare("select count(*) as total from digest_reports").get()).toEqual({ total: 1 });
});
```

- [ ] **Step 2: Run the content and pipeline tests to confirm the repository layer is missing**

Run:

```bash
npm run test -- tests/content/contentRepository.test.ts tests/content/listContentView.test.ts tests/pipeline/runDailyDigest.test.ts
```

Expected: FAIL with missing repository helpers or `runDailyDigest` dependency shape mismatch.

- [ ] **Step 3: Implement content signal derivation, upsert logic, and view queries**

```ts
// src/core/content/deriveContentSignals.ts
export function deriveContentSignals(input: {
  sourceKind: SourceKind;
  title: string;
  summary: string;
  publishedAt?: string;
}) {
  const normalized = `${input.title} ${input.summary}`.toLowerCase();
  const aiKeywords = ["ai", "model", "gemini", "gpt", "openai", "deepmind", "agent", "llm"];
  const aiMatches = aiKeywords.filter((keyword) => normalized.includes(keyword)).length;
  const aiRelevance = Math.min(1, aiMatches / 4);
  const contentType = normalized.includes("analysis") || normalized.includes("research") ? "article" : "news";
  const hotScore = input.sourceKind === "juya" ? 0.9 : 0.55 + aiRelevance * 0.3;

  return {
    contentType,
    aiRelevance,
    hotScore,
    tags: aiKeywords.filter((keyword) => normalized.includes(keyword))
  };
}
```

```ts
// src/core/content/contentRepository.ts
export function upsertContentItems(db: Database.Database, items: StoredContentInput[]) {
  const insert = db.prepare(`
    insert into content_items (
      source_id, external_id, title, summary, excerpt, url, source_name, published_at,
      content_type, ai_relevance, hot_score, tags_json, fetch_status, created_at, updated_at
    ) values (
      @sourceId, @externalId, @title, @summary, @excerpt, @url, @sourceName, @publishedAt,
      @contentType, @aiRelevance, @hotScore, @tagsJson, @fetchStatus, @createdAt, @updatedAt
    )
    on conflict(url) do update set
      title = excluded.title,
      summary = excluded.summary,
      excerpt = excluded.excerpt,
      source_name = excluded.source_name,
      published_at = excluded.published_at,
      content_type = excluded.content_type,
      ai_relevance = excluded.ai_relevance,
      hot_score = excluded.hot_score,
      tags_json = excluded.tags_json,
      fetch_status = excluded.fetch_status,
      updated_at = excluded.updated_at
  `);

  const transaction = db.transaction((batch: StoredContentInput[]) => {
    for (const item of batch) {
      insert.run(item);
    }
  });

  transaction(items);
}
```

```ts
// src/core/storage/reportStore.ts
export function upsertDigestReportIndex(
  db: Database.Database,
  input: { reportDate: string; reportJsonPath: string; reportHtmlPath: string; mailStatus: string; generatedAt: string }
) {
  db.prepare(`
    insert into digest_reports (report_date, report_json_path, report_html_path, mail_status, generated_at)
    values (@reportDate, @reportJsonPath, @reportHtmlPath, @mailStatus, @generatedAt)
    on conflict(report_date) do update set
      report_json_path = excluded.report_json_path,
      report_html_path = excluded.report_html_path,
      mail_status = excluded.mail_status,
      generated_at = excluded.generated_at
  `).run(input);
}
```

```ts
// src/core/pipeline/runDailyDigest.ts
export type RunDailyDigestDeps = {
  db?: Database.Database;
  loadLatestIssue?: (db: Database.Database) => Promise<LoadedIssue>;
  fetchArticle?: (url: string) => Promise<ArticleResult>;
  sendDailyEmail?: (config: RuntimeConfig, report: DailyReport) => Promise<unknown>;
};

// Inside runDailyDigest:
const activeSource = db.prepare("select id from content_sources where is_active = 1 limit 1").get() as { id: number };
const now = new Date().toISOString();
const issue = await runtimeDeps.loadLatestIssue(db);
const enrichedItems = await Promise.all(issue.items.map((item) => enrichItem(item, runtimeDeps.fetchArticle)));
upsertContentItems(db, enrichedItems.map((item) => ({
  sourceId: activeSource.id,
  externalId: item.externalId,
  title: item.title,
  summary: item.article.ok ? item.article.title || item.title : item.summary ?? item.title,
  excerpt: item.article.text.slice(0, 280),
  url: item.sourceUrl,
  sourceName: item.sourceName,
  publishedAt: item.publishedAt ?? null,
  contentType: item.contentSignals.contentType,
  aiRelevance: item.contentSignals.aiRelevance,
  hotScore: item.contentSignals.hotScore,
  tagsJson: JSON.stringify(item.contentSignals.tags),
  fetchStatus: item.article.ok ? "full" : "degraded",
  createdAt: now,
  updatedAt: now
})));
upsertDigestReportIndex(db, {
  reportJsonPath: join(config.report.dataDir, report.meta.date, "report.json"),
  reportHtmlPath: join(config.report.dataDir, report.meta.date, "report.html"),
  reportDate: report.meta.date,
  mailStatus,
  generatedAt: report.meta.generatedAt
});
```

- [ ] **Step 4: Re-run content and pipeline tests**

Run:

```bash
npm run test -- tests/content/contentRepository.test.ts tests/content/listContentView.test.ts tests/pipeline/runDailyDigest.test.ts
```

Expected: PASS; content rows are upserted, view queries sort correctly, and report file output still works.

- [ ] **Step 5: Commit the unified content persistence layer**

```bash
git add src/core/content/deriveContentSignals.ts src/core/content/contentRepository.ts src/core/content/listContentView.ts src/core/pipeline/runDailyDigest.ts src/main.ts src/core/storage/reportStore.ts tests/content/contentRepository.test.ts tests/content/listContentView.test.ts tests/pipeline/runDailyDigest.test.ts
git commit -m "feat: persist collected content in sqlite"
```

### Task 4: Add single-user login and a unified application shell

**Files:**
- Create: `src/core/auth/passwords.ts`
- Create: `src/core/auth/session.ts`
- Modify: `src/main.ts`
- Modify: `src/server/createServer.ts`
- Create: `src/server/renderAppLayout.ts`
- Create: `src/server/public/site.css`
- Test: `tests/auth/session.test.ts`
- Test: `tests/server/createServer.test.ts`

- [ ] **Step 1: Write failing tests for login flow and route guarding**

```ts
// tests/auth/session.test.ts
it("creates and verifies a signed session token", () => {
  const token = createSessionToken({ username: "admin", expiresAt: "2026-03-29T00:00:00.000Z" }, "0123456789abcdef");
  expect(readSessionToken(token, "0123456789abcdef")).toEqual(
    expect.objectContaining({ username: "admin" })
  );
});
```

```ts
// tests/server/createServer.test.ts
it("redirects anonymous users from the unified app to /login", async () => {
  const app = createServer({ auth: { requireLogin: true } });
  const response = await app.inject({ method: "GET", url: "/" });

  expect(response.statusCode).toBe(302);
  expect(response.headers.location).toBe("/login");
});

it("renders the unified shell after a successful login cookie", async () => {
  const cookie = `hot_now_session=${createSessionToken({ username: "admin", expiresAt: "2026-03-29T00:00:00.000Z" }, "0123456789abcdef")}`;
  const app = createServer({
    auth: { requireLogin: true, sessionSecret: "0123456789abcdef" },
    renderHome: () => "<main>热点资讯</main>"
  });

  const response = await app.inject({ method: "GET", url: "/", headers: { cookie } });
  expect(response.statusCode).toBe(200);
  expect(response.body).toContain("热点资讯");
});
```

- [ ] **Step 2: Run auth and server tests and confirm they fail**

Run:

```bash
npm run test -- tests/auth/session.test.ts tests/server/createServer.test.ts
```

Expected: FAIL with missing auth/session helpers and server route behavior.

- [ ] **Step 3: Implement password hashing, signed cookie sessions, and app shell rendering**

```ts
// src/core/auth/passwords.ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
```

```ts
// src/core/auth/session.ts
import { createHmac } from "node:crypto";

export function createSessionToken(payload: { username: string; expiresAt: string }, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readSessionToken(token: string, secret: string) {
  const [body, signature] = token.split(".");
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (signature !== expected) return null;
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { username: string; expiresAt: string };
}
```

```ts
// src/server/renderAppLayout.ts
export function renderAppLayout(params: {
  title: string;
  activeNav: string;
  username: string;
  content: string;
}) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${params.title}</title>
    <link rel="stylesheet" href="/assets/site.css" />
    <script defer src="/assets/site.js"></script>
  </head>
  <body>
    <div class="app-shell">
      <aside class="app-nav">
        <a class="${params.activeNav === "hot" ? "is-active" : ""}" href="/">热点资讯</a>
        <a class="${params.activeNav === "articles" ? "is-active" : ""}" href="/articles">热门文章</a>
        <a class="${params.activeNav === "ai" ? "is-active" : ""}" href="/ai">最新 AI 消息</a>
        <a class="${params.activeNav === "rules" ? "is-active" : ""}" href="/settings/view-rules">筛选策略</a>
        <a class="${params.activeNav === "sources" ? "is-active" : ""}" href="/settings/sources">数据迭代收集</a>
        <a class="${params.activeNav === "profile" ? "is-active" : ""}" href="/settings/profile">当前登录用户</a>
      </aside>
      <main class="app-main">
        <header class="app-header"><span>${params.username}</span><form method="post" action="/logout"><button>退出</button></form></header>
        ${params.content}
      </main>
    </div>
  </body>
</html>`;
}
```

- [ ] **Step 4: Re-run auth/server tests and build**

Run:

```bash
npm run test -- tests/auth/session.test.ts tests/server/createServer.test.ts
npm run build
```

Expected: PASS; anonymous traffic is redirected to `/login`, and authenticated traffic renders the shell.

- [ ] **Step 5: Commit the auth and shell layer**

```bash
git add src/core/auth/passwords.ts src/core/auth/session.ts src/main.ts src/server/createServer.ts src/server/renderAppLayout.ts src/server/public/site.css tests/auth/session.test.ts tests/server/createServer.test.ts
git commit -m "feat: add single-user auth shell"
```

### Task 5: Build content menu pages plus favorite, like/dislike, and rating actions

**Files:**
- Create: `src/core/feedback/feedbackRepository.ts`
- Create: `src/core/ratings/ratingRepository.ts`
- Modify: `src/core/content/listContentView.ts`
- Create: `src/server/renderContentPages.ts`
- Modify: `src/server/createServer.ts`
- Modify: `src/server/public/site.js`
- Test: `tests/content/listContentView.test.ts`
- Test: `tests/server/contentRoutes.test.ts`

- [ ] **Step 1: Write failing tests for content view pages and interaction endpoints**

```ts
// tests/server/contentRoutes.test.ts
it("renders the 热点资讯 page from the unified content pool", async () => {
  const app = createServer({
    auth: { requireLogin: false },
    listContentView: vi.fn().mockResolvedValue([
      { id: 1, title: "Gemini 3.1 Flash Live", summary: "Google AI update", reaction: "none", isFavorited: false }
    ])
  });

  const response = await app.inject({ method: "GET", url: "/" });
  expect(response.statusCode).toBe(200);
  expect(response.body).toContain("Gemini 3.1 Flash Live");
});

it("toggles favorite state through the content action route", async () => {
  const saveFavorite = vi.fn().mockResolvedValue({ isFavorited: true });
  const app = createServer({ auth: { requireLogin: false }, saveFavorite });

  const response = await app.inject({
    method: "POST",
    url: "/actions/content/1/favorite",
    payload: { isFavorited: true }
  });

  expect(response.statusCode).toBe(200);
  expect(saveFavorite).toHaveBeenCalledWith(1, true);
});
```

- [ ] **Step 2: Run content route tests and confirm they fail**

Run:

```bash
npm run test -- tests/content/listContentView.test.ts tests/server/contentRoutes.test.ts
```

Expected: FAIL with missing page renderers, feedback repository, or content action routes.

- [ ] **Step 3: Implement content list rendering and feedback/rating persistence**

```ts
// src/core/feedback/feedbackRepository.ts
export function saveFeedback(
  db: Database.Database,
  contentItemId: number,
  payload: { isFavorited?: boolean; reaction?: "like" | "dislike" | "none" }
) {
  const now = new Date().toISOString();
  db.prepare(`
    insert into content_feedback (content_item_id, is_favorited, reaction, updated_at)
    values (@contentItemId, @isFavorited, @reaction, @updatedAt)
    on conflict(content_item_id) do update set
      is_favorited = excluded.is_favorited,
      reaction = excluded.reaction,
      updated_at = excluded.updated_at
  `).run({
    contentItemId,
    isFavorited: payload.isFavorited ? 1 : 0,
    reaction: payload.reaction ?? "none",
    updatedAt: now
  });
}
```

```ts
// src/core/ratings/ratingRepository.ts
export function saveRatings(db: Database.Database, contentItemId: number, scores: Array<{ dimensionKey: string; score: number }>) {
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    insert into content_ratings (content_item_id, dimension_key, score, updated_at)
    values (@contentItemId, @dimensionKey, @score, @updatedAt)
    on conflict(content_item_id, dimension_key) do update set
      score = excluded.score,
      updated_at = excluded.updated_at
  `);

  const transaction = db.transaction((items: Array<{ dimensionKey: string; score: number }>) => {
    for (const item of items) {
      upsert.run({ contentItemId, dimensionKey: item.dimensionKey, score: item.score, updatedAt: now });
    }
  });

  transaction(scores);
}
```

```ts
// src/server/renderContentPages.ts
export function renderContentPage(params: {
  title: string;
  description: string;
  items: Array<{ id: number; title: string; summary: string; sourceName: string; publishedAt?: string; tags: string[]; isFavorited: boolean; reaction: string }>;
}) {
  const cards = params.items.map((item) => `
    <article class="content-card" data-content-id="${item.id}">
      <header><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p></header>
      <footer>
        <span>${escapeHtml(item.sourceName)}</span>
        <button data-action="favorite">${item.isFavorited ? "已收藏" : "收藏"}</button>
        <button data-action="like"${item.reaction === "like" ? " aria-pressed=\"true\"" : ""}>点赞</button>
        <button data-action="dislike"${item.reaction === "dislike" ? " aria-pressed=\"true\"" : ""}>点踩</button>
        <button data-action="rate">评分</button>
      </footer>
    </article>
  `).join("");

  return `<section class="content-view"><h1>${escapeHtml(params.title)}</h1><p>${escapeHtml(params.description)}</p>${cards}</section>`;
}
```

- [ ] **Step 4: Re-run the content route tests**

Run:

```bash
npm run test -- tests/content/listContentView.test.ts tests/server/contentRoutes.test.ts
```

Expected: PASS; all three content views can render and interaction routes persist state.

- [ ] **Step 5: Commit the content interaction layer**

```bash
git add src/core/feedback/feedbackRepository.ts src/core/ratings/ratingRepository.ts src/core/content/listContentView.ts src/server/renderContentPages.ts src/server/createServer.ts src/server/public/site.js tests/content/listContentView.test.ts tests/server/contentRoutes.test.ts
git commit -m "feat: add unified content interactions"
```

### Task 6: Build system menus for view rules, source management, and current user

**Files:**
- Create: `src/core/viewRules/viewRuleRepository.ts`
- Modify: `src/core/db/seedInitialData.ts`
- Create: `src/server/renderSystemPages.ts`
- Modify: `src/server/createServer.ts`
- Test: `tests/server/systemRoutes.test.ts`
- Test: `tests/db/seedInitialData.test.ts`

- [ ] **Step 1: Write failing tests for system pages and active source switching**

```ts
// tests/server/systemRoutes.test.ts
it("renders the 数据迭代收集 page with the active source", async () => {
  const app = createServer({
    auth: { requireLogin: false },
    listSources: vi.fn().mockResolvedValue([
      { id: 1, kind: "juya", name: "橘鸦AI早报", isActive: true, lastFetchStatus: "ok" }
    ])
  });

  const response = await app.inject({ method: "GET", url: "/settings/sources" });
  expect(response.statusCode).toBe(200);
  expect(response.body).toContain("橘鸦AI早报");
  expect(response.body).toContain("当前启用");
});

it("switches the active source from juya to openai", async () => {
  const setActiveSource = vi.fn().mockResolvedValue(undefined);
  const app = createServer({ auth: { requireLogin: false }, setActiveSource });

  const response = await app.inject({
    method: "POST",
    url: "/actions/sources/activate",
    payload: { kind: "openai" }
  });

  expect(response.statusCode).toBe(200);
  expect(setActiveSource).toHaveBeenCalledWith("openai");
});
```

- [ ] **Step 2: Run system tests and confirm they fail**

Run:

```bash
npm run test -- tests/server/systemRoutes.test.ts tests/db/seedInitialData.test.ts
```

Expected: FAIL with missing system renderers, source action routes, or default rule seeds.

- [ ] **Step 3: Implement view rule storage, source management, and user profile pages**

```ts
// src/core/viewRules/viewRuleRepository.ts
export function saveViewRuleConfig(db: Database.Database, viewKey: "hot" | "articles" | "ai", config: Record<string, unknown>) {
  db.prepare(`
    insert into view_rule_configs (view_key, config_json, updated_at)
    values (@viewKey, @configJson, @updatedAt)
    on conflict(view_key) do update set
      config_json = excluded.config_json,
      updated_at = excluded.updated_at
  `).run({
    viewKey,
    configJson: JSON.stringify(config),
    updatedAt: new Date().toISOString()
  });
}
```

```ts
// src/server/renderSystemPages.ts
export function renderSourcesPage(rows: Array<{ kind: string; name: string; rssUrl: string; isActive: boolean; lastFetchStatus: string | null }>) {
  return `<section class="system-page">
    <h1>数据迭代收集</h1>
    <ul>${rows.map((row) => `
      <li>
        <strong>${escapeHtml(row.name)}</strong>
        <span>${escapeHtml(row.rssUrl)}</span>
        <span>${row.isActive ? "当前启用" : "未启用"}</span>
        <span>${escapeHtml(row.lastFetchStatus ?? "unknown")}</span>
      </li>
    `).join("")}</ul>
  </section>`;
}
```

```ts
// src/server/createServer.ts
app.get("/settings/view-rules", async (_request, reply) => {
  const rules = await deps.listViewRules?.();
  return reply.type("text/html").send(renderAppLayout({
    title: "筛选策略",
    activeNav: "rules",
    username: deps.currentUsername?.() ?? "admin",
    content: renderViewRulesPage(rules ?? [])
  }));
});

app.post("/actions/sources/activate", async (request, reply) => {
  const { kind } = request.body as { kind: string };
  await deps.setActiveSource?.(kind);
  return reply.send({ ok: true });
});
```

- [ ] **Step 4: Re-run system tests**

Run:

```bash
npm run test -- tests/server/systemRoutes.test.ts tests/db/seedInitialData.test.ts
```

Expected: PASS; system pages render and active source switching persists correctly.

- [ ] **Step 5: Commit the system menu layer**

```bash
git add src/core/viewRules/viewRuleRepository.ts src/core/db/seedInitialData.ts src/server/renderSystemPages.ts src/server/createServer.ts tests/server/systemRoutes.test.ts tests/db/seedInitialData.test.ts
git commit -m "feat: add unified system menus"
```

### Task 7: Preserve report routes, sync docs, and run full verification

**Files:**
- Modify: `src/server/renderPages.ts`
- Modify: `src/server/createServer.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `.env.example`
- Modify: `tests/server/reportPages.test.ts`
- Modify: `tests/server/createServer.test.ts`

- [ ] **Step 1: Write failing tests for preserved report routes under the new unified shell**

```ts
// tests/server/reportPages.test.ts
it("keeps /history available after the unified shell becomes the main site", async () => {
  const app = createServer({
    auth: { requireLogin: false },
    listReportSummaries: vi.fn().mockResolvedValue([
      { date: "2026-03-27", topicCount: 10, degraded: true, mailStatus: "sent" }
    ])
  });

  const response = await app.inject({ method: "GET", url: "/history" });

  expect(response.statusCode).toBe(200);
  expect(response.body).toContain("2026-03-27");
});
```

- [ ] **Step 2: Run the preserved report tests and confirm route integration issues**

Run:

```bash
npm run test -- tests/server/reportPages.test.ts tests/server/createServer.test.ts
```

Expected: FAIL until the unified shell and legacy report pages coexist cleanly.

- [ ] **Step 3: Wire report links into the new app, update docs, and document new env/config behavior**

```md
<!-- README.md -->
## 统一站点登录

启动后访问 `/login`，使用 `AUTH_USERNAME` 和 `AUTH_PASSWORD` 登录。登录后可在同一站点中访问：

- `/`：热点资讯
- `/articles`：热门文章
- `/ai`：最新 AI 消息
- `/settings/view-rules`：筛选策略
- `/settings/sources`：数据迭代收集
- `/settings/profile`：当前登录用户
- `/history`：历史报告
```

```md
<!-- AGENTS.md -->
- 新增 SQLite 文件 `database.file`
- 新增环境变量 `AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET`
- 根路由 `/` 现在承载统一站点首页，历史报告仍保留在 `/history`
- 验证时除 `npm run test`、`npm run build` 外，需补一次登录后站点 smoke test
```

- [ ] **Step 4: Run final verification**

Run:

```bash
npm run test
npm run build
set -a
source .env.local
set +a
npm run dev
```

Expected:

- `vitest` 全量通过
- TypeScript build 成功
- 打开 `/login` 可登录
- 登录后 `/`、`/articles`、`/ai`、`/settings/view-rules`、`/settings/sources`、`/settings/profile`、`/history` 均可访问
- 触发一次采集后，`data/reports/<date>/` 仍生成 `report.json`、`report.html`、`run-meta.json`

- [ ] **Step 5: Commit the unified site integration and docs**

```bash
git add src/server/renderPages.ts src/server/createServer.ts README.md AGENTS.md .env.example tests/server/reportPages.test.ts tests/server/createServer.test.ts
git commit -m "feat: ship unified hot-now site"
```

## Self-Review

- Spec coverage: covered SQLite, unified content pool, single-user login, content menus, system menus, source adapters, rating dimension storage, preserved report/email behavior, and docs updates.
- Placeholder scan: no `TODO`, `TBD`, or “implement later” placeholders remain; each task includes files, commands, expected output, and concrete code direction.
- Type consistency: the plan consistently uses `SourceKind`, `LoadedIssue`, `content_items`, `view_rule_configs`, and the same four source kinds across tasks.
