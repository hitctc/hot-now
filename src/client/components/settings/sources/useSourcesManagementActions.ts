import {
  createBilibiliQuery,
  createHackerNewsQuery,
  createTwitterAccount,
  createTwitterSearchKeyword,
  createWechatRssSources,
  createSource,
  deleteBilibiliQuery,
  deleteHackerNewsQuery,
  deleteTwitterAccount,
  deleteTwitterSearchKeyword,
  deleteWechatRssSource,
  deleteSource,
  toggleBilibiliQuery,
  toggleHackerNewsQuery,
  toggleTwitterAccount,
  toggleTwitterSearchKeywordCollect,
  toggleTwitterSearchKeywordVisible,
  updateBilibiliQuery,
  updateHackerNewsQuery,
  updateTwitterAccount,
  updateTwitterSearchKeyword,
  updateWechatRssSource,
  updateSource,
  type SettingsBilibiliQuery,
  type SettingsHackerNewsQuery,
  type SettingsSourceItem,
  type SettingsTwitterAccount,
  type SettingsTwitterSearchKeyword,
  type SettingsWechatRssSource,
  type UpdateWechatRssSourcePayload,
} from "../../../services/settingsApi";
import { useSourcesPageForms } from "./useSourcesPageForms";
import type { SourcesActionRunner } from "./useSourcesCollectionActions";

type SourcesPageForms = ReturnType<typeof useSourcesPageForms>;

type SourcesManagementActionsOptions = {
  forms: SourcesPageForms;
  loadSources: (options?: { silent?: boolean }) => Promise<boolean>;
  showNotice: (tone: "success" | "info" | "warning" | "error", message: string) => void;
  isActionPending: (actionKey: string) => boolean;
  setPendingAction: (actionKey: string, pending: boolean) => void;
  readActionErrorMessage: (error: unknown, fallbackMessage: string, reasonMessages?: Record<string, string>) => string;
  runSourcesAction: SourcesActionRunner;
};

