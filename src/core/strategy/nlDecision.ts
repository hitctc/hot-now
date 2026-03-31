import type { NlEvaluationDecision, NlEvaluationStrengthLevel } from "./nlEvaluationRepository.js";

export const NL_DECISION_STRENGTH_SCORES = {
  low: 10,
  medium: 24,
  high: 42
} as const;

export function resolveNlScoreDelta(
  decision: NlEvaluationDecision,
  strengthLevel: NlEvaluationStrengthLevel
): number {
  // Decision strength is mapped centrally so every provider lands on the same fixed score system
  // instead of letting model-specific wording leak into ranking math.
  if (decision === "neutral" || decision === "block" || !strengthLevel) {
    return 0;
  }

  const absoluteValue = NL_DECISION_STRENGTH_SCORES[strengthLevel];
  return decision === "boost" ? absoluteValue : -absoluteValue;
}
