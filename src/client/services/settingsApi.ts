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
export type SettingsStrategyGateScope = "base" | "ai_new" | "ai_hot";
export type SettingsStrategyDraftScope = SettingsStrategyGateScope | "unspecified";

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

export type SettingsNlRuleItem = {
  scope: SettingsStrategyGateScope;
  enabled: boolean;
  ruleText: string;
  createdAt: string;
  updatedAt: string;
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

export type SettingsStrategyDraftItem = {
  id: number;
  sourceFeedbackId: number | null;
  draftText: string;
  suggestedScope: SettingsStrategyDraftScope;
  draftEffectSummary: string | null;
  positiveKeywords: string[];
  negativeKeywords: string[];
  createdAt: string;
  updatedAt: string;
};

export type SettingsNlEvaluationRun = {
  id: number;
  runType: string;
  status: string;
  providerKind: string | null;
  startedAt: string;
  finishedAt: string | null;
  itemCount: number;
  successCount: number;
  failureCount: number;
  notes: string | null;
  createdAt: string;
};

export type SettingsViewRulesResponse = {
  providerSettings: SettingsProviderSettingsSummary[];
  providerCapability: SettingsProviderCapability;
  nlRules: SettingsNlRuleItem[];
  feedbackPool: SettingsFeedbackPoolItem[];
  strategyDrafts: SettingsStrategyDraftItem[];
  latestEvaluationRun: SettingsNlEvaluationRun | null;
  isEvaluationRunning: boolean;
  isEvaluationStopRequested: boolean;
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
  bridgeInputMode: "feed_url" | "article_url" | null;
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
  canTriggerManualCollect: boolean;
  canTriggerManualSendLatestEmail: boolean;
  isRunning: boolean;
};

export type SettingsSourcesResponse = {
  sources: SettingsSourceItem[];
  operations: SettingsSourcesOperations;
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

export type SaveNlRuleGatePayload = {
  enabled: boolean;
  ruleText: string;
};

export type SaveNlRulesPayload = Record<SettingsStrategyGateScope, SaveNlRuleGatePayload>;
export type SaveNlRulesResponse = {
  ok: true;
  run?: {
    runId?: number;
    status?: string;
    itemCount?: number;
    successCount?: number;
    failureCount?: number;
  };
};

export type CancelNlEvaluationResponse = {
  ok: true;
  accepted: boolean;
  status: "idle" | "cancelling";
};

export type CreateDraftFromFeedbackResponse = {
  ok: true;
  draftId: number;
};

export type DeleteFeedbackEntryResponse = {
  ok: true;
  feedbackId: number;
};

export type ClearFeedbackPoolResponse = {
  ok: true;
  cleared: number;
};

export type SaveStrategyDraftPayload = {
  suggestedScope: SettingsStrategyDraftScope;
  draftText: string;
  draftEffectSummary: string;
  positiveKeywords: string[];
  negativeKeywords: string[];
};

export type SaveStrategyDraftResponse = {
  ok: true;
  draftId: number;
};

export type DeleteStrategyDraftResponse = {
  ok: true;
  draftId: number;
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
      kind: string;
      name: string;
      siteUrl: string;
      rssUrl: string;
    }
  | {
      sourceType: "wechat_bridge";
      kind: string;
      name: string;
      siteUrl: string;
      bridgeKind: "wechat2rss";
      inputMode: "feed_url";
      feedUrl: string;
    }
  | {
      sourceType: "wechat_bridge";
      kind: string;
      name: string;
      siteUrl: string;
      bridgeKind: "wechat2rss";
      inputMode: "article_url";
      articleUrl: string;
    };

export type SaveSourceResponse = {
  ok: true;
  kind: string;
};

export type DeleteSourceResponse = {
  ok: true;
  kind: string;
};

export type ManualCollectResponse = {
  accepted: boolean;
  action?: "collect";
  reason?: string;
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

// 正式自然语言策略保存后，后端会按当前配置尝试触发一次重算。
export function saveNlRules(rules: SaveNlRulesPayload): Promise<SaveNlRulesResponse> {
  return postSettingsAction<SaveNlRulesResponse>("/actions/view-rules/nl-rules", { rules });
}

// 中断请求采用协作式停止：当前项跑完后就不会继续评估后续内容。
export function cancelNlEvaluation(): Promise<CancelNlEvaluationResponse> {
  return postSettingsAction<CancelNlEvaluationResponse>("/actions/view-rules/nl-rules/cancel", {});
}

// 反馈转草稿沿用现有单条动作接口，成功后刷新整个工作台。
export function createDraftFromFeedback(
  feedbackId: number
): Promise<CreateDraftFromFeedbackResponse> {
  return postSettingsAction<CreateDraftFromFeedbackResponse>(
    `/actions/feedback-pool/${encodeURIComponent(String(feedbackId))}/create-draft`,
    {}
  );
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

// 草稿保存继续使用后端现有结构，关键词数组由页面先切好再提交。
export function saveStrategyDraft(
  draftId: number,
  payload: SaveStrategyDraftPayload
): Promise<SaveStrategyDraftResponse> {
  return postSettingsAction<SaveStrategyDraftResponse>(
    `/actions/strategy-drafts/${encodeURIComponent(String(draftId))}/save`,
    payload
  );
}

// 草稿删除后直接刷新工作台，避免前端本地状态和后端脱节。
export function deleteStrategyDraft(
  draftId: number
): Promise<DeleteStrategyDraftResponse> {
  return postSettingsAction<DeleteStrategyDraftResponse>(
    `/actions/strategy-drafts/${encodeURIComponent(String(draftId))}/delete`,
    {}
  );
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

// 手动采集走独立动作接口，保持和旧系统页一致的任务语义。
export function triggerManualCollect(): Promise<ManualCollectResponse> {
  return postSettingsAction<ManualCollectResponse>("/actions/collect", {});
}

// 手动发送最新报告沿用现有后端接口，错误原因由调用方再翻译成用户提示。
export function triggerManualSendLatestEmail(): Promise<ManualSendLatestEmailResponse> {
  return postSettingsAction<ManualSendLatestEmailResponse>("/actions/send-latest-email", {});
}
