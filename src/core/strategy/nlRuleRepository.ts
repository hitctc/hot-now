import type { SqliteDatabase } from "../db/openDatabase.js";

export const DEFAULT_NL_RULE_SCOPES = ["global", "hot", "articles", "ai"] as const;

export type NlRuleScope = (typeof DEFAULT_NL_RULE_SCOPES)[number];
export type NlRuleSet = {
  scope: NlRuleScope;
  ruleText: string;
  createdAt: string;
  updatedAt: string;
};

export type SaveNlRuleSetResult = { ok: true } | { ok: false; reason: "not-found" };

type NlRuleRow = {
  scope: string;
  ruleText: string;
  createdAt: string;
  updatedAt: string;
};

export function ensureDefaultNlRuleSets(db: SqliteDatabase): void {
  // Formal NL rule rows are seeded lazily so upgrades stay additive and empty scopes still render
  // predictably in the settings workbench before any admin customization.
  const insertIfMissing = db.prepare(
    `
      INSERT INTO nl_rule_sets (scope, rule_text)
      VALUES (?, '')
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
          rule_text AS ruleText,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM nl_rule_sets
        ORDER BY CASE scope
          WHEN 'global' THEN 1
          WHEN 'hot' THEN 2
          WHEN 'articles' THEN 3
          WHEN 'ai' THEN 4
          ELSE 99
        END ASC
      `
    )
    .all() as NlRuleRow[];

  return rows.map((row) => ({
    scope: normalizeScope(row.scope),
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
    ruleText: row.ruleText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function saveNlRuleSet(db: SqliteDatabase, scope: string, ruleText: string): SaveNlRuleSetResult {
  ensureDefaultNlRuleSets(db);

  if (!isNlRuleScope(scope)) {
    return { ok: false, reason: "not-found" };
  }

  db.prepare(
    `
      UPDATE nl_rule_sets
      SET rule_text = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE scope = ?
    `
  ).run(ruleText.trim(), scope);

  return { ok: true };
}

function isNlRuleScope(value: string): value is NlRuleScope {
  return DEFAULT_NL_RULE_SCOPES.includes(value as NlRuleScope);
}

function normalizeScope(value: string): NlRuleScope {
  return isNlRuleScope(value) ? value : "global";
}
