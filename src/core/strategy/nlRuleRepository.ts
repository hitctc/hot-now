import type { SqliteDatabase } from "../db/openDatabase.js";
import {
  STRATEGY_GATE_SCOPES,
  isStrategyGateScope,
  type StrategyGateScope
} from "./strategyGateScopes.js";

export const DEFAULT_NL_RULE_SCOPES = STRATEGY_GATE_SCOPES;

export type NlRuleScope = StrategyGateScope;
export type NlRuleSet = {
  scope: NlRuleScope;
  enabled: boolean;
  ruleText: string;
  createdAt: string;
  updatedAt: string;
};

export type SaveNlRuleSetResult = { ok: true } | { ok: false; reason: "not-found" };

type NlRuleRow = {
  scope: string;
  enabled: number;
  ruleText: string;
  createdAt: string;
  updatedAt: string;
};

export type SaveNlRuleSetInput = {
  enabled: boolean;
  ruleText: string;
};

export function ensureDefaultNlRuleSets(db: SqliteDatabase): void {
  // Formal NL rule rows are seeded lazily so upgrades stay additive and empty scopes still render
  // predictably in the settings workbench before any admin customization.
  const insertIfMissing = db.prepare(
    `
      INSERT INTO nl_rule_sets (scope, is_enabled, rule_text)
      VALUES (?, 1, '')
      ON CONFLICT(scope) DO NOTHING
    `
  );
  const seedDefaults = db.transaction(() => {
    for (const scope of DEFAULT_NL_RULE_SCOPES) {
      insertIfMissing.run(scope);
    }
  });

  seedDefaults();
}

export function listNlRuleSets(db: SqliteDatabase): NlRuleSet[] {
  ensureDefaultNlRuleSets(db);

  const rows = db
    .prepare(
      `
        SELECT
          scope,
          is_enabled AS enabled,
          rule_text AS ruleText,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM nl_rule_sets
        WHERE scope IN (${DEFAULT_NL_RULE_SCOPES.map(() => "?").join(", ")})
        ORDER BY CASE scope
          WHEN 'base' THEN 1
          WHEN 'ai_new' THEN 2
          WHEN 'ai_hot' THEN 3
          WHEN 'hero' THEN 4
          ELSE 99
        END ASC
      `
    )
    .all(...DEFAULT_NL_RULE_SCOPES) as NlRuleRow[];

  return rows.map((row) => ({
    scope: normalizeScope(row.scope),
    enabled: row.enabled === 1,
    ruleText: row.ruleText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

export function getNlRuleSet(db: SqliteDatabase, scope: NlRuleScope): NlRuleSet {
  ensureDefaultNlRuleSets(db);

  const row = db
    .prepare(
      `
        SELECT
          scope,
          is_enabled AS enabled,
          rule_text AS ruleText,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM nl_rule_sets
        WHERE scope = ?
        LIMIT 1
      `
    )
    .get(scope) as NlRuleRow | undefined;

  if (!row) {
    throw new Error(`nl rule set not found for scope: ${scope}`);
  }

  return {
    scope: normalizeScope(row.scope),
    enabled: row.enabled === 1,
    ruleText: row.ruleText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function saveNlRuleSet(db: SqliteDatabase, scope: string, input: SaveNlRuleSetInput): SaveNlRuleSetResult {
  ensureDefaultNlRuleSets(db);

  if (!isStrategyGateScope(scope)) {
    return { ok: false, reason: "not-found" };
  }

  db.prepare(
    `
      UPDATE nl_rule_sets
      SET is_enabled = ?,
          rule_text = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE scope = ?
    `
  ).run(input.enabled ? 1 : 0, input.ruleText.trim(), scope);

  return { ok: true };
}

function normalizeScope(value: string): NlRuleScope {
  return isStrategyGateScope(value) ? value : "base";
}
