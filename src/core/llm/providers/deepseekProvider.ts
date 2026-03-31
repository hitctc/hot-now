import type { ResolvedProviderSettings } from "../providerSettingsRepository.js";
import { createOpenAiCompatibleEvaluationProvider } from "./shared.js";

export function createDeepSeekProvider(settings: ResolvedProviderSettings) {
  return createOpenAiCompatibleEvaluationProvider({
    providerKind: "deepseek",
    providerLabel: "DeepSeek",
    apiKey: settings.apiKey,
    requestUrl: "https://api.deepseek.com/chat/completions",
    modelName: "deepseek-chat"
  });
}
