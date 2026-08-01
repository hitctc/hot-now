import path from "node:path";
import { existsSync } from "node:fs";
import { createRuntimeServerDeps } from "./app/createRuntimeServerDeps.js";
import { loadRootEnvFile } from "./core/config/loadRootEnvFile.js";
import { loadRuntimeConfig } from "./core/config/loadRuntimeConfig.js";
import { createRuntimeDatabase } from "./core/db/createRuntimeDatabase.js";
import { runMigrations } from "./core/db/runMigrations.js";
import { seedInitialData } from "./core/db/seedInitialData.js";
import { checkpointWal } from "./core/db/sqliteHealth.js";
import { fetchAndExtractArticle } from "./core/fetch/extractArticle.js";
import { runHackerNewsCollection } from "./core/hackernews/runHackerNewsCollection.js";
import { sendDailyEmail } from "./core/mail/sendDailyEmail.js";
import { runAiTimelineAlertCycle } from "./core/notifications/runAiTimelineAlertCycle.js";
import { LatestReportEmailError, sendLatestReportEmail } from "./core/pipeline/sendLatestReportEmail.js";
import { runCollectionCycle } from "./core/pipeline/runCollectionCycle.js";
import type { DailyReportTrigger } from "./core/report/buildDailyReport.js";
import { installGracefulShutdown } from "./core/runtime/installGracefulShutdown.js";
import { createRunLock } from "./core/runtime/runLock.js";
import { startAiTimelineAlertScheduler, startCollectionScheduler, startMailScheduler, startWechatRssScheduler } from "./core/scheduler/startScheduler.js";
import { loadEnabledSourceIssues } from "./core/source/loadEnabledSourceIssues.js";
import { runJuyaCollection } from "./core/source/runJuyaCollection.js";
import { runTwitterAccountCollection } from "./core/twitter/runTwitterAccountCollection.js";
import { runTwitterKeywordCollection } from "./core/twitter/runTwitterKeywordCollection.js";
import { runBilibiliCollection } from "./core/bilibili/runBilibiliCollection.js";
import { runWechatRssCollection } from "./core/wechatRss/runWechatRssCollection.js";
import { runWeiboTrendingCollection } from "./core/weibo/runWeiboTrendingCollection.js";
import { createServer } from "./server/createServer.js";

// 本地直接跑 tsx watch src/main.ts 时也要和 npm run dev 一样吃到根目录 .env。
loadRootEnvFile();
const config = await loadRuntimeConfig();
const recoveryDir = path.join(path.dirname(config.database.file), "recovery-backups");
const db = createRuntimeDatabase({
  databaseFile: config.database.file,
  recoveryDir
});
runMigrations(db);
seedInitialData(db, {
  username: config.auth.username,
  password: config.auth.password,
  email: config.smtp.user
});
const lock = createRunLock();
const aiTimelineAlertLock = createRunLock();
const wechatRssLock = createRunLock();
const mailLock = createRunLock();
const twitterLock = createRunLock();
const hackerNewsLock = createRunLock();
const bilibiliLock = createRunLock();
const weiboLock = createRunLock();
const juyaLock = createRunLock();
// Collection runs now stop after report generation so recurring fetches no longer send mail as a side effect.
async function runCollectionTask(triggerType: DailyReportTrigger) {
  return await runCollectionCycle(config, triggerType, {
    db,
    loadEnabledSourceIssues: async () => await loadEnabledSourceIssues(db),
    fetchArticle: fetchAndExtractArticle
  });
}

// Twitter 账号采集单独手动触发，避免把高成本轮询绑进默认 10 分钟节奏。
async function runTwitterAccountCollectionTask() {
  return await runTwitterAccountCollection(db, {
    apiKey: process.env.TWITTER_API_KEY?.trim() || null,
    fetchArticle: fetchAndExtractArticle
  });
}

// Twitter 关键词搜索保持独立手动动作，避免和账号采集一起把 credits 固定烧进默认调度。
async function runTwitterKeywordCollectionTask() {
  return await runTwitterKeywordCollection(db, {
    apiKey: process.env.TWITTER_API_KEY?.trim() || null,
    fetchArticle: fetchAndExtractArticle
  });
}

