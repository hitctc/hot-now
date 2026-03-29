# HotNow Separate Collection And Mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 HotNow 拆成“每 10 分钟采集一次 + 每天 10:00 发送最新报告一次”的两条独立链路，并保留手动采集、手动发信与 legacy `/actions/run` 兼容入口。

**Architecture:** 沿用当前单进程 Fastify + SQLite + 文件归档结构，不引入队列或新 worker。核心改法是把 `runDailyDigest` 拆成 `runCollectionCycle` 和 `sendLatestReportEmail` 两个 pipeline，再让 `main.ts` 用一把共享运行锁串起定时与手动入口，最后把 unified shell 与 legacy `/control` 同步拆成两个动作。

**Tech Stack:** TypeScript, Fastify SSR, SQLite, node-cron, Vitest, plain browser JS

---

## File Map

- Modify: `config/hot-now.config.json`
  - 把旧 `schedule` / `manualRun` 改成 `collectionSchedule` / `mailSchedule` / `manualActions`
- Modify: `src/core/types/appConfig.ts`
  - 定义新的运行时配置类型
- Modify: `src/core/config/loadRuntimeConfig.ts`
  - 解析新配置结构，并校验 `intervalMinutes` 与 `dailyTime`
- Modify: `src/core/scheduler/startScheduler.ts`
  - 拆成 `startCollectionScheduler` 与 `startMailScheduler`
- Create: `src/core/pipeline/runCollectionCycle.ts`
  - 负责采集、抓正文、写报告文件、更新 SQLite 镜像，但不发邮件
- Create: `src/core/pipeline/sendLatestReportEmail.ts`
  - 负责定位最新报告、读 `report.json`、调用 SMTP 发信
- Modify: `src/core/pipeline/runDailyDigest.ts`
  - 保留兼容包装层，用新 pipeline 组合旧语义
- Modify: `src/core/storage/reportStore.ts`
  - 提供 `readJsonFile` 与“最新报告日期”辅助读取能力
- Modify: `src/main.ts`
  - 拆成独立的采集 runner、发信 runner、双调度启动与双手动动作注入
- Modify: `src/server/createServer.ts`
  - 新增 `POST /actions/collect`、`POST /actions/send-latest-email`，并保留 `/actions/run` 作为采集别名
- Modify: `src/server/renderSystemPages.ts`
  - `/settings/sources` 拆成“手动采集”与“手动发最新报告”两张控制卡
- Modify: `src/server/renderPages.ts`
  - legacy `/control` 显示采集周期、发信时间和两个动作按钮
- Modify: `src/server/public/site.js`
  - unified shell 的系统表单分别调用 `/actions/collect` 与 `/actions/send-latest-email`
- Modify: `tests/config/loadRuntimeConfig.test.ts`
  - 覆盖新配置结构与非法值
- Modify: `tests/pipeline/runDailyDigest.test.ts`
  - 保留运行锁与兼容包装层测试，并把 scheduler 断言切到新 API
- Create: `tests/pipeline/runCollectionCycle.test.ts`
  - 覆盖“只采集不发信”的主链路
- Create: `tests/pipeline/sendLatestReportEmail.test.ts`
  - 覆盖“读取最新报告并发信”的主链路和错误分支
- Modify: `tests/server/createServer.test.ts`
  - 覆盖 auth 开启时新动作路由的鉴权
- Modify: `tests/server/reportPages.test.ts`
  - 覆盖 legacy `/control` 与两个动作路由
- Modify: `tests/server/systemRoutes.test.ts`
  - 覆盖 `/settings/sources` 双控制卡
- Update Docs: `README.md`, `AGENTS.md`
  - 同步新调度、手动动作、配置项与 `run-meta.mailStatus` 语义

### Task 1: 升级配置契约并拆分 scheduler

**Files:**
- Modify: `config/hot-now.config.json`
- Modify: `src/core/types/appConfig.ts`
- Modify: `src/core/config/loadRuntimeConfig.ts`
- Modify: `src/core/scheduler/startScheduler.ts`
- Modify: `tests/config/loadRuntimeConfig.test.ts`
- Modify: `tests/pipeline/runDailyDigest.test.ts`

- [ ] **Step 1: 先写失败测试，锁定新配置结构和双调度表达式**

