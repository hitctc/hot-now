import type { ResolvedProviderSettings } from "../providerSettingsRepository.js";
import { createOpenAiCompatibleEvaluationProvider } from "./shared.js";

export function createMiniMaxProvider(settings: ResolvedProviderSettings) {
  return createOpenAiCompatibleEvaluationProvider({
    providerKind: "minimax",
    providerLabel: "MiniMax",
    apiKey: settings.apiKey,
    requestUrl: "https://api.minimaxi.com/v1/text/chatcompletion_v2",
    modelName: "MiniMax-M2.5"
  });
}
