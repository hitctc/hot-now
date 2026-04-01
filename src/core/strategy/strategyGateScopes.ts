export const STRATEGY_GATE_SCOPES = ["base", "ai_new", "ai_hot"] as const;

export type StrategyGateScope = (typeof STRATEGY_GATE_SCOPES)[number];

export const STRATEGY_DRAFT_SCOPES = ["unspecified", ...STRATEGY_GATE_SCOPES] as const;

export type StrategyDraftScope = (typeof STRATEGY_DRAFT_SCOPES)[number];

export const STRATEGY_GATE_LABELS: Record<StrategyGateScope, string> = {
  base: "基础入池门",
  ai_new: "AI 新讯入池门",
  ai_hot: "AI 热点入池门"
};

// 所有正式自然语言策略 scope 都从这里统一判断，避免前后端散落硬编码。
export function isStrategyGateScope(value: string): value is StrategyGateScope {
  return STRATEGY_GATE_SCOPES.includes(value as StrategyGateScope);
}

// 草稿 scope 允许一个未指定态，其余全部复用正式 gate scope。
export function normalizeStrategyDraftScope(value: string | undefined): StrategyDraftScope {
  if (value === "unspecified") {
    return value;
  }

  return isStrategyGateScope(value ?? "") ? (value as StrategyGateScope) : "unspecified";
}
