import type { ResolvedProviderSettings } from "../providerSettingsRepository.js";
import { createOpenAiCompatibleEvaluationProvider } from "./shared.js";

export function createKimiProvider(settings: ResolvedProviderSettings) {
  return createOpenAiCompatibleEvaluationProvider({
    providerKind: "kimi",
    providerLabel: "Kimi",
    apiKey: settings.apiKey,
    requestUrl: "https://api.moonshot.ai/v1/chat/completions",
    modelName: "kimi-k2.5",
    extraBody: {
      thinking: {
        type: "disabled"
      }
    }
  });
}
