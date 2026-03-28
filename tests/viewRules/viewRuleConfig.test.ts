import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { listViewRules } from "../../src/core/viewRules/viewRuleRepository.js";
import { normalizeViewRuleConfig } from "../../src/core/viewRules/viewRuleConfig.js";

describe("viewRuleConfig", () => {
  const databasesToClose: ReturnType<typeof openDatabase>[] = [];

  afterEach(() => {
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

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

  it("normalizes legacy persisted rule rows when reading from the repository", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-view-rule-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);

    db.prepare(
      `
        INSERT INTO view_rule_configs (rule_key, display_name, config_json, is_enabled)
        VALUES (?, ?, ?, ?)
      `
    ).run("hot", "热点策略", JSON.stringify({ limit: 11, sort: "recent" }), 1);

    const rules = listViewRules(db);
    const hotRule = rules.find((rule) => rule.ruleKey === "hot");

    expect(hotRule?.config).toEqual({
      limit: 11,
      freshnessWindowDays: 3,
      freshnessWeight: 0.35,
      sourceWeight: 0.1,
      completenessWeight: 0.1,
      aiWeight: 0.05,
      heatWeight: 0.4
    });
  });
});