```ts
it("loads separate collection and mail schedules plus manual action flags", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
  const configPath = path.join(tempDir, "hot-now.config.json");

  await writeFile(
    configPath,
    JSON.stringify({
      server: { port: 3030 },
      collectionSchedule: { enabled: true, intervalMinutes: 10 },
      mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
      report: { topN: 10, dataDir: "./data/reports", allowDegraded: true },
      source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
      manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
      database: { file: "./data/hot-now.sqlite" }
    })
  );

  const config = await loadRuntimeConfig({ configPath, env: baseEnv });

  expect(config.collectionSchedule.intervalMinutes).toBe(10);
  expect(config.mailSchedule.dailyTime).toBe("10:00");
  expect(config.manualActions.sendLatestEmailEnabled).toBe(true);
});

it("rejects collection interval values outside 1-59 minutes", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-config-"));
  const configPath = path.join(tempDir, "hot-now.config.json");

  await writeFile(
    configPath,
    JSON.stringify({
      server: { port: 3030 },
      collectionSchedule: { enabled: true, intervalMinutes: 60 },
      mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
      report: { topN: 10, dataDir: "./data/reports", allowDegraded: true },
      source: { rssUrl: "https://imjuya.github.io/juya-ai-daily/rss.xml" },
      manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
      database: { file: "./data/hot-now.sqlite" }
    })
  );

  await expect(loadRuntimeConfig({ configPath, env: baseEnv })).rejects.toThrow(
    "Invalid collectionSchedule.intervalMinutes: 60"
  );
});

it("registers collection and mail cron jobs with separate expressions", () => {
  const scheduleMock = vi.mocked(cron.schedule);
  const task = { stop: vi.fn() } as never;
  scheduleMock.mockReturnValue(task);
  const config = makeConfig("/tmp");

  startCollectionScheduler(config, vi.fn());
  startMailScheduler(config, vi.fn());

  expect(scheduleMock).toHaveBeenNthCalledWith(1, "*/10 * * * *", expect.any(Function));
  expect(scheduleMock).toHaveBeenNthCalledWith(2, "0 10 * * *", expect.any(Function), {
    timezone: "Asia/Shanghai"
  });
});
```

- [ ] **Step 2: 跑配置和 scheduler 测试，确认旧结构已经不满足新目标**

Run: `npx vitest run tests/config/loadRuntimeConfig.test.ts tests/pipeline/runDailyDigest.test.ts`

Expected: FAIL，报错点应集中在 `schedule` / `manualRun` 字段不存在，或 `startCollectionScheduler` / `startMailScheduler` 尚未导出

- [ ] **Step 3: 更新配置类型与解析逻辑，显式区分采集调度、发信调度和手动动作开关**

```ts
export type RuntimeConfig = {
  server: { port: number };
  collectionSchedule: { enabled: boolean; intervalMinutes: number };
  mailSchedule: { enabled: boolean; dailyTime: string; timezone: string };
  report: { topN: number; dataDir: string; allowDegraded: boolean };
  source: { rssUrl: string };
  manualActions: { collectEnabled: boolean; sendLatestEmailEnabled: boolean };
  database: { file: string };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    to: string;
    baseUrl: string;
  };
  auth: {
    username: string;
    password: string;
    sessionSecret: string;
  };
};

function parseRuntimeConfigFile(fileText: string): Omit<RuntimeConfig, "smtp" | "auth"> {
  const parsed = JSON.parse(fileText) as Record<string, unknown>;
  const collectionSchedule = getRequiredObject(parsed.collectionSchedule, "collectionSchedule");
  const mailSchedule = getRequiredObject(parsed.mailSchedule, "mailSchedule");
  const manualActions = getRequiredObject(parsed.manualActions, "manualActions");

  return {
    server: {
      port: requiredRunnablePort(server.port, "server.port")
    },
    collectionSchedule: {
      enabled: requiredConfigBoolean(collectionSchedule.enabled, "collectionSchedule.enabled"),
      intervalMinutes: requiredCollectionIntervalMinutes(
        collectionSchedule.intervalMinutes,
        "collectionSchedule.intervalMinutes"
      )
    },
    mailSchedule: {
      enabled: requiredConfigBoolean(mailSchedule.enabled, "mailSchedule.enabled"),
      dailyTime: requiredConfigString(mailSchedule.dailyTime, "mailSchedule.dailyTime"),
      timezone: requiredConfigString(mailSchedule.timezone, "mailSchedule.timezone")
    },
    manualActions: {
      collectEnabled: requiredConfigBoolean(manualActions.collectEnabled, "manualActions.collectEnabled"),
      sendLatestEmailEnabled: requiredConfigBoolean(
        manualActions.sendLatestEmailEnabled,
        "manualActions.sendLatestEmailEnabled"
      )
    },
    report: {
      topN: requiredPositiveInteger(report.topN, "report.topN"),
      dataDir: requiredConfigString(report.dataDir, "report.dataDir"),
      allowDegraded: requiredConfigBoolean(report.allowDegraded, "report.allowDegraded")
    },
    source: {
      rssUrl: requiredConfigString(source.rssUrl, "source.rssUrl")
    },
    database: {
      file: requiredConfigString(database?.file ?? defaultDatabaseFile, "database.file")
    }
  };
}

function requiredCollectionIntervalMinutes(value: unknown, key: string) {
  const interval = requiredPositiveInteger(value, key);

  if (interval < 1 || interval > 59) {
    throw new Error(`Invalid ${key}: ${interval}`);
  }

  return interval;
}
```

- [ ] **Step 4: 拆出两个 scheduler，并把 checked-in 默认配置切成 10 分钟采集 + 10:00 发信**

```ts
type ScheduledTask = ReturnType<typeof cron.schedule>;

export function startCollectionScheduler(
  config: RuntimeConfig,
  run: () => Promise<void>
): ScheduledTask | null {
  if (!config.collectionSchedule.enabled) {
    return null;
  }

  const interval = config.collectionSchedule.intervalMinutes;
  return cron.schedule(`*/${interval} * * * *`, run);
}

export function startMailScheduler(
  config: RuntimeConfig,
  run: () => Promise<void>
): ScheduledTask | null {
  if (!config.mailSchedule.enabled) {
    return null;
  }

  const { hour, minute } = parseDailyTime(config.mailSchedule.dailyTime, "mailSchedule.dailyTime");
  return cron.schedule(`${minute} ${hour} * * *`, run, {
    timezone: config.mailSchedule.timezone
  });
}
```

