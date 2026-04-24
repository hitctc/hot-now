import { HttpError, requestJson } from "./http";

export type SettingsProfile = {
  username: string;
  displayName: string;
  role: string;
  email: string | null;
  loggedIn: boolean;
};

export type SettingsProfileResponse = {
  profile: SettingsProfile | null;
};

export type SettingsProviderKind = "deepseek" | "minimax" | "kimi";

export type SettingsProviderSettingsSummary = {
  providerKind: SettingsProviderKind | string;
  apiKeyLast4: string;
  isEnabled: boolean;
  updatedAt: string;
};

export type SettingsProviderCapability = {
  hasMasterKey: boolean;
  featureAvailable: boolean;
  message: string;
};

export type SettingsContentFilterToggles = {
  enableTimeWindow: boolean;
  enableSourceViewBonus: boolean;
  enableAiKeywordWeight: boolean;
  enableHeatKeywordWeight: boolean;
  enableFreshnessWeight: boolean;
  enableScoreRanking: boolean;
};

export type SettingsContentFilterWeights = {
  freshnessWeight: number;
  sourceWeight: number;
  completenessWeight: number;
  aiWeight: number;
  heatWeight: number;
};

export type SettingsContentFilterRule = {
  ruleKey: "ai" | "hot";
  displayName: string;
  summary: string;
  toggles: SettingsContentFilterToggles;
  weights: SettingsContentFilterWeights;
};

export type SettingsFeedbackPoolItem = {
  id: number;
  contentItemId: number;
  contentTitle: string;
  canonicalUrl: string;
  sourceName: string;
  freeText: string | null;
  suggestedEffect: string | null;
  strengthLevel: string | null;
  positiveKeywords: string[];
  negativeKeywords: string[];
  createdAt: string;
  updatedAt: string;
};

export type SettingsViewRulesResponse = {
  filterWorkbench: {
    aiRule: SettingsContentFilterRule;
    hotRule: SettingsContentFilterRule;
  };
  providerSettings: SettingsProviderSettingsSummary[];
  providerCapability: SettingsProviderCapability;
  feedbackPool: SettingsFeedbackPoolItem[];
};
export type SaveContentFilterRulePayload = {
  ruleKey: "ai" | "hot";
  toggles: SettingsContentFilterToggles;
  weights: SettingsContentFilterWeights;
};
export type SaveContentFilterRuleResponse = {
  ok: true;
  ruleKey: "ai" | "hot";
};
export type SettingsSourceItem = {
  kind: string;
  name: string;
  siteUrl: string;
  rssUrl: string | null;
  isEnabled: boolean;
  isBuiltIn: boolean;
  showAllWhenSelected: boolean;
  sourceType: string;
  bridgeKind: string | null;
  bridgeConfigSummary: string | null;
  bridgeInputMode: "feed_url" | "article_url" | "name_lookup" | null;
  bridgeInputValue: string | null;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
  totalCount?: number;
  publishedTodayCount?: number;
  collectedTodayCount?: number;
  viewStats?: {
    hot: { candidateCount: number; visibleCount: number; visibleShare: number };
    articles: { candidateCount: number; visibleCount: number; visibleShare: number };
    ai: { candidateCount: number; visibleCount: number; visibleShare: number };
  };
};

export type SettingsSourcesOperations = {
  lastCollectionRunAt: string | null;
  lastSendLatestEmailAt: string | null;
  nextCollectionRunAt: string | null;
  canTriggerManualCollect: boolean;
  canTriggerManualTwitterCollect: boolean;
  canTriggerManualTwitterKeywordCollect: boolean;
  canTriggerManualHackerNewsCollect?: boolean;
  canTriggerManualBilibiliCollect?: boolean;
  canTriggerManualWechatRssCollect?: boolean;
  canTriggerManualWeiboTrendingCollect?: boolean;
  canTriggerManualSendLatestEmail: boolean;
  isRunning: boolean;
};

