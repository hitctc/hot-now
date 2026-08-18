import { computed, type Ref } from "vue";

import {
  toggleSource,
  updateSource,
  updateSourceDisplayMode,
  triggerManualBilibiliCollect,
  triggerManualCollect,
  triggerManualHackerNewsCollect,
  triggerManualJuyaCollect,
  triggerManualSendLatestEmail,
  triggerManualTwitterCollect,
  triggerManualTwitterKeywordCollect,
  triggerManualWeiboTrendingCollect,
  triggerManualWechatRssCollect,
  type ManualBilibiliCollectResponse,
  type ManualCollectResponse,
  type ManualHackerNewsCollectResponse,
  type ManualJuyaCollectResponse,
  type ManualSendLatestEmailResponse,
  type ManualTwitterCollectResponse,
  type ManualTwitterKeywordCollectResponse,
  type ManualWeiboTrendingCollectResponse,
  type ManualWechatRssCollectResponse,
  type SettingsSourceItem,
  type SettingsSourcesResponse,
} from "../../../services/settingsApi";

export type SourcesActionRunner = <T>(
  actionKey: string,
  action: () => Promise<T>,
  options: {
    fallbackMessage: string;
    successMessage: string | ((result: T) => string);
    reasonMessages?: Record<string, string>;
  }
) => Promise<void>;

type SourcesCollectionActionsOptions = {
  sourcesModel: Ref<SettingsSourcesResponse | null>;
  loadSources: (options?: { silent?: boolean }) => Promise<boolean>;
  showNotice: (tone: "success" | "info" | "warning" | "error", message: string) => void;
  isActionPending: (actionKey: string) => boolean;
  setPendingAction: (actionKey: string, pending: boolean) => void;
  readActionErrorMessage: (error: unknown, fallbackMessage: string, reasonMessages?: Record<string, string>) => string;
};