```json
{
  "server": { "port": 3030 },
  "collectionSchedule": { "enabled": true, "intervalMinutes": 10 },
  "mailSchedule": { "enabled": true, "dailyTime": "10:00", "timezone": "Asia/Shanghai" },
  "report": { "topN": 10, "dataDir": "../data/reports", "allowDegraded": true },
  "source": { "rssUrl": "https://imjuya.github.io/juya-ai-daily/rss.xml" },
  "manualActions": { "collectEnabled": true, "sendLatestEmailEnabled": true },
  "database": { "file": "../data/hot-now.sqlite" }
}
```

- [ ] **Step 5: 回跑配置与 scheduler 测试**

Run: `npx vitest run tests/config/loadRuntimeConfig.test.ts tests/pipeline/runDailyDigest.test.ts`

Expected: PASS，且 `cron.schedule` 断言分别命中 `*/10 * * * *` 与 `0 10 * * *`

- [ ] **Step 6: 提交配置契约改动**

```bash
git add config/hot-now.config.json src/core/types/appConfig.ts src/core/config/loadRuntimeConfig.ts src/core/scheduler/startScheduler.ts tests/config/loadRuntimeConfig.test.ts tests/pipeline/runDailyDigest.test.ts
git commit -m "feat: split collection and mail schedules"
```

### Task 2: 提取“只采集不发信”的 collection pipeline

**Files:**
- Create: `src/core/pipeline/runCollectionCycle.ts`
- Modify: `src/core/pipeline/runDailyDigest.ts`
- Create: `tests/pipeline/runCollectionCycle.test.ts`

- [ ] **Step 1: 先写 collection pipeline 的失败测试，锁定“不发信，但会写报告与镜像”的语义**

```ts
it("writes report artifacts and db mirrors without sending email", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-run-"));
  const config = makeConfig(rootDir);
  const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));

  const result = await runCollectionCycle(config, "manual", {
    db,
    loadEnabledSourceIssues: vi.fn().mockResolvedValue([
      {
        date: "2026-03-29",
        issueUrl: "https://openai.com/news/",
        sourceKind: "openai",
        sourceType: "official",
        sourcePriority: 95,
        items: [
          {
            rank: 1,
            category: "最新 AI 消息",
            title: "OpenAI 发布 GPT-Next",
            sourceUrl: "https://openai.com/index/gpt-next",
            sourceName: "OpenAI",
            externalId: "openai-1",
            summary: "OpenAI 发布新模型摘要",
            publishedAt: "2026-03-29T08:00:00.000Z"
          }
        ]
      }
    ]),
    fetchArticle: vi.fn().mockResolvedValue({
      ok: true,
      url: "https://openai.com/index/gpt-next",
      title: "GPT-Next",
      text: "OpenAI 发布新的模型与 API 更新。"
    })
  });

  const runMeta = JSON.parse(await readFile(path.join(rootDir, "2026-03-29", "run-meta.json"), "utf8")) as Record<string, unknown>;

  expect(result.report.meta.mailStatus).toBe("not-sent-by-collection");
  expect(runMeta.mailStatus).toBe("not-sent-by-collection");
});
```

- [ ] **Step 2: 跑 collection pipeline 测试，确认新模块还不存在**

Run: `npx vitest run tests/pipeline/runCollectionCycle.test.ts`

Expected: FAIL，提示 `runCollectionCycle` 模块不存在或导出缺失

- [ ] **Step 3: 从 `runDailyDigest.ts` 抽出采集实现，保留现有多源抓取、入库和报告写盘逻辑**

