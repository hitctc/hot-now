import { describe, expect, it } from "vitest";
import { getInternalViewRuleConfig, normalizeViewRuleConfig } from "../../src/core/viewRules/viewRuleConfig.js";

describe("viewRuleConfig", () => {
  it("returns fixed internal defaults for the legacy content views still used by the ranking engine", () => {
    expect(getInternalViewRuleConfig("hot")).toEqual({
      limit: 20,
      freshnessWindowDays: 3,
      freshnessWeight: 0.35,
      sourceWeight: 0.1,
      completenessWeight: 0.1,
      aiWeight: 0.05,
      heatWeight: 0.4
    });

    expect(getInternalViewRuleConfig("articles")).toEqual({
      limit: 20,
      freshnessWindowDays: 7,
      freshnessWeight: 0.15,
      sourceWeight: 0.3,
      completenessWeight: 0.35,
      aiWeight: 0.05,
      heatWeight: 0.15
    });

    expect(getInternalViewRuleConfig("ai")).toEqual({
      limit: 20,
      freshnessWindowDays: 5,
      freshnessWeight: 0.1,
      sourceWeight: 0.1,
      completenessWeight: 0.15,
      aiWeight: 0.5,
      heatWeight: 0.15
    });
  });

  it("still normalizes legacy numeric payloads for any remaining low-level callers", () => {
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