export type SettingsSourcesCapability = {
  wechatArticleUrlEnabled: boolean;
  wechatArticleUrlMessage: string;
  twitterAccountCollectionEnabled?: boolean;
  twitterAccountCollectionMessage?: string;
  twitterKeywordSearchEnabled?: boolean;
  twitterKeywordSearchMessage?: string;
  hackerNewsSearchEnabled?: boolean;
  hackerNewsSearchMessage?: string;
  bilibiliSearchEnabled?: boolean;
  bilibiliSearchMessage?: string;
  wechatRssEnabled?: boolean;
  wechatRssMessage?: string;
  weiboTrendingEnabled?: boolean;
  weiboTrendingMessage?: string;
};

export type SettingsTwitterAccount = {
  id: number;
  username: string;
  userId: string | null;
  displayName: string;
  category: string;
  priority: number;
  includeReplies: boolean;
  isEnabled: boolean;
  notes: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettingsTwitterSearchKeyword = {
  id: number;
  keyword: string;
  category: string;
  priority: number;
  isCollectEnabled: boolean;
  isVisible: boolean;
  notes: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettingsHackerNewsQuery = {
  id: number;
  query: string;
  priority: number;
  isEnabled: boolean;
  notes: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettingsBilibiliQuery = {
  id: number;
  query: string;
  priority: number;
  isEnabled: boolean;
  notes: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettingsWechatRssSource = {
  id: number;
  rssUrl: string;
  displayName: string | null;
  isEnabled: boolean;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettingsWeiboTrending = {
  fixedKeywords: string[];
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
};

export type SettingsSourcesResponse = {
  sources: SettingsSourceItem[];
  twitterAccounts?: SettingsTwitterAccount[];
  twitterSearchKeywords?: SettingsTwitterSearchKeyword[];
  hackerNewsQueries?: SettingsHackerNewsQuery[];
  bilibiliQueries?: SettingsBilibiliQuery[];
  wechatRssSources?: SettingsWechatRssSource[];
  weiboTrending?: SettingsWeiboTrending;
  operations: SettingsSourcesOperations;
  capability: SettingsSourcesCapability;
};

export type SaveProviderSettingsPayload = {
  providerKind: SettingsProviderKind | string;
  apiKey: string;
};

export type SaveProviderSettingsResponse = {
  ok: true;
  providerKind: string;
};

export type UpdateProviderSettingsActivationPayload = {
  providerKind: SettingsProviderKind | string;
  enable: boolean;
};

export type UpdateProviderSettingsActivationResponse = {
  ok: true;
  providerKind: string;
  isEnabled: boolean;
};

export type DeleteFeedbackEntryResponse = {
  ok: true;
  feedbackId: number;
};

export type ClearFeedbackPoolResponse = {
  ok: true;
  cleared: number;
};

export type ToggleSourceResponse = {
  ok: true;
  kind: string;
  enable: boolean;
};

export type UpdateSourceDisplayModeResponse = {
  ok: true;
  kind: string;
  showAllWhenSelected: boolean;
};

export type SaveSourcePayload =
  | {
      sourceType: "rss";
      rssUrl: string;
    }
  | {
      sourceType: "wechat_bridge";
      wechatName: string;
      articleUrl?: string;
    }
  | {
      kind: string;
      sourceType: "rss";
      rssUrl: string;
    }
  | {
      kind: string;
      sourceType: "wechat_bridge";
      wechatName: string;
      articleUrl?: string;
    };

export type SaveSourceResponse = {
  ok: true;
  kind: string;
};

export type DeleteSourceResponse = {
  ok: true;
  kind: string;
};

export type SaveTwitterAccountPayload = {
  id?: number;
  username: string;
  userId?: string | null;
  displayName?: string | null;
  category?: string | null;
  priority?: number | null;
  includeReplies?: boolean | null;
  isEnabled?: boolean | null;
  notes?: string | null;
};

export type SaveTwitterAccountResponse = {
  ok: true;
  account: SettingsTwitterAccount;
};

export type SaveTwitterSearchKeywordPayload = {
  id?: number;
  keyword: string;
  category?: string | null;
  priority?: number | null;
  isCollectEnabled?: boolean | null;
  isVisible?: boolean | null;
  notes?: string | null;
};

export type SaveTwitterSearchKeywordResponse = {
  ok: true;
  keyword: SettingsTwitterSearchKeyword;
};

export type SaveHackerNewsQueryPayload = {
  id?: number;
  query: string;
  priority?: number | null;
  isEnabled?: boolean | null;
  notes?: string | null;
};

export type SaveHackerNewsQueryResponse = {
  ok: true;
  query: SettingsHackerNewsQuery;
};

export type SaveBilibiliQueryPayload = {
  id?: number;
  query: string;
  priority?: number | null;
  isEnabled?: boolean | null;
  notes?: string | null;
};

export type SaveBilibiliQueryResponse = {
  ok: true;
  query: SettingsBilibiliQuery;
};

export type CreateWechatRssSourcesPayload = {
  rssUrls: string | string[];
};

export type CreateWechatRssSourcesResponse = {
  ok: true;
  created: SettingsWechatRssSource[];
  skippedDuplicateUrls: string[];
};

export type DeleteTwitterSearchKeywordResponse = {
  ok: true;
  id: number;
};

export type ToggleTwitterSearchKeywordResponse = {
  ok: true;
  id: number;
  enable: boolean;
};

export type DeleteHackerNewsQueryResponse = {
  ok: true;
  id: number;
};

export type ToggleHackerNewsQueryResponse = {
  ok: true;
  id: number;
  enable: boolean;
};

export type DeleteBilibiliQueryResponse = {
  ok: true;
  id: number;
};

export type DeleteWechatRssSourceResponse = {
  ok: true;
  id: number;
};

export type ToggleBilibiliQueryResponse = {
  ok: true;
  id: number;
  enable: boolean;
};

export type DeleteTwitterAccountResponse = {
  ok: true;
  id: number;
};

export type ToggleTwitterAccountResponse = {
  ok: true;
  id: number;
  enable: boolean;
};

export type ManualCollectResponse = {
  accepted: boolean;
  action?: "collect";
  reason?: string;
};

export type ManualTwitterCollectResponse =
  | {
      accepted: true;
      action: "collect-twitter-accounts";
      enabledAccountCount: number;
      fetchedTweetCount: number;
      persistedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason?: "twitter-api-key-missing" | "no-enabled-twitter-accounts" | "already-running";
    };

export type ManualTwitterKeywordCollectResponse =
  | {
      accepted: true;
      action: "collect-twitter-keywords";
      enabledKeywordCount: number;
      processedKeywordCount: number;
      fetchedTweetCount: number;
      persistedContentItemCount: number;
      reusedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason?: "twitter-api-key-missing" | "no-enabled-twitter-keywords" | "already-running";
    };

export type ManualHackerNewsCollectResponse =
  | {
      accepted: true;
      action: "collect-hackernews";
      enabledQueryCount: number;
      processedQueryCount: number;
      fetchedHitCount: number;
      persistedContentItemCount: number;
      reusedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason?: "no-enabled-hackernews-queries" | "already-running";
    };

export type ManualBilibiliCollectResponse =
  | {
      accepted: true;
      action: "collect-bilibili";
      enabledQueryCount: number;
      processedQueryCount: number;
      fetchedVideoCount: number;
      persistedContentItemCount: number;
      reusedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason?: "no-enabled-bilibili-queries" | "already-running";
    };

export type ManualWechatRssCollectResponse =
  | {
      accepted: true;
      action: "collect-wechat-rss";
      enabledSourceCount: number;
      fetchedItemCount: number;
      persistedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason?: "no-enabled-wechat-rss-sources" | "already-running";
    };

export type ManualWeiboTrendingCollectResponse =
  | {
      accepted: true;
      action: "collect-weibo-trending";
      fetchedTopicCount: number;
      matchedTopicCount: number;
      persistedContentItemCount: number;
      reusedContentItemCount: number;
      failureCount: number;
    }
  | {
      accepted: false;
      reason?: "already-running";
    };

export type ManualSendLatestEmailResponse = {
  accepted: boolean;
  action?: "send-latest-email";
  reason?: string;
};

// 读取当前登录用户摘要，401 代表匿名访问或会话失效，调用方可以把它当作“未登录”。
export async function readSettingsProfile(): Promise<SettingsProfile | null> {
  try {
    const response = await requestJson<SettingsProfileResponse>("/api/settings/profile");
    return response.profile;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

// 预留给后续系统页工作区的数据读取接口，当前只做最小签名，不提前绑定业务视图。
export function readSettingsViewRules(): Promise<SettingsViewRulesResponse> {
  return requestJson<SettingsViewRulesResponse>("/api/settings/view-rules");
}

export function saveContentFilterRule(
  payload: SaveContentFilterRulePayload
): Promise<SaveContentFilterRuleResponse> {
  return postSettingsAction<SaveContentFilterRuleResponse>("/actions/view-rules/content-filters", payload);
}

// sources 工作台现在使用独立来源统计，不再复用内容页当前筛选上下文。
export function readSettingsSources(): Promise<SettingsSourcesResponse> {
  return requestJson<SettingsSourcesResponse>("/api/settings/sources");
}

// 系统页写操作统一走 JSON POST，这样页面组件不需要重复拼 fetch 细节。
function postSettingsAction<T>(url: string, body: unknown): Promise<T> {
  return requestJson<T>(url, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

// 厂商设置保存现在只更新当前厂商的 API key，不再顺手切换启用状态。
export function saveProviderSettings(
  payload: SaveProviderSettingsPayload
): Promise<SaveProviderSettingsResponse> {
  return postSettingsAction<SaveProviderSettingsResponse>("/actions/view-rules/provider-settings", payload);
}

// 启用动作单独拆开，避免“更新 key”与“切换当前启用厂商”耦在一起。
export function updateProviderSettingsActivation(
  payload: UpdateProviderSettingsActivationPayload
): Promise<UpdateProviderSettingsActivationResponse> {
  return postSettingsAction<UpdateProviderSettingsActivationResponse>(
    "/actions/view-rules/provider-settings/activation",
    payload
  );
}

// 删除动作需要带上当前选中的厂商，避免多厂商模式下误删其他配置。
export function deleteProviderSettings(providerKind: SettingsProviderKind | string): Promise<{ ok: true }> {
  return postSettingsAction<{ ok: true }>("/actions/view-rules/provider-settings/delete", { providerKind });
}

// 删除单条反馈时保留后端返回的 feedbackId，便于调用方做轻量校验。
export function deleteFeedbackEntry(
  feedbackId: number
): Promise<DeleteFeedbackEntryResponse> {
  return postSettingsAction<DeleteFeedbackEntryResponse>(
    `/actions/feedback-pool/${encodeURIComponent(String(feedbackId))}/delete`,
    {}
  );
}

// 清空反馈池会返回清掉的数量，页面可以直接拿它提示用户。
export function clearFeedbackPool(): Promise<ClearFeedbackPoolResponse> {
  return postSettingsAction<ClearFeedbackPoolResponse>("/actions/feedback-pool/clear", {});
}

// source 切换使用显式 enable 布尔值，避免前端和后端对“下一状态”产生歧义。
export function toggleSource(kind: string, enable: boolean): Promise<ToggleSourceResponse> {
  return postSettingsAction<ToggleSourceResponse>("/actions/sources/toggle", { kind, enable });
}

// source 展示模式单独走一个动作接口，避免和采集启停语义混在一起。
export function updateSourceDisplayMode(
  kind: string,
  showAllWhenSelected: boolean
): Promise<UpdateSourceDisplayModeResponse> {
  return postSettingsAction<UpdateSourceDisplayModeResponse>("/actions/sources/display-mode", {
    kind,
    showAllWhenSelected
  });
}

// 来源新增复用统一 JSON action，bridge 解析在后端保存阶段完成。
export function createSource(payload: SaveSourcePayload): Promise<SaveSourceResponse> {
  return postSettingsAction<SaveSourceResponse>("/actions/sources/create", payload);
}

// 来源编辑沿用与新增相同的 payload 结构，只是后端按 update 语义处理。
export function updateSource(payload: SaveSourcePayload): Promise<SaveSourceResponse> {
  return postSettingsAction<SaveSourceResponse>("/actions/sources/update", payload);
}

// 删除只需要 source kind，是否允许删除由后端按 built-in / in-use 规则判断。
export function deleteSource(kind: string): Promise<DeleteSourceResponse> {
  return postSettingsAction<DeleteSourceResponse>("/actions/sources/delete", { kind });
}

export function createTwitterAccount(payload: SaveTwitterAccountPayload): Promise<SaveTwitterAccountResponse> {
  return postSettingsAction<SaveTwitterAccountResponse>("/actions/twitter-accounts/create", payload);
}

export function updateTwitterAccount(payload: SaveTwitterAccountPayload): Promise<SaveTwitterAccountResponse> {
  return postSettingsAction<SaveTwitterAccountResponse>("/actions/twitter-accounts/update", payload);
}

export function deleteTwitterAccount(id: number): Promise<DeleteTwitterAccountResponse> {
  return postSettingsAction<DeleteTwitterAccountResponse>("/actions/twitter-accounts/delete", { id });
}

export function toggleTwitterAccount(id: number, enable: boolean): Promise<ToggleTwitterAccountResponse> {
  return postSettingsAction<ToggleTwitterAccountResponse>("/actions/twitter-accounts/toggle", { id, enable });
}

export function createTwitterSearchKeyword(
  payload: SaveTwitterSearchKeywordPayload
): Promise<SaveTwitterSearchKeywordResponse> {
  return postSettingsAction<SaveTwitterSearchKeywordResponse>("/actions/twitter-keywords/create", payload);
}

export function updateTwitterSearchKeyword(
  payload: SaveTwitterSearchKeywordPayload
): Promise<SaveTwitterSearchKeywordResponse> {
  return postSettingsAction<SaveTwitterSearchKeywordResponse>("/actions/twitter-keywords/update", payload);
}

export function deleteTwitterSearchKeyword(id: number): Promise<DeleteTwitterSearchKeywordResponse> {
  return postSettingsAction<DeleteTwitterSearchKeywordResponse>("/actions/twitter-keywords/delete", { id });
}

export function toggleTwitterSearchKeywordCollect(
  id: number,
  enable: boolean
): Promise<ToggleTwitterSearchKeywordResponse> {
  return postSettingsAction<ToggleTwitterSearchKeywordResponse>("/actions/twitter-keywords/toggle-collect", {
    id,
    enable
  });
}

export function toggleTwitterSearchKeywordVisible(
  id: number,
  enable: boolean
): Promise<ToggleTwitterSearchKeywordResponse> {
  return postSettingsAction<ToggleTwitterSearchKeywordResponse>("/actions/twitter-keywords/toggle-visible", {
    id,
    enable
  });
}

export function createHackerNewsQuery(payload: SaveHackerNewsQueryPayload): Promise<SaveHackerNewsQueryResponse> {
  return postSettingsAction<SaveHackerNewsQueryResponse>("/actions/hackernews/create", payload);
}

export function updateHackerNewsQuery(payload: SaveHackerNewsQueryPayload): Promise<SaveHackerNewsQueryResponse> {
  return postSettingsAction<SaveHackerNewsQueryResponse>("/actions/hackernews/update", payload);
}

export function deleteHackerNewsQuery(id: number): Promise<DeleteHackerNewsQueryResponse> {
  return postSettingsAction<DeleteHackerNewsQueryResponse>("/actions/hackernews/delete", { id });
}

export function toggleHackerNewsQuery(id: number, enable: boolean): Promise<ToggleHackerNewsQueryResponse> {
  return postSettingsAction<ToggleHackerNewsQueryResponse>("/actions/hackernews/toggle", { id, enable });
}

export function createBilibiliQuery(payload: SaveBilibiliQueryPayload): Promise<SaveBilibiliQueryResponse> {
  return postSettingsAction<SaveBilibiliQueryResponse>("/actions/bilibili/create", payload);
}

export function updateBilibiliQuery(payload: SaveBilibiliQueryPayload): Promise<SaveBilibiliQueryResponse> {
  return postSettingsAction<SaveBilibiliQueryResponse>("/actions/bilibili/update", payload);
}

export function deleteBilibiliQuery(id: number): Promise<DeleteBilibiliQueryResponse> {
  return postSettingsAction<DeleteBilibiliQueryResponse>("/actions/bilibili/delete", { id });
}

export function toggleBilibiliQuery(id: number, enable: boolean): Promise<ToggleBilibiliQueryResponse> {
  return postSettingsAction<ToggleBilibiliQueryResponse>("/actions/bilibili/toggle", { id, enable });
}

// 微信公众号 RSS 支持批量新增，后端会统一规范化 URL 并跳过重复链接。
export function createWechatRssSources(
  payload: CreateWechatRssSourcesPayload
): Promise<CreateWechatRssSourcesResponse> {
  return postSettingsAction<CreateWechatRssSourcesResponse>("/actions/wechat-rss/create", payload);
}

// 删除只移除配置行，历史内容仍然保留在内容库里，避免误删已采集数据。
export function deleteWechatRssSource(id: number): Promise<DeleteWechatRssSourceResponse> {
  return postSettingsAction<DeleteWechatRssSourceResponse>("/actions/wechat-rss/delete", { id });
}

// 手动采集走独立动作接口，保持和旧系统页一致的任务语义。
export function triggerManualCollect(): Promise<ManualCollectResponse> {
  return postSettingsAction<ManualCollectResponse>("/actions/collect", {});
}

// Twitter 账号采集单独触发，避免和默认 RSS / 公众号采集共用同一条高频入口。
export function triggerManualTwitterCollect(): Promise<ManualTwitterCollectResponse> {
  return postSettingsAction<ManualTwitterCollectResponse>("/actions/twitter-accounts/collect", {});
}

// Twitter 关键词搜索只支持手动采集，避免把 credits 消耗绑定进默认定时任务。
export function triggerManualTwitterKeywordCollect(): Promise<ManualTwitterKeywordCollectResponse> {
  return postSettingsAction<ManualTwitterKeywordCollectResponse>("/actions/twitter-keywords/collect", {});
}

// Hacker News 搜索保持独立手动入口，避免默认采集链路无意扩大范围。
export function triggerManualHackerNewsCollect(): Promise<ManualHackerNewsCollectResponse> {
  return postSettingsAction<ManualHackerNewsCollectResponse>("/actions/hackernews/collect", {});
}

// B 站搜索和 HN 一样保持独立手动入口，避免默认采集链路无意扩大到视频搜索。
export function triggerManualBilibiliCollect(): Promise<ManualBilibiliCollectResponse> {
  return postSettingsAction<ManualBilibiliCollectResponse>("/actions/bilibili/collect", {});
}

// 公众号 RSS 只支持手动采集，避免新增 RSS 后被默认调度自动放大请求量。
export function triggerManualWechatRssCollect(): Promise<ManualWechatRssCollectResponse> {
  return postSettingsAction<ManualWechatRssCollectResponse>("/actions/wechat-rss/collect", {});
}

// 微博热搜榜匹配只走独立手动入口，不进入默认采集链路。
export function triggerManualWeiboTrendingCollect(): Promise<ManualWeiboTrendingCollectResponse> {
  return postSettingsAction<ManualWeiboTrendingCollectResponse>("/actions/weibo/collect", {});
}

// 手动发送最新报告沿用现有后端接口，错误原因由调用方再翻译成用户提示。
export function triggerManualSendLatestEmail(): Promise<ManualSendLatestEmailResponse> {
  return postSettingsAction<ManualSendLatestEmailResponse>("/actions/send-latest-email", {});
}
