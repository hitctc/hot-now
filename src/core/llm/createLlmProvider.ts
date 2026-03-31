import { createDeepSeekProvider } from "./providers/deepseekProvider.js";
import { createKimiProvider } from "./providers/kimiProvider.js";
import { createMiniMaxProvider } from "./providers/minimaxProvider.js";
import type { LlmContentEvaluationProvider } from "./providers/shared.js";
import type { ResolvedProviderSettings } from "./providerSettingsRepository.js";

export type ResolveLlmProviderFailureReason = "missing-provider-settings" | "master-key-required" | "decrypt-failed";
export type ResolveLlmProviderResult =
  | { ok: true; provider: LlmContentEvaluationProvider }
  | { ok: false; reason: ResolveLlmProviderFailureReason };

export function createLlmProvider(settings: ResolvedProviderSettings): LlmContentEvaluationProvider {
  // Provider creation stays centralized so upstream services can stay agnostic to vendor-specific
  // base URLs, model names and request quirks.
  switch (settings.providerKind) {
    case "deepseek":
      return createDeepSeekProvider(settings);
    case "minimax":
      return createMiniMaxProvider(settings);
    case "kimi":
      return createKimiProvider(settings);
    default:
      throw new Error(`unsupported llm provider: ${settings.providerKind}`);
  }
}