/** 管理来源页的采集、启停和邮件动作，避免控制器同时承载所有业务操作。 */
export function useSourcesCollectionActions(options: SourcesCollectionActionsOptions) {
  const {
    sourcesModel,
    loadSources,
    showNotice,
    isActionPending,
    setPendingAction,
    readActionErrorMessage,
  } = options;

  // 页内动作都走统一包装，复用 pending、静默刷新和 reason 翻译。
  async function runSourcesAction<T>(
    actionKey: string,
    action: () => Promise<T>,
    options: {
      fallbackMessage: string;
      successMessage: string | ((result: T) => string);
      reasonMessages?: Record<string, string>;
    }
  ): Promise<void> {
    if (isActionPending(actionKey)) {
      return;
    }

    setPendingAction(actionKey, true);

    try {
      const result = await action();
      const refreshed = await loadSources({ silent: true });
      const message = typeof options.successMessage === "function" ? options.successMessage(result) : options.successMessage;
      showNotice("success", refreshed ? message : `${message} 但最新数据刷新失败，请稍后手动刷新。`);
    } catch (error) {
      showNotice(
        "error",
        readActionErrorMessage(error, options.fallbackMessage, options.reasonMessages ?? {})
      );
    } finally {
      setPendingAction(actionKey, false);
    }
  }

  // source 开关永远基于当前状态反转，再交给后端落地。
  async function handleToggleSource(source: SettingsSourceItem): Promise<void> {
    const nextEnable = !source.isEnabled;

    await runSourcesAction(
      `toggle:${source.kind}`,
      () => toggleSource(source.kind, nextEnable),
      {
        fallbackMessage: "source 状态切换失败，请稍后再试。",
        successMessage: nextEnable ? "已启用 source。" : "已停用 source。",
        reasonMessages: {
          "invalid-source-kind": "source kind 不合法，无法切换。",
          "invalid-source-enable": "source 启用状态参数不合法。",
          "not-found": "对应 source 不存在，可能已被移除。"
        }
      }
    );
  }

  // 展示模式开关只改当前 source 的浏览策略，不影响采集启停或最近抓取状态。
  async function handleToggleSourceDisplayMode(source: SettingsSourceItem): Promise<void> {
    const nextShowAllWhenSelected = !source.showAllWhenSelected;

    await runSourcesAction(
      `display-mode:${source.kind}`,
      () => updateSourceDisplayMode(source.kind, nextShowAllWhenSelected),
      {
        fallbackMessage: "source 展示模式切换失败，请稍后再试。",
        successMessage: nextShowAllWhenSelected ? "已开启选中时全量展示。" : "已关闭选中时全量展示。",
        reasonMessages: {
          "invalid-source-kind": "source kind 不合法，无法更新展示模式。",
          "invalid-source-display-mode": "source 展示模式参数不合法。",
          "not-found": "对应 source 不存在，可能已被移除。"
        }
      }
    );
  }

  // 手动采集只负责发起任务，具体结果依旧由后端流水线处理。
  async function handleManualCollect(): Promise<void> {
    await runSourcesAction("manual:collect", () => triggerManualCollect(), {
      fallbackMessage: "采集任务启动失败，请稍后再试。",
      successMessage: (result: ManualCollectResponse) =>
        result.accepted ? "已开始执行采集，请稍后刷新查看结果。" : "采集任务未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // Twitter 账号采集单独执行，并把启用账号数、入库条数和失败数直接回显给操作人。
  async function handleManualTwitterCollect(): Promise<void> {
    await runSourcesAction("manual:twitter-collect", () => triggerManualTwitterCollect(), {
      fallbackMessage: "Twitter 账号采集启动失败，请稍后再试。",
      successMessage: (result: ManualTwitterCollectResponse) =>
        result.accepted
          ? `Twitter 账号采集已完成：启用 ${result.enabledAccountCount} 个账号，入库 ${result.persistedContentItemCount} 条内容，失败 ${result.failureCount} 个。`
          : "Twitter 账号采集未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        "twitter-api-key-missing": "当前环境未配置 TWITTER_API_KEY，暂时无法采集 Twitter 账号。",
        "no-enabled-twitter-accounts": "当前没有启用中的 Twitter 账号，请先启用至少一个账号。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // 关键词搜索只保留手动执行，成功提示会直接回显本轮处理关键词数与复用条数，便于控制 credits。
  async function handleManualTwitterKeywordCollect(): Promise<void> {
    await runSourcesAction("manual:twitter-keyword-collect", () => triggerManualTwitterKeywordCollect(), {
      fallbackMessage: "Twitter 关键词采集启动失败，请稍后再试。",
      successMessage: (result: ManualTwitterKeywordCollectResponse) =>
        result.accepted
          ? `Twitter 关键词采集已完成：处理 ${result.processedKeywordCount} 个关键词，新入库 ${result.persistedContentItemCount} 条，复用 ${result.reusedContentItemCount} 条，失败 ${result.failureCount} 个。`
          : "Twitter 关键词采集未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        "twitter-api-key-missing": "当前环境未配置 TWITTER_API_KEY，暂时无法采集 Twitter 关键词。",
        "no-enabled-twitter-keywords": "当前没有启用中的 Twitter 关键词，请先启用至少一个关键词。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // HN 搜索第一版只走手动执行，成功提示直接回显处理 query 数、入库条数和复用条数。
  async function handleManualHackerNewsCollect(): Promise<void> {
    await runSourcesAction("manual:hackernews-collect", () => triggerManualHackerNewsCollect(), {
      fallbackMessage: "Hacker News 搜索启动失败，请稍后再试。",
      successMessage: (result: ManualHackerNewsCollectResponse) =>
        result.accepted
          ? `Hacker News 搜索已完成：处理 ${result.processedQueryCount} 个 query，新入库 ${result.persistedContentItemCount} 条，复用 ${result.reusedContentItemCount} 条，失败 ${result.failureCount} 个。`
          : "Hacker News 搜索未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        "no-enabled-hackernews-queries": "当前没有启用中的 Hacker News query，请先启用至少一个 query。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // B 站第一版也只保留手动采集，并把 query 数、入库数和复用数直接展示出来。
  async function handleManualBilibiliCollect(): Promise<void> {
    await runSourcesAction("manual:bilibili-collect", () => triggerManualBilibiliCollect(), {
      fallbackMessage: "B 站搜索启动失败，请稍后再试。",
      successMessage: (result: ManualBilibiliCollectResponse) =>
        result.accepted
          ? `B 站搜索已完成：处理 ${result.processedQueryCount} 个 query，新入库 ${result.persistedContentItemCount} 条，复用 ${result.reusedContentItemCount} 条，失败 ${result.failureCount} 个。`
          : "B 站搜索未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        "no-enabled-bilibili-queries": "当前没有启用中的 B 站 query，请先启用至少一个 query。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // 公众号 RSS 只在用户明确点击时抓取，成功提示直接回显本轮写入和失败情况。
  async function handleManualWechatRssCollect(): Promise<void> {
    await runSourcesAction("manual:wechat-rss-collect", () => triggerManualWechatRssCollect(), {
      fallbackMessage: "微信公众号 RSS 采集启动失败，请稍后再试。",
      successMessage: (result: ManualWechatRssCollectResponse) =>
        result.accepted
          ? `微信公众号 RSS 采集已完成：启用 ${result.enabledSourceCount} 个 RSS，抓取 ${result.fetchedItemCount} 条，写入/更新 ${result.persistedContentItemCount} 条，失败 ${result.failureCount} 个。`
          : "微信公众号 RSS 采集未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        "no-enabled-wechat-rss-sources": "当前没有可采集的微信公众号 RSS，请先新增至少一个 RSS 链接。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // 微博热搜榜只做固定 AI 关键词匹配，因此这里只有单一手动入口，没有额外 CRUD。
  async function handleManualWeiboTrendingCollect(): Promise<void> {
    await runSourcesAction("manual:weibo-trending-collect", () => triggerManualWeiboTrendingCollect(), {
      fallbackMessage: "微博热搜榜匹配启动失败，请稍后再试。",
      successMessage: (result: ManualWeiboTrendingCollectResponse) =>
        result.accepted
          ? `微博热搜榜匹配已完成：命中 ${result.matchedTopicCount} 个话题，新入库 ${result.persistedContentItemCount} 条，复用 ${result.reusedContentItemCount} 条，失败 ${result.failureCount} 次。`
          : "微博热搜榜匹配未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // juya RSS 从 sources 数组里筛出（kind=juya），独立展示在配置卡上。
  const juyaSource = computed<SettingsSourceItem | null>(
    () => sourcesModel.value?.sources.find((s) => s.kind === "juya") ?? null
  );

  // juya 启停复用通用 toggleSource，actionKey 区分 pending 状态。
  async function handleToggleJuya(enable: boolean): Promise<void> {
    await runSourcesAction("juya:toggle", () => toggleSource("juya", enable), {
      fallbackMessage: "Juya 采集状态切换失败，请稍后再试。",
      successMessage: enable ? "已启用 Juya 采集。" : "已停用 Juya 采集。",
      reasonMessages: {
        "not-found": "Juya 来源不存在，可能数据异常。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // juya RSS 地址编辑复用 updateSource（sourceType=rss，只传 rssUrl）。
  async function handleSaveJuyaRss(rssUrl: string): Promise<void> {
    await runSourcesAction("juya:save", () => updateSource({ kind: "juya", sourceType: "rss", rssUrl }), {
      fallbackMessage: "Juya RSS 地址保存失败，请稍后再试。",
      successMessage: "Juya RSS 地址已更新，下一轮采集生效。",
      reasonMessages: {
        "invalid-rss-feed": "RSS 地址无效，请检查后重试。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // juya 独立手动采集，只抓 juya 一个源，不触发全量采集。
  async function handleManualJuyaCollect(): Promise<void> {
    await runSourcesAction("manual:juya-collect", () => triggerManualJuyaCollect(), {
      fallbackMessage: "Juya 采集启动失败，请稍后再试。",
      successMessage: (result: ManualJuyaCollectResponse) =>
        result.accepted ? `Juya 采集已完成，抓取 ${result.itemCount} 条。` : "Juya 采集未成功。",
      reasonMessages: {
        "juya-source-not-found": "Juya 来源不存在，请检查数据。",
        "juya-rss-url-empty": "Juya RSS 地址为空，请先配置。",
        "juya-fetch-failed": "RSS 地址无法访问，请检查地址是否正确。",
        unauthorized: "请先登录后再操作。"
      }
    });
  }

  // 手动发送最新报告邮件沿用后端错误原因映射，用户能直接看懂当前阻塞点。
  async function handleManualSendLatestEmail(): Promise<void> {
    await runSourcesAction("manual:send-latest-email", () => triggerManualSendLatestEmail(), {
      fallbackMessage: "最新报告发送失败，请稍后再试。",
      successMessage: (result: ManualSendLatestEmailResponse) =>
        result.accepted ? "已开始发送最新报告邮件，请稍后检查投递结果。" : "最新报告发送未成功启动。",
      reasonMessages: {
        "already-running": "当前已有任务执行中，请稍后再试。",
        "not-found": "最新报告不存在，请先执行一次采集。",
        "report-unavailable": "最新报告暂不可用，请稍后再试。",
        "send-failed": "最新报告发送失败，请检查 SMTP 配置后重试。"
      }
    });
  }

  return {
    runSourcesAction,
    handleToggleSource,
    handleToggleSourceDisplayMode,
    handleManualCollect,
    handleManualTwitterCollect,
    handleManualTwitterKeywordCollect,
    handleManualHackerNewsCollect,
    handleManualBilibiliCollect,
    handleManualWechatRssCollect,
    handleManualWeiboTrendingCollect,
    juyaSource,
    handleToggleJuya,
    handleSaveJuyaRss,
    handleManualJuyaCollect,
    handleManualSendLatestEmail,
  };
}
