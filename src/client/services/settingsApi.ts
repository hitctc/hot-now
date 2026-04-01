import { HttpError, requestJson } from "./http";
import type { ViewRuleConfigValues } from "../../core/viewRules/viewRuleConfig";

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
export type SettingsNlRuleScope = "global" | "hot" | "articles" | "ai";
export type SettingsStrategyDraftScope = SettingsNlRuleScope | "unspecified";

export type SettingsViewRuleItem = {
  ruleKey: string;
  displayName: string;
  config: ViewRuleConfigValues;
  isEnabled: boolean;
};

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
  scope: SettingsNlRuleScope;
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
  reactionSnapshot: string;
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
  numericRules: SettingsViewRuleItem[];
  providerSettings: SettingsProviderSettingsSummary | null;
  providerCapability: SettingsProviderCapability;
  nlRules: SettingsNlRuleItem[];
  feedbackPool: SettingsFeedbackPoolItem[];
  strategyDrafts: SettingsStrategyDraftItem[];
  latestEvaluationRun: SettingsNlEvaluationRun | null;
  isEvaluationRunning: boolean;
};
export type SettingsSourceItem = {
  kind: string;
  name: string;
  rssUrl: string | null;
  isEnabled: boolean;
  showAllWhenSelected: boolean;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
  totalCount?: number;
  publishedTodayCount?: number;
  collectedTodayCount?: number;
  viewStats?: {
    hot: { candidateCount: number; visibleCount: number };
    articles: { candidateCount: number; visibleCount: number };
    ai: { candidateCount: number; visibleCount: number };
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
  isEnabled: boolean;
};

export type SaveProviderSettingsResponse = {
  ok: true;
  providerKind: string;
};

export type SaveNlRulesPayload = Record<SettingsNlRuleScope, string>;
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

export type SaveViewRuleConfigResponse = {
  ok: true;
  ruleKey: string;
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

// 预留给后续系统页工作区的数据读取接口，当前只做最小签名，不提前绑定业务视图。
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

// 数值规则保存保持逐条提交，避免多个页面规则互相覆盖。
export function saveViewRuleConfig(
  ruleKey: string,
  config: ViewRuleConfigValues
): Promise<SaveViewRuleConfigResponse> {
  return postSettingsAction<SaveViewRuleConfigResponse>(`/actions/view-rules/${encodeURIComponent(ruleKey)}`, {
    config
  });
}

// 厂商设置保存保持单活语义，新的 API key 会覆盖当前配置。
export function saveProviderSettings(
  payload: SaveProviderSettingsPayload
): Promise<SaveProviderSettingsResponse> {
  return postSettingsAction<SaveProviderSettingsResponse>("/actions/view-rules/provider-settings", payload);
}

// 删除当前厂商配置后，工作台会回到“未配置”状态。
export function deleteProviderSettings(): Promise<{ ok: true }> {
  return postSettingsAction<{ ok: true }>("/actions/view-rules/provider-settings/delete", {});
}

// 正式自然语言策略保存后，后端会按当前配置尝试触发一次重算。
export function saveNlRules(rules: SaveNlRulesPayload): Promise<SaveNlRulesResponse> {
  return postSettingsAction<SaveNlRulesResponse>("/actions/view-rules/nl-rules", { rules });
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

// 手动采集走独立动作接口，保持和旧系统页一致的任务语义。
export function triggerManualCollect(): Promise<ManualCollectResponse> {
  return postSettingsAction<ManualCollectResponse>("/actions/collect", {});
}

// 手动发送最新报告沿用现有后端接口，错误原因由调用方再翻译成用户提示。
export function triggerManualSendLatestEmail(): Promise<ManualSendLatestEmailResponse> {
  return postSettingsAction<ManualSendLatestEmailResponse>("/actions/send-latest-email", {});
}