```ts
export type RunCollectionCycleDeps = {
  db?: SqliteDatabase;
  loadEnabledSourceIssues?: () => Promise<LoadedSourceIssues>;
  fetchArticle?: (url: string) => Promise<ArticleResult>;
};

export type RunCollectionCycleResult = {
  report: DailyReport;
};

export async function runCollectionCycle(
  config: RuntimeConfig,
  trigger: DailyReportTrigger,
  deps: RunCollectionCycleDeps = {}
): Promise<RunCollectionCycleResult> {
  const runtimeDeps = {
    db: deps.db,
    fetchArticle: deps.fetchArticle ?? fetchAndExtractArticle
  };

  if (!runtimeDeps.db && !deps.loadEnabledSourceIssues) {
    throw new Error("runCollectionCycle requires a database-backed source loader");
  }

  const loadEnabledSourceIssuesFn = deps.loadEnabledSourceIssues ?? (() => loadEnabledSourceIssues(runtimeDeps.db!));
  const issues = await loadEnabledSourceIssuesFn();
  const sourceFailures = issues.failures ?? [];
  const reportIssue = pickReportIssue(issues);
  const collectionRunId = runtimeDeps.db
    ? runDbMirrorStep(() =>
        createCollectionRun(runtimeDeps.db!, {
          runDate: reportIssue.date,
          triggerKind: trigger,
          status: "running",
          startedAt: new Date().toISOString(),
          notes: JSON.stringify({
            sourceKinds: issues.map((issue) => issue.sourceKind),
            sourceCount: issues.length,
            sourceFailureCount: sourceFailures.length,
            failedSourceKinds: sourceFailures.map((failure) => failure.kind)
          })
        })
      )
    : undefined;

  const enrichedIssues = await Promise.all(issues.map((issue) => enrichIssue(issue, runtimeDeps.fetchArticle)));
  const enrichedItems = enrichedIssues.flatMap((issue) => issue.items);
  const topics = clusterTopics(enrichedItems);
  const report = buildDailyReport({
    issue: buildAggregateIssue(reportIssue, enrichedIssues, enrichedItems),
    trigger,
    topics,
    topN: config.report.topN
  });

  report.meta.degraded = report.meta.degraded || sourceFailures.length > 0;
  report.meta.sourceFailureCount = sourceFailures.length;
  report.meta.failedSourceKinds = sourceFailures.map((failure) => failure.kind);
  report.meta.mailStatus = "not-sent-by-collection";

  await writeJsonFile(config.report.dataDir, report.meta.date, "report.json", report);
  await writeTextFile(config.report.dataDir, report.meta.date, "report.html", renderReportHtml(report));
  await writeJsonFile(config.report.dataDir, report.meta.date, "run-meta.json", {
    date: report.meta.date,
    trigger,
    generatedAt: report.meta.generatedAt,
    mailStatus: report.meta.mailStatus,
    degraded: report.meta.degraded,
    topicCount: report.meta.topicCount,
    sourceFailureCount: report.meta.sourceFailureCount,
    failedSourceKinds: report.meta.failedSourceKinds
  });

  if (runtimeDeps.db && collectionRunId != null) {
    runDbMirrorStep(() => {
      finishCollectionRun(runtimeDeps.db!, {
        id: collectionRunId,
        status: "completed",
        finishedAt: new Date().toISOString(),
        notes: JSON.stringify({
          sourceKinds: issues.map((issue) => issue.sourceKind),
          sourceCount: issues.length,
          sourceFailureCount: sourceFailures.length,
          failedSourceKinds: sourceFailures.map((failure) => failure.kind),
          itemCount: enrichedItems.length,
          degraded: report.meta.degraded
        })
      });
    });

    runDbMirrorStep(() => {
      upsertDigestReport(runtimeDeps.db!, {
        reportDate: report.meta.date,
        collectionRunId,
        reportJsonPath: path.join(reportDayDir(config.report.dataDir, report.meta.date), "report.json"),
        reportHtmlPath: path.join(reportDayDir(config.report.dataDir, report.meta.date), "report.html"),
        mailStatus: report.meta.mailStatus
      });
    });
  }

  return { report };
}
```

- [ ] **Step 4: 把 `runDailyDigest.ts` 降成兼容包装层，先只依赖新的 collection pipeline**

```ts
import { runCollectionCycle } from "./runCollectionCycle.js";

export async function runDailyDigest(
  config: RuntimeConfig,
  trigger: DailyReportTrigger,
  deps: RunDailyDigestDeps = {}
): Promise<RunDailyDigestResult> {
  const collectionResult = await runCollectionCycle(config, trigger, deps);

  return {
    report: collectionResult.report,
    mailStatus: collectionResult.report.meta.mailStatus
  };
}
```

- [ ] **Step 5: 回跑 collection pipeline 测试**

Run: `npx vitest run tests/pipeline/runCollectionCycle.test.ts`

Expected: PASS，且 `report.json` / `report.html` / `run-meta.json` 都落盘，`mailStatus` 固定为 `not-sent-by-collection`

- [ ] **Step 6: 提交 collection pipeline 改动**

```bash
git add src/core/pipeline/runCollectionCycle.ts src/core/pipeline/runDailyDigest.ts tests/pipeline/runCollectionCycle.test.ts
git commit -m "feat: extract collection-only pipeline"
```

### Task 3: 新增“读取最新报告并发信”的 mail pipeline

**Files:**
- Modify: `src/core/storage/reportStore.ts`
- Create: `src/core/pipeline/sendLatestReportEmail.ts`
- Create: `tests/pipeline/sendLatestReportEmail.test.ts`

- [ ] **Step 1: 先写失败测试，锁定“优先读 digest_reports，找不到再回退文件系统”的发信策略**

```ts
it("prefers the latest digest report row and sends that report", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-mail-"));
  const config = makeConfig(rootDir);
  const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));

  await writeJsonFile(rootDir, "2026-03-28", "report.json", makeStoredReport("2026-03-28"));
  await writeJsonFile(rootDir, "2026-03-29", "report.json", makeStoredReport("2026-03-29"));
  upsertDigestReport(db, {
    reportDate: "2026-03-29",
    reportJsonPath: path.join(rootDir, "2026-03-29", "report.json"),
    reportHtmlPath: path.join(rootDir, "2026-03-29", "report.html"),
    mailStatus: "not-sent-by-collection"
  });

  const sendDailyEmail = vi.fn().mockResolvedValue(undefined);
  const result = await sendLatestReportEmail(config, { db, sendDailyEmail });

  expect(sendDailyEmail).toHaveBeenCalledWith(
    config,
    expect.objectContaining({ meta: expect.objectContaining({ date: "2026-03-29" }) })
  );
  expect(result.mailStatus).toBe("sent");
});

it("throws not-found when no stored report is available", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-mail-"));
  const config = makeConfig(rootDir);
  const db = createTestDatabase(path.join(rootDir, "hot-now.sqlite"));

  await expect(sendLatestReportEmail(config, { db, sendDailyEmail: vi.fn() })).rejects.toMatchObject({
    reason: "not-found"
  });
});
```

