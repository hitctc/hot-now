import { describe, expect, it } from "vitest";
import { normalizeViewRuleConfig } from "../../src/core/viewRules/viewRuleConfig.js";

describe("viewRuleConfig", () => {
  it("fills missing fields with rule-specific defaults", () => {
    expect(normalizeViewRuleConfig("hot", {})).toEqual({
      limit: 20,
      freshnessWindowDays: 3,
      freshnessWeight: 0.35,
      sourceWeight: 0.1,
      completenessWeight: 0.1,
      aiWeight: 0.05,
      heatWeight: 0.4
    });

    expect(normalizeViewRuleConfig("articles", {})).toEqual({
      limit: 20,
      freshnessWindowDays: 7,
      freshnessWeight: 0.15,
      sourceWeight: 0.3,
      completenessWeight: 0.35,
      aiWeight: 0.05,
      heatWeight: 0.15
    });

    expect(normalizeViewRuleConfig("ai", {})).toEqual({
      limit: 20,
      freshnessWindowDays: 5,
      freshnessWeight: 0.1,
      sourceWeight: 0.1,
      completenessWeight: 0.15,
      aiWeight: 0.5,
      heatWeight: 0.15
    });
  });

  it("keeps provided values and backfills legacy payloads", () => {
    expect(
      normalizeViewRuleConfig("articles", {
        limit: 12,
        sort: "completeness",
        completenessWeight: 0.9,
        aiWeight: 0.02
      })
    ).toEqual({
      limit: 12,
      freshnessWindowDays: 7,
      freshnessWeight: 0.15,
      sourceWeight: 0.3,
      completenessWeight: 0.9,
      aiWeight: 0.02,
      heatWeight: 0.15
    });
  });
});