// Hacker News 搜索第一版只支持手动触发，避免在默认采集节奏里顺手扩大来源范围。
async function runHackerNewsCollectionTask() {
  return await runHackerNewsCollection(db);
}

// B 站搜索第一版也只支持手动触发，先把视频搜索链路验证稳定再考虑调度扩展。
async function runBilibiliCollectionTask() {
  return await runBilibiliCollection(db);
}

// 微信公众号 RSS 由后台单独维护，第一版只手动采集，避免混进普通 RSS 定时轮询。
async function runWechatRssCollectionTask() {
  return await runWechatRssCollection(db);
}

// Juya RSS 独立采集入口，避免为了补单个来源触发全量 runCollectionCycle（拖累其他来源 + 生成日报）。
async function runJuyaCollectionTask() {
  return await runJuyaCollection(db, { fetchArticle: fetchAndExtractArticle });
}

// 微博热搜榜匹配只做热点补充信号，不进默认采集调度。
async function runWeiboTrendingCollectionTask() {
  return await runWeiboTrendingCollection(db);
}

// Latest-email runs reuse the most recent report artifact and keep SMTP concerns out of the collection cadence.
async function runLatestEmailTask() {
  return await sendLatestReportEmail(config, {
    db,
    sendDailyEmail
  });
}

// S-level timeline alerts are checked separately from reports so urgent events do not wait for the daily mail window.
async function runAiTimelineAlertTask() {
  return await runAiTimelineAlertCycle(config, db);
}

// Manual collection stays lock-guarded so button clicks share the same exclusion rules as scheduled jobs.
const triggerManualCollect = config.manualActions.collectEnabled
  ? async () => {
      await lock.runExclusive(async () => {
        await runCollectionTask("manual");
      });

      return { accepted: true as const, action: "collect" as const };
    }
  : undefined;

// Manual resend normalizes known pipeline failures into machine-readable reasons for the HTTP layer.
const triggerManualSendLatestEmail = config.manualActions.sendLatestEmailEnabled
  ? async () => {
      return await mailLock.runExclusive(async () => {
        try {
          await runLatestEmailTask();
          return { accepted: true as const, action: "send-latest-email" as const };
        } catch (error) {
          if (error instanceof LatestReportEmailError) {
            return { accepted: false as const, reason: error.reason };
          }

          throw error;
        }
      });
    }
  : undefined;

// Twitter 手动采集复用同一把运行锁，但不会触发 RSS/公众号采集，也不会生成日报产物。
const triggerManualTwitterCollect = config.manualActions.collectEnabled
  ? async () => {
      return await twitterLock.runExclusive(async () => await runTwitterAccountCollectionTask());
    }
  : undefined;

// 关键词搜索和账号采集共用运行锁，但继续保持独立按钮和独立结果摘要。
const triggerManualTwitterKeywordCollect = config.manualActions.collectEnabled
  ? async () => {
      return await twitterLock.runExclusive(async () => await runTwitterKeywordCollectionTask());
    }
  : undefined;

// Hacker News 搜索和其他手动采集共用同一把运行锁，但继续保持独立入口和独立结果摘要。
const triggerManualHackerNewsCollect = config.manualActions.collectEnabled
  ? async () => {
      return await hackerNewsLock.runExclusive(async () => await runHackerNewsCollectionTask());
    }
  : undefined;

// B 站搜索与 HN 一样先走独立手动入口，避免默认采集节奏无意扩大到视频搜索。
const triggerManualBilibiliCollect = config.manualActions.collectEnabled
  ? async () => {
      return await bilibiliLock.runExclusive(async () => await runBilibiliCollectionTask());
    }
  : undefined;

// 公众号 RSS 和其他扩展来源一样只走手动入口，避免新增链接后立刻进入默认调度。
const triggerManualWechatRssCollect = config.manualActions.collectEnabled
  ? async () => {
      return await wechatRssLock.runExclusive(async () => await runWechatRssCollectionTask());
    }
  : undefined;

// 微博热搜榜匹配和其他搜索来源共用运行锁，但继续保持单独入口和单独结果摘要。
const triggerManualWeiboTrendingCollect = config.manualActions.collectEnabled
  ? async () => {
      return await weiboLock.runExclusive(async () => await runWeiboTrendingCollectionTask());
    }
  : undefined;