- [ ] **Step 2: 跑 mail pipeline 测试，确认最新报告读取能力还没实现**

Run: `npx vitest run tests/pipeline/sendLatestReportEmail.test.ts`

Expected: FAIL，提示 `sendLatestReportEmail` 或 `readJsonFile` / 最新报告读取逻辑不存在

- [ ] **Step 3: 给 report store 增加 JSON 读取和文件系统回退辅助**

```ts
export async function readJsonFile<T>(rootDir: string, reportDate: string, fileName: string): Promise<T> {
  const text = await readTextFile(rootDir, reportDate, fileName);
  return JSON.parse(text) as T;
}

export function findLatestDigestReportDate(db: SqliteDatabase): string | null {
  const row = db
    .prepare(
      `
        SELECT report_date
        FROM digest_reports
        ORDER BY report_date DESC
        LIMIT 1
      `
    )
    .get() as { report_date: string } | undefined;

  return row?.report_date ?? null;
}
```

- [ ] **Step 4: 实现 mail pipeline，明确区分 `not-found`、`report-unavailable` 与 `send-failed`**

```ts
export class LatestReportEmailError extends Error {
  constructor(
    readonly reason: "not-found" | "report-unavailable" | "send-failed",
    message: string
  ) {
    super(message);
  }
}

export async function sendLatestReportEmail(
  config: RuntimeConfig,
  deps: SendLatestReportEmailDeps = {}
): Promise<{ report: DailyReport; reportDate: string; mailStatus: string }> {
  const sendDailyEmailFn = deps.sendDailyEmail ?? defaultSendDailyEmail;
  const latestDbDate = deps.db ? findLatestDigestReportDate(deps.db) : null;
  const latestFsDate = latestDbDate ? null : (await listReportDates(config.report.dataDir))[0] ?? null;
  const reportDate = latestDbDate ?? latestFsDate;

  if (!reportDate) {
    throw new LatestReportEmailError("not-found", "No stored report is available");
  }

  let report: DailyReport;

  try {
    report = await readJsonFile<DailyReport>(config.report.dataDir, reportDate, "report.json");
  } catch (error) {
    throw new LatestReportEmailError(
      "report-unavailable",
      error instanceof Error ? error.message : "Failed to read latest report"
    );
  }

  try {
    await sendDailyEmailFn(config, report);
    return { report, reportDate, mailStatus: "sent" };
  } catch (error) {
    throw new LatestReportEmailError(
      "send-failed",
      error instanceof Error ? error.message : "SMTP send failed"
    );
  }
}
```

- [ ] **Step 5: 回跑 mail pipeline 测试**

Run: `npx vitest run tests/pipeline/sendLatestReportEmail.test.ts`

Expected: PASS，且测试覆盖“DB 优先、文件系统回退、无报告报错”

- [ ] **Step 6: 提交发信 pipeline 改动**

```bash
git add src/core/storage/reportStore.ts src/core/pipeline/sendLatestReportEmail.ts tests/pipeline/sendLatestReportEmail.test.ts
git commit -m "feat: add send latest report email pipeline"
```

### Task 4: 主入口、兼容包装层与动作路由拆分

**Files:**
- Modify: `src/core/pipeline/runDailyDigest.ts`
- Modify: `src/main.ts`
- Modify: `src/server/createServer.ts`
- Modify: `tests/pipeline/runDailyDigest.test.ts`
- Modify: `tests/server/createServer.test.ts`
- Modify: `tests/server/reportPages.test.ts`

- [ ] **Step 1: 先写失败测试，锁定新动作路由、兼容别名和鉴权行为**

```ts
it("accepts manual collect on /actions/collect and keeps /actions/run as a compatibility alias", async () => {
  const triggerManualCollect = vi.fn().mockResolvedValue({ accepted: true, action: "collect" });
  const app = createServer({ triggerManualCollect } as never);

  const collectResponse = await app.inject({ method: "POST", url: "/actions/collect" });
  const aliasResponse = await app.inject({ method: "POST", url: "/actions/run" });

  expect(collectResponse.statusCode).toBe(202);
  expect(aliasResponse.statusCode).toBe(202);
  expect(triggerManualCollect).toHaveBeenCalledTimes(2);
});

it("returns 404 when manual send latest email has no stored report", async () => {
  const app = createServer({
    triggerManualSendLatestEmail: vi.fn().mockResolvedValue({ accepted: false, reason: "not-found" })
  } as never);

  const response = await app.inject({ method: "POST", url: "/actions/send-latest-email" });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({ accepted: false, reason: "not-found" });
});
```

- [ ] **Step 2: 跑 server 与兼容 wrapper 测试，确认旧 `triggerManualRun` 结构已经不够用**

Run: `npx vitest run tests/pipeline/runDailyDigest.test.ts tests/server/createServer.test.ts tests/server/reportPages.test.ts`

Expected: FAIL，报错点应集中在 `triggerManualCollect` / `triggerManualSendLatestEmail` 尚未注入，或 `/actions/collect` 与 `/actions/send-latest-email` 未注册

