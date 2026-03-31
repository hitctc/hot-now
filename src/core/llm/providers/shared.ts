import type { NlEvaluationDecision, NlEvaluationStrengthLevel } from "../../strategy/nlEvaluationRepository.js";
import { DEFAULT_NL_RULE_SCOPES, type NlRuleScope } from "../../strategy/nlRuleRepository.js";
import type { LlmProviderKind } from "../providerSettingsRepository.js";

export type LlmEvaluationContent = {
  id: number;
  title: string;
  summary: string;
  bodyMarkdown: string;
  canonicalUrl: string;
  publishedAt: string | null;
  sourceKind: string;
  sourceName: string;
};

export type LlmContentEvaluation = {
  scope: NlRuleScope;
  decision: NlEvaluationDecision;
  strengthLevel: NlEvaluationStrengthLevel;
  matchedKeywords: string[];
  reason: string | null;
};

export type LlmContentEvaluationProvider = {
  providerKind: LlmProviderKind;
  modelName: string;
  evaluateContent(input: {
    content: LlmEvaluationContent;
    ruleSets: Record<NlRuleScope, string>;
  }): Promise<{
    evaluations: LlmContentEvaluation[];
  }>;
};

type OpenAiCompatibleProviderConfig = {
  providerKind: LlmProviderKind;
  providerLabel: string;
  apiKey: string;
  requestUrl: string;
  modelName: string;
  extraBody?: Record<string, unknown>;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

export function createOpenAiCompatibleEvaluationProvider(
  config: OpenAiCompatibleProviderConfig
): LlmContentEvaluationProvider {
  return {
    providerKind: config.providerKind,
    modelName: config.modelName,
    evaluateContent: async ({ content, ruleSets }) => {
      const response = await fetch(config.requestUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.modelName,
          temperature: 0,
          messages: [
            {
              role: "system",
              content: buildSystemPrompt()
            },
            {
              role: "user",
              content: buildUserPrompt(content, ruleSets)
            }
          ],
          ...config.extraBody
        })
      });

      if (!response.ok) {
        const errorText = truncateText(await response.text(), 300);
        throw new Error(`${config.providerLabel} request failed: ${response.status} ${errorText}`);
      }

      const payload = (await response.json()) as ChatCompletionResponse;
      const rawContent = readAssistantContent(payload);
      const parsed = parseJsonObject<{
        evaluations?: unknown;
      }>(rawContent);

      return {
        evaluations: normalizeEvaluations(parsed.evaluations)
      };
    }
  };
}

function buildSystemPrompt(): string {
  return [
    "You are evaluating HotNow content against four scopes: global, hot, articles, ai.",
    "Return strict JSON only.",
    'Use this schema: {"evaluations":[{"scope":"global|hot|articles|ai","decision":"boost|penalize|block|neutral","strengthLevel":"low|medium|high|null","matchedKeywords":["string"],"reason":"string|null"}]}',
    "Always return exactly four evaluations, one for each scope, in any order.",
    "If a scope has an empty rule text, return neutral with null strengthLevel, empty matchedKeywords, and null reason."
  ].join(" ");
}

function buildUserPrompt(content: LlmEvaluationContent, ruleSets: Record<NlRuleScope, string>): string {
  // Content bodies can be large, so prompts include a trimmed snapshot that keeps the title, summary
  // and the most informative prefix without burning unnecessary tokens on the provider side.
  return JSON.stringify(
    {
      content: {
        title: content.title,
        summary: truncateText(content.summary, 600),
        bodyMarkdown: truncateText(content.bodyMarkdown, 4000),
        canonicalUrl: content.canonicalUrl,
        publishedAt: content.publishedAt,
        sourceKind: content.sourceKind,
        sourceName: content.sourceName
      },
      ruleSets
    },
    null,
    2
  );
}

function readAssistantContent(payload: ChatCompletionResponse): string {
  const rawContent = payload.choices?.[0]?.message?.content;

  if (typeof rawContent === "string") {
    return rawContent;
  }

  if (Array.isArray(rawContent)) {
    return rawContent
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
  }

  throw new Error("provider response did not include assistant content");
}

function parseJsonObject<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);

    if (fencedMatch?.[1]) {
      return JSON.parse(fencedMatch[1]) as T;
    }

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as T;
    }
  }

  throw new Error("provider response did not contain valid JSON");
}

function normalizeEvaluations(rawValue: unknown): LlmContentEvaluation[] {
  const sourceRows = Array.isArray(rawValue) ? rawValue : [];
  const normalizedByScope = new Map<NlRuleScope, LlmContentEvaluation>();

  for (const scope of DEFAULT_NL_RULE_SCOPES) {
    normalizedByScope.set(scope, {
      scope,
      decision: "neutral",
      strengthLevel: null,
      matchedKeywords: [],
      reason: null
    });
  }

  for (const row of sourceRows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const scope = readScope((row as Record<string, unknown>).scope);

    if (!scope) {
      continue;
    }

    normalizedByScope.set(scope, {
      scope,
      decision: readDecision((row as Record<string, unknown>).decision),
      strengthLevel: readStrengthLevel((row as Record<string, unknown>).strengthLevel),
      matchedKeywords: readStringArray((row as Record<string, unknown>).matchedKeywords),
      reason: readNullableString((row as Record<string, unknown>).reason)
    });
  }

  return DEFAULT_NL_RULE_SCOPES.map((scope) => normalizedByScope.get(scope)!);
}

function readScope(value: unknown): NlRuleScope | null {
  return DEFAULT_NL_RULE_SCOPES.includes(value as NlRuleScope) ? (value as NlRuleScope) : null;
}

function readDecision(value: unknown): NlEvaluationDecision {
  return value === "boost" || value === "penalize" || value === "block" ? value : "neutral";
}

function readStrengthLevel(value: unknown): NlEvaluationStrengthLevel {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}
