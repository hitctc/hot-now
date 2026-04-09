import { afterEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "../helpers/testDatabase.js";
import { getViewRuleConfig, saveViewRuleConfig } from "../../src/core/viewRules/viewRuleRepository.js";
import { normalizeViewRuleConfig } from "../../src/core/viewRules/viewRuleConfig.js";

describe("viewRuleRepository", () => {
  const handles: Array<Awaited<ReturnType<typeof createTestDatabase>>> = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("normalizes missing toggle fields back to rule defaults", () => {
    const normalized = normalizeViewRuleConfig("ai", {
      limit: 20,
      freshnessWindowDays: 5,
      freshnessWeight: 0.1,
      sourceWeight: 0.1,
      completenessWeight: 0.15,
      aiWeight: 0.5,
      heatWeight: 0.15
    });

    expect(normalized.enableTimeWindow).toBe(true);
    expect(normalized.enableSourceViewBonus).toBe(true);
    expect(normalized.enableAiKeywordWeight).toBe(true);
    expect(normalized.enableHeatKeywordWeight).toBe(true);
    expect(normalized.enableFreshnessWeight).toBe(true);
    expect(normalized.enableScoreRanking).toBe(true);
  });

  it("persists rule configs with toggle fields intact", async () => {
    const handle = await createTestDatabase("hot-now-view-rule-config-");
    handles.push(handle);

    saveViewRuleConfig(handle.db, "hot", {
      limit: 20,
      freshnessWindowDays: 3,
      freshnessWeight: 0.35,
      sourceWeight: 0.1,
      completenessWeight: 0.1,
      aiWeight: 0.05,
      heatWeight: 0.4,
      enableTimeWindow: false,
      enableSourceViewBonus: false,
      enableAiKeywordWeight: false,
      enableHeatKeywordWeight: true,
      enableFreshnessWeight: true,
      enableScoreRanking: false
    });

    expect(getViewRuleConfig(handle.db, "hot")).toMatchObject({
      enableTimeWindow: false,
      enableSourceViewBonus: false,
      enableAiKeywordWeight: false,
      enableHeatKeywordWeight: true,
      enableFreshnessWeight: true,
      enableScoreRanking: false
    });
  });
});