- [ ] **Step 3: 让 `runDailyDigest` 变成真正的兼容包装层，组合“先采集、再发送最新报告”**

```ts
import { runCollectionCycle } from "./runCollectionCycle.js";
import { sendLatestReportEmail } from "./sendLatestReportEmail.js";

export type RunDailyDigestDeps = RunCollectionCycleDeps & {
  sendDailyEmail?: (config: RuntimeConfig, report: DailyReport) => Promise<unknown>;
};

export async function runDailyDigest(
  config: RuntimeConfig,
  trigger: DailyReportTrigger,
  deps: RunDailyDigestDeps = {}
): Promise<RunDailyDigestResult> {
  const collectionResult = await runCollectionCycle(config, trigger, deps);
  const mailResult = await sendLatestReportEmail(config, {
    db: deps.db,
    sendDailyEmail: deps.sendDailyEmail
  });

  return {
    report: {
      ...collectionResult.report,
      meta: {
        ...collectionResult.report.meta,
        mailStatus: mailResult.mailStatus
      }
    },
    mailStatus: mailResult.mailStatus
  };
}
```

- [ ] **Step 4: 在 `main.ts` 拆出独立 runner，并让两类定时任务共用同一把运行锁**

```ts
async function runCollectionTask(triggerType: DailyReportTrigger) {
  return await lock.runExclusive(async () => {
    return await runCollectionCycle(config, triggerType, {
      db,
      loadEnabledSourceIssues: async () => await loadEnabledSourceIssues(db),
      fetchArticle: fetchAndExtractArticle
    });
  });
}

async function runLatestEmailTask() {
  return await lock.runExclusive(async () => {
    return await sendLatestReportEmail(config, { db, sendDailyEmail });
  });
}

const triggerManualCollect = config.manualActions.collectEnabled
  ? async () => {
      await runCollectionTask("manual");
      return { accepted: true as const, action: "collect" as const };
    }
  : undefined;

const triggerManualSendLatestEmail = config.manualActions.sendLatestEmailEnabled
  ? async () => {
      try {
        await runLatestEmailTask();
        return { accepted: true as const, action: "send-latest-email" as const };
      } catch (error) {
        if (error instanceof LatestReportEmailError) {
          return { accepted: false as const, reason: error.reason };
        }

        throw error;
      }
    }
  : undefined;

startCollectionScheduler(config, async () => {
  try {
    await runCollectionTask("scheduled");
  } catch (error) {
    app.log.error(error);
  }
});

startMailScheduler(config, async () => {
  try {
    await runLatestEmailTask();
  } catch (error) {
    app.log.error(error);
  }
});
```

- [ ] **Step 5: 在 server 注入层和路由层拆出两个动作，并把 `/actions/run` 保留成采集别名**

```ts
type ServerDeps = {
  triggerManualCollect?: () => Promise<{ accepted: true; action: "collect" }>;
  triggerManualSendLatestEmail?: () => Promise<
    | { accepted: true; action: "send-latest-email" }
    | { accepted: false; reason: "not-found" | "report-unavailable" | "send-failed" }
  >;
  isRunning?: () => boolean;
};

async function handleCollectAction(request: FastifyRequest, reply: FastifyReply) {
  if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
    return;
  }

  if (deps.isRunning?.()) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!deps.triggerManualCollect) {
    return reply.code(503).send({ accepted: false, reason: "manual-collect-disabled" });
  }

  return reply.code(202).send(await deps.triggerManualCollect());
}

app.post("/actions/collect", handleCollectAction);

app.post("/actions/send-latest-email", async (request, reply) => {
  if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
    return;
  }

  if (deps.isRunning?.()) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!deps.triggerManualSendLatestEmail) {
    return reply.code(503).send({ accepted: false, reason: "manual-send-latest-email-disabled" });
  }

  const result = await deps.triggerManualSendLatestEmail();

  if (!result.accepted && result.reason === "not-found") {
    return reply.code(404).send(result);
  }

  if (!result.accepted && result.reason === "report-unavailable") {
    return reply.code(503).send(result);
  }

  if (!result.accepted && result.reason === "send-failed") {
    return reply.code(502).send(result);
  }

  return reply.code(202).send(result);
});

app.post("/actions/run", async (request, reply) => {
  return await handleCollectAction(request, reply);
});
```

- [ ] **Step 6: 回跑主入口与 server 路由测试**

Run: `npx vitest run tests/pipeline/runDailyDigest.test.ts tests/server/createServer.test.ts tests/server/reportPages.test.ts`

Expected: PASS，且 `/actions/run`、`/actions/collect`、`/actions/send-latest-email` 的状态码分别覆盖兼容、404、401、409、503/502 场景

- [ ] **Step 7: 提交主入口和动作路由改动**

```bash
git add src/core/pipeline/runDailyDigest.ts src/main.ts src/server/createServer.ts tests/pipeline/runDailyDigest.test.ts tests/server/createServer.test.ts tests/server/reportPages.test.ts
git commit -m "feat: separate manual collect and send routes"
```

### Task 5: 更新 unified shell 与 legacy 页面

**Files:**
- Modify: `src/server/renderSystemPages.ts`
- Modify: `src/server/renderPages.ts`
- Modify: `src/server/public/site.js`
- Modify: `tests/server/systemRoutes.test.ts`
- Modify: `tests/server/reportPages.test.ts`