/** 管理来源配置弹窗的保存、切换和删除，表单状态继续由 useSourcesPageForms 持有。 */
export function useSourcesManagementActions(options: SourcesManagementActionsOptions) {
  const {
    forms,
    loadSources,
    showNotice,
    isActionPending,
    setPendingAction,
    readActionErrorMessage,
    runSourcesAction,
  } = options;
  const {
    sourceModalMode,
    twitterAccountModalMode,
    twitterKeywordModalMode,
    hackerNewsQueryModalMode,
    bilibiliQueryModalMode,
    wechatRssModalMode,
    sourceFormError,
    twitterAccountFormError,
    twitterKeywordFormError,
    hackerNewsQueryFormError,
    bilibiliQueryFormError,
    wechatRssFormError,
    closeSourceModal,
    closeTwitterAccountModal,
    closeTwitterKeywordModal,
    closeHackerNewsQueryModal,
    closeBilibiliQueryModal,
    closeWechatRssModal,
    buildSourceSavePayload,
    buildTwitterAccountSavePayload,
    buildTwitterKeywordSavePayload,
    buildHackerNewsQuerySavePayload,
    buildBilibiliQuerySavePayload,
    buildWechatRssCreatePayload,
    buildWechatRssUpdatePayload,
  } = forms;

  // 来源保存沿用现有 notice + toast 约定；普通来源弹窗只提交 RSS payload。
  async function handleSubmitSource(): Promise<void> {
    if (isActionPending("source:submit")) {
      return;
    }

    const payload = buildSourceSavePayload();

    if (!payload.ok) {
      sourceFormError.value = payload.message;
      return;
    }

    sourceFormError.value = null;
    setPendingAction("source:submit", true);

    try {
      if (sourceModalMode.value === "create") {
        await createSource(payload.payload);
      } else {
        await updateSource(payload.payload);
      }

      const refreshed = await loadSources({ silent: true });
      closeSourceModal();
      showNotice(
        "success",
        refreshed
          ? sourceModalMode.value === "create"
            ? "已新增来源。"
            : "已更新来源。"
          : sourceModalMode.value === "create"
            ? "已新增来源，但最新数据刷新失败，请稍后手动刷新。"
            : "已更新来源，但最新数据刷新失败，请稍后手动刷新。"
      );
    } catch (error) {
      const message = readActionErrorMessage(
        error,
        sourceModalMode.value === "create" ? "来源保存失败，请稍后再试。" : "来源更新失败，请稍后再试。",
        {
          "already-exists": "系统生成的来源标识已存在，请换一个链接或名称后重试。",
          "not-found": "对应来源不存在，可能已被移除。",
          "built-in": "内置来源不允许编辑。",
          "invalid-input": "来源配置不合法，请检查后重试。",
          "invalid-rss-feed": "这个 RSS 地址暂时无法识别，请检查链接是否正确。"
        }
      );

      sourceFormError.value = message;
      showNotice("error", message);
    } finally {
      setPendingAction("source:submit", false);
    }
  }

  async function handleSubmitTwitterAccount(): Promise<void> {
    if (isActionPending("twitter-account:submit")) {
      return;
    }

    const payload = buildTwitterAccountSavePayload();

    if (!payload.ok) {
      twitterAccountFormError.value = payload.message;
      return;
    }

    twitterAccountFormError.value = null;
    setPendingAction("twitter-account:submit", true);

    try {
      if (twitterAccountModalMode.value === "create") {
        await createTwitterAccount(payload.payload);
      } else {
        await updateTwitterAccount(payload.payload);
      }

      const refreshed = await loadSources({ silent: true });
      closeTwitterAccountModal();
      showNotice(
        "success",
        refreshed
          ? twitterAccountModalMode.value === "create"
            ? "已新增 Twitter 账号。"
            : "已更新 Twitter 账号。"
          : twitterAccountModalMode.value === "create"
            ? "已新增 Twitter 账号，但最新数据刷新失败，请稍后手动刷新。"
            : "已更新 Twitter 账号，但最新数据刷新失败，请稍后手动刷新。"
      );
    } catch (error) {
      const message = readActionErrorMessage(
        error,
        twitterAccountModalMode.value === "create" ? "Twitter 账号保存失败，请稍后再试。" : "Twitter 账号更新失败，请稍后再试。",
        {
          "invalid-username": "Twitter username 不合法，请检查后重试。",
          "invalid-category": "Twitter 账号分类不合法。",
          "invalid-priority": "Twitter 账号优先级不合法。",
          "duplicate-username": "这个 Twitter username 已存在。",
          "not-found": "对应 Twitter 账号不存在，可能已被移除。"
        }
      );

      twitterAccountFormError.value = message;
      showNotice("error", message);
    } finally {
      setPendingAction("twitter-account:submit", false);
    }
  }

  async function handleSubmitTwitterKeyword(): Promise<void> {
    if (isActionPending("twitter-keyword:submit")) {
      return;
    }

    const payload = buildTwitterKeywordSavePayload();

    if (!payload.ok) {
      twitterKeywordFormError.value = payload.message;
      return;
    }

    twitterKeywordFormError.value = null;
    setPendingAction("twitter-keyword:submit", true);

    try {
      if (twitterKeywordModalMode.value === "create") {
        await createTwitterSearchKeyword(payload.payload);
      } else {
        await updateTwitterSearchKeyword(payload.payload);
      }

      const refreshed = await loadSources({ silent: true });
      closeTwitterKeywordModal();
      showNotice(
        "success",
        refreshed
          ? twitterKeywordModalMode.value === "create"
            ? "已新增 Twitter 关键词。"
            : "已更新 Twitter 关键词。"
          : twitterKeywordModalMode.value === "create"
            ? "已新增 Twitter 关键词，但最新数据刷新失败，请稍后手动刷新。"
            : "已更新 Twitter 关键词，但最新数据刷新失败，请稍后手动刷新。"
      );
    } catch (error) {
      const message = readActionErrorMessage(
        error,
        twitterKeywordModalMode.value === "create" ? "Twitter 关键词保存失败，请稍后再试。" : "Twitter 关键词更新失败，请稍后再试。",
        {
          "invalid-keyword": "Twitter 关键词不合法，请检查后重试。",
          "invalid-category": "Twitter 关键词分类不合法。",
          "invalid-priority": "Twitter 关键词优先级不合法。",
          "duplicate-keyword": "这个 Twitter 关键词已存在。",
          "not-found": "对应 Twitter 关键词不存在，可能已被移除。"
        }
      );

      twitterKeywordFormError.value = message;
      showNotice("error", message);
    } finally {
      setPendingAction("twitter-keyword:submit", false);
    }
  }

  async function handleSubmitHackerNewsQuery(): Promise<void> {
    if (isActionPending("hackernews-query:submit")) {
      return;
    }

    const payload = buildHackerNewsQuerySavePayload();

    if (!payload.ok) {
      hackerNewsQueryFormError.value = payload.message;
      return;
    }

    hackerNewsQueryFormError.value = null;
    setPendingAction("hackernews-query:submit", true);

    try {
      if (hackerNewsQueryModalMode.value === "create") {
        await createHackerNewsQuery(payload.payload);
      } else {
        await updateHackerNewsQuery(payload.payload);
      }

      const refreshed = await loadSources({ silent: true });
      closeHackerNewsQueryModal();
      showNotice(
        "success",
        refreshed
          ? hackerNewsQueryModalMode.value === "create"
            ? "已新增 Hacker News query。"
            : "已更新 Hacker News query。"
          : hackerNewsQueryModalMode.value === "create"
            ? "已新增 Hacker News query，但最新数据刷新失败，请稍后手动刷新。"
            : "已更新 Hacker News query，但最新数据刷新失败，请稍后手动刷新。"
      );
    } catch (error) {
      const message = readActionErrorMessage(
        error,
        hackerNewsQueryModalMode.value === "create" ? "Hacker News query 保存失败，请稍后再试。" : "Hacker News query 更新失败，请稍后再试。",
        {
          "invalid-hackernews-query": "Hacker News 查询词不合法，请检查后重试。",
          "invalid-priority": "Hacker News query 优先级不合法。",
          "duplicate-query": "这个 Hacker News query 已存在。",
          "invalid-hackernews-query-payload": "Hacker News query 配置不完整，请检查后重试。",
          "hackernews-disabled": "当前环境未启用 Hacker News 搜索。",
          "not-found": "对应 Hacker News query 不存在，可能已被移除。"
        }
      );

      hackerNewsQueryFormError.value = message;
      showNotice("error", message);
    } finally {
      setPendingAction("hackernews-query:submit", false);
    }
  }

  async function handleSubmitBilibiliQuery(): Promise<void> {
    if (isActionPending("bilibili-query:submit")) {
      return;
    }

    const payload = buildBilibiliQuerySavePayload();

    if (!payload.ok) {
      bilibiliQueryFormError.value = payload.message;
      return;
    }

    bilibiliQueryFormError.value = null;
    setPendingAction("bilibili-query:submit", true);

    try {
      if (bilibiliQueryModalMode.value === "create") {
        await createBilibiliQuery(payload.payload);
      } else {
        await updateBilibiliQuery(payload.payload);
      }

      const refreshed = await loadSources({ silent: true });
      closeBilibiliQueryModal();
      showNotice(
        "success",
        refreshed
          ? bilibiliQueryModalMode.value === "create"
            ? "已新增 B 站 query。"
            : "已更新 B 站 query。"
          : bilibiliQueryModalMode.value === "create"
            ? "已新增 B 站 query，但最新数据刷新失败，请稍后手动刷新。"
            : "已更新 B 站 query，但最新数据刷新失败，请稍后手动刷新。"
      );
    } catch (error) {
      const message = readActionErrorMessage(
        error,
        bilibiliQueryModalMode.value === "create" ? "B 站 query 保存失败，请稍后再试。" : "B 站 query 更新失败，请稍后再试。",
        {
          "invalid-bilibili-query": "B 站查询词不合法，请检查后重试。",
          "invalid-priority": "B 站 query 优先级不合法。",
          "duplicate-query": "这个 B 站 query 已存在。",
          "invalid-bilibili-query-payload": "B 站 query 配置不完整，请检查后重试。",
          "bilibili-disabled": "当前环境未启用 B 站搜索。",
          "not-found": "对应 B 站 query 不存在，可能已被移除。"
        }
      );

      bilibiliQueryFormError.value = message;
      showNotice("error", message);
    } finally {
      setPendingAction("bilibili-query:submit", false);
    }
  }

  async function handleSubmitWechatRssSources(): Promise<void> {
    if (isActionPending("wechat-rss:submit")) {
      return;
    }

    const payload =
      wechatRssModalMode.value === "create"
        ? buildWechatRssCreatePayload()
        : buildWechatRssUpdatePayload();

    if (!payload.ok) {
      wechatRssFormError.value = payload.message;
      return;
    }

    wechatRssFormError.value = null;
    setPendingAction("wechat-rss:submit", true);

    try {
      const result =
        wechatRssModalMode.value === "create"
          ? await createWechatRssSources(payload.payload as { rssUrls: string })
          : await updateWechatRssSource(payload.payload as UpdateWechatRssSourcePayload);
      const refreshed = await loadSources({ silent: true });
      closeWechatRssModal();

      if (wechatRssModalMode.value === "update") {
        showNotice(
          "success",
          refreshed ? "已更新微信公众号 RSS。" : "已更新微信公众号 RSS，但最新数据刷新失败，请稍后手动刷新。"
        );
        return;
      }

      const createResult = result as Awaited<ReturnType<typeof createWechatRssSources>>;
      const skippedText = createResult.skippedDuplicateUrls.length > 0
        ? `，跳过重复 ${createResult.skippedDuplicateUrls.length} 条`
        : "";
      showNotice(
        "success",
        refreshed
          ? `已新增 ${createResult.created.length} 条微信公众号 RSS${skippedText}。`
          : `已新增 ${createResult.created.length} 条微信公众号 RSS${skippedText}，但最新数据刷新失败，请稍后手动刷新。`
      );
    } catch (error) {
      const notice = readActionErrorMessage(
        error,
        wechatRssModalMode.value === "create"
          ? "微信公众号 RSS 保存失败，请稍后再试。"
          : "微信公众号 RSS 更新失败，请稍后再试。",
        {
          "empty-rss-url-list": "请至少填写一个微信公众号 RSS 链接。",
          "invalid-rss-url": "存在不合法的 RSS 链接，请检查后重试。",
          "invalid-id": "微信公众号 RSS ID 不合法。",
          "invalid-wechat-rss-source-id": "微信公众号 RSS ID 不合法。",
          "duplicate-rss-url": "这个微信公众号 RSS 地址已存在。",
          "not-found": "对应微信公众号 RSS 不存在，可能已被移除。",
          "invalid-wechat-rss-payload": "微信公众号 RSS 配置不完整，请检查后重试。",
          "wechat-rss-disabled": "当前环境未启用微信公众号 RSS。"
        }
      );

      wechatRssFormError.value = notice;
      showNotice("error", notice);
    } finally {
      setPendingAction("wechat-rss:submit", false);
    }
  }

  async function handleToggleTwitterAccount(account: SettingsTwitterAccount): Promise<void> {
    const nextEnable = !account.isEnabled;

    await runSourcesAction(
      `twitter-toggle:${account.id}`,
      () => toggleTwitterAccount(account.id, nextEnable),
      {
        fallbackMessage: "Twitter 账号状态切换失败，请稍后再试。",
        successMessage: nextEnable ? "已启用 Twitter 账号。" : "已停用 Twitter 账号。",
        reasonMessages: {
          "invalid-twitter-account-id": "Twitter 账号 ID 不合法。",
          "invalid-twitter-account-enable": "Twitter 账号启用状态参数不合法。",
          "not-found": "对应 Twitter 账号不存在，可能已被移除。"
        }
      }
    );
  }

  async function handleDeleteTwitterAccount(account: SettingsTwitterAccount): Promise<void> {
    await runSourcesAction(`twitter-delete:${account.id}`, () => deleteTwitterAccount(account.id), {
      fallbackMessage: "删除 Twitter 账号失败，请稍后再试。",
      successMessage: "已删除 Twitter 账号。",
      reasonMessages: {
        "invalid-twitter-account-id": "Twitter 账号 ID 不合法。",
        "not-found": "对应 Twitter 账号不存在，可能已被移除。"
      }
    });
  }

  async function handleToggleTwitterKeywordCollect(keyword: SettingsTwitterSearchKeyword): Promise<void> {
    const nextEnable = !keyword.isCollectEnabled;

    await runSourcesAction(
      `twitter-keyword-collect-toggle:${keyword.id}`,
      () => toggleTwitterSearchKeywordCollect(keyword.id, nextEnable),
      {
        fallbackMessage: "Twitter 关键词采集开关更新失败，请稍后再试。",
        successMessage: nextEnable ? "已启用 Twitter 关键词采集。" : "已停用 Twitter 关键词采集。",
        reasonMessages: {
          "invalid-twitter-keyword-id": "Twitter 关键词 ID 不合法。",
          "invalid-twitter-keyword-collect-enable": "Twitter 关键词采集开关参数不合法。",
          "not-found": "对应 Twitter 关键词不存在，可能已被移除。"
        }
      }
    );
  }

  async function handleToggleTwitterKeywordVisible(keyword: SettingsTwitterSearchKeyword): Promise<void> {
    const nextEnable = !keyword.isVisible;

    await runSourcesAction(
      `twitter-keyword-visible-toggle:${keyword.id}`,
      () => toggleTwitterSearchKeywordVisible(keyword.id, nextEnable),
      {
        fallbackMessage: "Twitter 关键词展示开关更新失败，请稍后再试。",
        successMessage: nextEnable ? "已开启 Twitter 关键词展示。" : "已关闭 Twitter 关键词展示。",
        reasonMessages: {
          "invalid-twitter-keyword-id": "Twitter 关键词 ID 不合法。",
          "invalid-twitter-keyword-visible-enable": "Twitter 关键词展示开关参数不合法。",
          "not-found": "对应 Twitter 关键词不存在，可能已被移除。"
        }
      }
    );
  }

  async function handleDeleteTwitterKeyword(keyword: SettingsTwitterSearchKeyword): Promise<void> {
    await runSourcesAction(`twitter-keyword-delete:${keyword.id}`, () => deleteTwitterSearchKeyword(keyword.id), {
      fallbackMessage: "删除 Twitter 关键词失败，请稍后再试。",
      successMessage: "已删除 Twitter 关键词。",
      reasonMessages: {
        "invalid-twitter-keyword-id": "Twitter 关键词 ID 不合法。",
        "not-found": "对应 Twitter 关键词不存在，可能已被移除。"
      }
    });
  }

  async function handleToggleHackerNewsQuery(query: SettingsHackerNewsQuery): Promise<void> {
    const nextEnable = !query.isEnabled;

    await runSourcesAction(
      `hackernews-toggle:${query.id}`,
      () => toggleHackerNewsQuery(query.id, nextEnable),
      {
        fallbackMessage: "Hacker News query 开关更新失败，请稍后再试。",
        successMessage: nextEnable ? "已启用 Hacker News query。" : "已停用 Hacker News query。",
        reasonMessages: {
          "invalid-hackernews-query-id": "Hacker News query ID 不合法。",
          "invalid-hackernews-query-enable": "Hacker News query 开关参数不合法。",
          "hackernews-disabled": "当前环境未启用 Hacker News 搜索。",
          "not-found": "对应 Hacker News query 不存在，可能已被移除。"
        }
      }
    );
  }

  async function handleDeleteHackerNewsQuery(query: SettingsHackerNewsQuery): Promise<void> {
    await runSourcesAction(`hackernews-delete:${query.id}`, () => deleteHackerNewsQuery(query.id), {
      fallbackMessage: "删除 Hacker News query 失败，请稍后再试。",
      successMessage: "已删除 Hacker News query。",
      reasonMessages: {
        "invalid-hackernews-query-id": "Hacker News query ID 不合法。",
        "hackernews-disabled": "当前环境未启用 Hacker News 搜索。",
        "not-found": "对应 Hacker News query 不存在，可能已被移除。"
      }
    });
  }

  async function handleToggleBilibiliQuery(query: SettingsBilibiliQuery): Promise<void> {
    const nextEnable = !query.isEnabled;

    await runSourcesAction(
      `bilibili-toggle:${query.id}`,
      () => toggleBilibiliQuery(query.id, nextEnable),
      {
        fallbackMessage: "B 站 query 开关更新失败，请稍后再试。",
        successMessage: nextEnable ? "已启用 B 站 query。" : "已停用 B 站 query。",
        reasonMessages: {
          "invalid-bilibili-query-id": "B 站 query ID 不合法。",
          "invalid-bilibili-query-enable": "B 站 query 开关参数不合法。",
          "bilibili-disabled": "当前环境未启用 B 站搜索。",
          "not-found": "对应 B 站 query 不存在，可能已被移除。"
        }
      }
    );
  }

  async function handleDeleteBilibiliQuery(query: SettingsBilibiliQuery): Promise<void> {
    await runSourcesAction(`bilibili-delete:${query.id}`, () => deleteBilibiliQuery(query.id), {
      fallbackMessage: "删除 B 站 query 失败，请稍后再试。",
      successMessage: "已删除 B 站 query。",
      reasonMessages: {
        "invalid-bilibili-query-id": "B 站 query ID 不合法。",
        "bilibili-disabled": "当前环境未启用 B 站搜索。",
        "not-found": "对应 B 站 query 不存在，可能已被移除。"
      }
    });
  }

  async function handleDeleteWechatRssSource(source: SettingsWechatRssSource): Promise<void> {
    await runSourcesAction(`wechat-rss-delete:${source.id}`, () => deleteWechatRssSource(source.id), {
      fallbackMessage: "删除微信公众号 RSS 失败，请稍后再试。",
      successMessage: "已删除微信公众号 RSS 配置。",
      reasonMessages: {
        "invalid-wechat-rss-source-id": "微信公众号 RSS ID 不合法。",
        "wechat-rss-disabled": "当前环境未启用微信公众号 RSS。",
        "not-found": "对应微信公众号 RSS 不存在，可能已被移除。"
      }
    });
  }

  // 删除动作只开放给自定义来源，是否允许真正删除仍由后端按 built-in / in-use 决定。
  async function handleDeleteSource(source: SettingsSourceItem): Promise<void> {
    await runSourcesAction(`delete:${source.kind}`, () => deleteSource(source.kind), {
      fallbackMessage: "删除来源失败，请稍后再试。",
      successMessage: "已删除自定义来源。",
      reasonMessages: {
        "not-found": "对应来源不存在，可能已被移除。",
        "built-in": "内置来源不允许删除。",
        "in-use": "该来源已有采集内容，当前不允许删除。"
      }
    });
  }

  return {
    handleSubmitSource,
    handleSubmitTwitterAccount,
    handleSubmitTwitterKeyword,
    handleSubmitHackerNewsQuery,
    handleSubmitBilibiliQuery,
    handleSubmitWechatRssSources,
    handleToggleTwitterAccount,
    handleDeleteTwitterAccount,
    handleToggleTwitterKeywordCollect,
    handleToggleTwitterKeywordVisible,
    handleDeleteTwitterKeyword,
    handleToggleHackerNewsQuery,
    handleDeleteHackerNewsQuery,
    handleToggleBilibiliQuery,
    handleDeleteBilibiliQuery,
    handleDeleteWechatRssSource,
    handleDeleteSource,
  };
}