// Juya RSS 独立采集，独占锁避免和全量采集并发；结果映射为 action 响应格式。
const triggerManualJuyaCollect = config.manualActions.collectEnabled
  ? async () => {
      return await juyaLock.runExclusive(async () => {
        const result = await runJuyaCollectionTask();
        if (result.ok) {
          return { accepted: true as const, action: "collect-juya" as const, itemCount: result.itemCount };
        }
        return { accepted: false as const, reason: result.reason ?? "juya-collect-failed" };
      });
    }
  : undefined;

const app = createServer(createRuntimeServerDeps({
  db,
  config,
  creativeApiToken: process.env.CREATIVE_API_TOKEN,
  clientDevOrigin: process.env.HOT_NOW_CLIENT_DEV_ORIGIN?.trim() || undefined,
  hasTwitterApiKey: Boolean(process.env.TWITTER_API_KEY?.trim()),
  isRunning: () => lock.isRunning(),
  triggerManualCollect,
  triggerManualTwitterCollect,
  triggerManualTwitterKeywordCollect,
  triggerManualSendLatestEmail,
  triggerManualHackerNewsCollect,
  triggerManualBilibiliCollect,
  triggerManualWechatRssCollect,
  triggerManualWeiboTrendingCollect,
  triggerManualJuyaCollect
}));

const clientIndexPath = path.resolve(process.cwd(), "dist/client/index.html");

if (!existsSync(clientIndexPath)) {
  app.log.warn(
    { clientIndexPath },
    "未找到客户端入口文件，/settings/* 将回退到最小 HTML 兜底，请先执行 npm run build:client"
  );
}

const collectionScheduler = startCollectionScheduler(config, async () => {
  try {
    await lock.runExclusive(async () => {
      await runCollectionTask("scheduled");
    });
  } catch (error) {
    app.log.error(error);
  }
});

const mailScheduler = startMailScheduler(config, async () => {
  try {
    await mailLock.runExclusive(async () => {
      await runLatestEmailTask();
    });
  } catch (error) {
    app.log.error(error);
  }
});

const aiTimelineAlertScheduler = startAiTimelineAlertScheduler(config, async () => {
  try {
    const result = await aiTimelineAlertLock.runExclusive(async () => await runAiTimelineAlertTask());

    if (result.notifiedEventCount > 0 || result.failedEventCount > 0) {
      app.log.info(result, "AI timeline S-level alert cycle finished");
    }
  } catch (error) {
    app.log.error(error);
  }
});

// 公众号 RSS 独立调度和锁，不受主采集锁阻塞
const wechatRssScheduler = startWechatRssScheduler(config, async () => {
  try {
    await wechatRssLock.runExclusive(async () => await runWechatRssCollectionTask());
  } catch (error) {
    app.log.error(error);
  }
});

await app.listen({ host: "127.0.0.1", port: resolveListenPort(process.env.PORT, config.server.port) });
installGracefulShutdown({
  process,
  exit: (code) => process.exit(code),
  logger: {
    info: (context, message) => app.log.info(context, message),
    error: (context, message) => app.log.error(context, message)
  },
  scheduledTasks: [collectionScheduler, mailScheduler, aiTimelineAlertScheduler, wechatRssScheduler],
  waitForIdle: async () => {
    // 当前版本只需要等采集、发信和 S 级提醒任务收口，LLM 相关运行时已经不再参与主链路。
    while (lock.isRunning() || aiTimelineAlertLock.isRunning()) {
      await wait(100);
    }
  },
  closeServer: async () => {
    await app.close();
  },
  checkpointDatabase: () => {
    checkpointWal(db);
  },
  closeDatabase: () => {
    if (db.open) {
      db.close();
    }
  },
  signals: ["SIGINT", "SIGTERM", "SIGUSR2"]
});

function resolveListenPort(envPort: string | undefined, fallbackPort: number): number {
  // Tests can bind to an ephemeral port with PORT=0 while production keeps the configured fixed port.
  if (!envPort) {
    return fallbackPort;
  }

  const port = Number(envPort);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${envPort}`);
  }

  return port;
}

function wait(ms: number) {
  // Polling is enough here because shutdown happens rarely and only needs a small idle wait.
  return new Promise((resolve) => setTimeout(resolve, ms));
}