- [ ] **Step 1: 先写失败测试，锁定 `/settings/sources` 与 `/control` 的双动作展示**

```ts
it("renders separate manual collect and send latest email cards on sources page", async () => {
  const app = createServer({
    listSources: vi.fn().mockResolvedValue([
      {
        kind: "openai",
        name: "OpenAI",
        rssUrl: "https://openai.com/news/rss.xml",
        isEnabled: true,
        lastCollectedAt: "2026-03-29T08:00:00.000Z",
        lastCollectionStatus: "completed"
      }
    ]),
    triggerManualCollect: vi.fn().mockResolvedValue({ accepted: true, action: "collect" }),
    triggerManualSendLatestEmail: vi.fn().mockResolvedValue({ accepted: true, action: "send-latest-email" }),
    isRunning: () => false
  } as never);

  const response = await app.inject({ method: "GET", url: "/settings/sources" });

  expect(response.body).toContain("手动执行采集");
  expect(response.body).toContain("手动发送最新报告");
  expect(response.body).toContain('data-system-action="manual-collection-run"');
  expect(response.body).toContain('data-system-action="manual-send-latest-email"');
});

it("renders both actions on legacy control page", async () => {
  const app = createServer({
    config: {
      report: { dataDir: "./data/reports", topN: 10, allowDegraded: true },
      collectionSchedule: { enabled: true, intervalMinutes: 10 },
      mailSchedule: { enabled: true, dailyTime: "10:00", timezone: "Asia/Shanghai" },
      manualActions: { collectEnabled: true, sendLatestEmailEnabled: true },
      smtp: { to: "receiver@example.com" }
    },
    triggerManualCollect: vi.fn().mockResolvedValue({ accepted: true, action: "collect" }),
    triggerManualSendLatestEmail: vi.fn().mockResolvedValue({ accepted: true, action: "send-latest-email" })
  } as never);

  const response = await app.inject({ method: "GET", url: "/control" });

  expect(response.body).toContain("采集周期：每 10 分钟");
  expect(response.body).toContain("发信时间：10:00");
  expect(response.body).toContain('action="/actions/collect"');
  expect(response.body).toContain('action="/actions/send-latest-email"');
});
```

- [ ] **Step 2: 跑页面测试，确认当前模板仍然只有一个手动动作**

Run: `npx vitest run tests/server/systemRoutes.test.ts tests/server/reportPages.test.ts`

Expected: FAIL，页面里仍只有“手动执行采集”卡片或 `/control` 只有一个 `/actions/run` 表单

- [ ] **Step 3: 把 `/settings/sources` 变成双控制卡，并把控制选项显式拆成两个能力开关**

```ts
type SourcesPageOptions = {
  canTriggerManualCollect: boolean;
  canTriggerManualSendLatestEmail: boolean;
  isRunning: boolean;
};

export function renderSourcesPage(sources: SourceItem[], options: SourcesPageOptions): string {
  const enabledSources = sources.filter((source) => source.isEnabled);
  const cardsHtml = sources.map((source) => renderSourceCard(source)).join("");

  return `
    <section class="content-intro content-intro--system">
      <p class="content-kicker">系统菜单</p>
      <p class="content-description">数据迭代收集：管理多 source 启用状态，并拆分采集与发信动作。</p>
    </section>
    <section class="system-stack system-stack--control">
      ${renderManualCollectionCard(enabledSources, options)}
      ${renderManualSendLatestEmailCard(options)}
      ${cardsHtml}
    </section>
  `;
}

function renderManualSendLatestEmailCard(options: SourcesPageOptions): string {
  const buttonText = options.isRunning ? "发送中..." : "手动发送最新报告";
  const disabledAttr = options.canTriggerManualSendLatestEmail && !options.isRunning ? "" : " disabled";
  const initialStatus = options.canTriggerManualSendLatestEmail
    ? options.isRunning
      ? "当前已有任务执行中，请稍后再试。"
      : "发送当前最新一份已生成报告，不会重新采集。"
    : "当前环境未启用手动发邮件。";

  return `
    <article class="system-card system-card--control system-card--manual-mail">
      <header class="system-card-header">
        <h3 class="system-card-title">手动发送最新报告</h3>
        <p class="system-card-meta">会读取当前最新报告并直接发送，不重新采集。</p>
      </header>
      <form class="system-form" data-system-action="manual-send-latest-email">
        <div class="system-action-row">
          <button type="submit" class="primary-mini-button" data-role="manual-email-button"${disabledAttr}>
            ${buttonText}
          </button>
        </div>
        <div class="system-status-region">
          <p class="action-status system-status" data-role="action-status" aria-live="polite">${escapeHtml(initialStatus)}</p>
        </div>
      </form>
    </article>
  `;
}
```

- [ ] **Step 4: 更新 legacy `/control` 页面与浏览器脚本，让 unified shell 直接调用两个新接口**

```ts
type RenderConfig = {
  report?: { topN?: number; dataDir?: string; allowDegraded?: boolean };
  collectionSchedule?: { enabled?: boolean; intervalMinutes?: number };
  mailSchedule?: { enabled?: boolean; dailyTime?: string; timezone?: string };
  manualActions?: { collectEnabled?: boolean; sendLatestEmailEnabled?: boolean };
  smtp?: { to?: string };
};

export function renderControlPage(config: RenderConfig = {}, running: boolean) {
  const collectionInterval = config.collectionSchedule?.intervalMinutes ?? "未配置";
  const mailTime = config.mailSchedule?.dailyTime ?? "未配置";

  return renderLegacyDocument({
    pageKind: "control",
    title: "HotNow 控制台",
    bodyHtml: `
      <h1>HotNow 控制台</h1>
      <p>采集周期：每 ${escapeHtml(String(collectionInterval))} 分钟</p>
      <p>发信时间：${escapeHtml(String(mailTime))}</p>
      <p>任务状态：${running ? "执行中" : "空闲"}</p>
      <form method="post" action="/actions/collect">
        <button type="submit"${running ? " disabled" : ""}>立即采集一次</button>
      </form>
      <form method="post" action="/actions/send-latest-email">
        <button type="submit"${running ? " disabled" : ""}>发送最新报告</button>
      </form>
    `
  });
}
```

```js
if (target.dataset.systemAction === "manual-collection-run") {
  event.preventDefault();
  await handleManualCollectionRun(target);
  return;
}

if (target.dataset.systemAction === "manual-send-latest-email") {
  event.preventDefault();
  await handleManualSendLatestEmail(target);
  return;
}

async function handleManualCollectionRun(form) {
  const runButton = form.querySelector('[data-role="manual-run-button"]');
  runButton.disabled = true;
  runButton.textContent = "采集中...";
  const response = await postJson("/actions/collect", {});
  if (!response.ok) {
    runButton.disabled = false;
    runButton.textContent = "手动执行采集";
    showFormStatus(form, await readSystemActionError(response, "采集任务启动失败，请稍后再试。"));
    return;
  }

  showFormStatus(form, "已开始执行采集，请稍后刷新查看结果。");
}

async function handleManualSendLatestEmail(form) {
  const sendButton = form.querySelector('[data-role="manual-email-button"]');
  sendButton.disabled = true;
  sendButton.textContent = "发送中...";
  const response = await postJson("/actions/send-latest-email", {});
  if (!response.ok) {
    sendButton.disabled = false;
    sendButton.textContent = "手动发送最新报告";
    showFormStatus(form, await readSystemActionError(response, "发信任务启动失败，请稍后再试。"));
    return;
  }

  showFormStatus(form, "已开始发送最新报告，请检查收件箱。");
}
```

- [ ] **Step 5: 回跑页面测试**

Run: `npx vitest run tests/server/systemRoutes.test.ts tests/server/reportPages.test.ts`

Expected: PASS，且 unified shell 与 legacy `/control` 都能看到两个动作入口

- [ ] **Step 6: 提交页面与前端脚本改动**

```bash
git add src/server/renderSystemPages.ts src/server/renderPages.ts src/server/public/site.js tests/server/systemRoutes.test.ts tests/server/reportPages.test.ts
git commit -m "feat: split collect and mail controls in ui"
```

### Task 6: 同步文档并做回归验证

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 先写文档需要同步的关键差异，避免只改代码不改协作说明**

```md
- 页面与动作：`/settings/sources` 和 legacy `/control` 现在都支持“手动采集”和“手动发送最新报告”
- 路由：新增 `POST /actions/collect`、`POST /actions/send-latest-email`，`POST /actions/run` 保留为手动采集兼容别名
- 调度：采集每 10 分钟一次，发信每天 10:00 一次
- 配置：`collectionSchedule`、`mailSchedule`、`manualActions`
- `run-meta.json.mailStatus`：采集任务默认写 `not-sent-by-collection`
```

- [ ] **Step 2: 更新 README 与 AGENTS，让运行方式、页面入口和当前阶段快照保持一致**

```md
## 页面

- 手动采集：`POST /actions/collect`
- 手动发送最新报告：`POST /actions/send-latest-email`
- 兼容别名：`POST /actions/run`

## 配置

- `collectionSchedule.enabled`
- `collectionSchedule.intervalMinutes`
- `mailSchedule.enabled`
- `mailSchedule.dailyTime`
- `mailSchedule.timezone`
- `manualActions.collectEnabled`
- `manualActions.sendLatestEmailEnabled`
```

```md
- 当前主链路：`定时 / 手动采集 -> 拉取 enabled RSS sources -> 抓取原文 -> 生成 / 覆盖最新报告`
- 当前发信链路：`定时 / 手动发信 -> 读取当前最新报告 -> SMTP 发邮件`
- `/settings/sources`：支持 source 启用/停用、手动采集、手动发送最新报告
- legacy `/control`：拆成两个动作入口
```

- [ ] **Step 3: 跑最相关回归测试**

Run: `npx vitest run tests/config/loadRuntimeConfig.test.ts tests/pipeline/runCollectionCycle.test.ts tests/pipeline/sendLatestReportEmail.test.ts tests/pipeline/runDailyDigest.test.ts tests/server/createServer.test.ts tests/server/reportPages.test.ts tests/server/systemRoutes.test.ts`

Expected: PASS

- [ ] **Step 4: 跑类型构建**

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: 提交文档与最终回归改动**

```bash
git add README.md AGENTS.md
git commit -m "docs: document separate collection and mail flows"
```
