import type { SqliteDatabase } from "../db/openDatabase.js";
import {
  defaultViewRuleDefinitions,
  normalizeViewRuleConfig,
  type ViewRuleConfigValues,
  type ViewRuleKey
} from "./viewRuleConfig.js";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type DefaultViewRule = {
  ruleKey: ViewRuleKey;
  displayName: string;
  config: ViewRuleConfigValues;
  seedConfig: Record<string, JsonValue>;
};

export type ViewRuleConfig = {
  ruleKey: string;
  displayName: string;
  config: ViewRuleConfigValues;
  isEnabled: boolean;
};

export type SaveViewRuleConfigResult = { ok: true } | { ok: false; reason: "invalid-config" | "not-found" };

type ViewRuleRow = {
  rule_key: string;
  display_name: string;
  config_json: string;
  is_enabled: number;
};

const defaultViewRules: DefaultViewRule[] = defaultViewRuleDefinitions.map((rule) => ({
  ruleKey: rule.ruleKey,
  displayName: rule.displayName,
  config: rule.config,
  seedConfig: rule.seedConfig
}));

const defaultViewRuleByKey = new Map(defaultViewRules.map((rule) => [rule.ruleKey, rule]));

export function ensureDefaultViewRules(db: SqliteDatabase): void {
  // Default rules are inserted only when missing, so custom configs in config_json always win.
  const insertRule = db.prepare(
    `
      INSERT INTO view_rule_configs (rule_key, display_name, config_json, is_enabled)
      VALUES (@ruleKey, @displayName, @configJson, 1)
      ON CONFLICT(rule_key) DO NOTHING
    `
  );
  const ensureDefaults = db.transaction(() => {
    for (const rule of defaultViewRules) {
      // The seed keeps the legacy compact payload for compatibility, while reads normalize it into the new shape.
      insertRule.run({
        ruleKey: rule.ruleKey,
        displayName: rule.displayName,
        configJson: JSON.stringify(rule.seedConfig)
      });
    }
  });

  ensureDefaults();
}

export function listViewRules(db: SqliteDatabase): ViewRuleConfig[] {
  ensureDefaultViewRules(db);

  const rows = db
    .prepare(
      `
        SELECT rule_key, display_name, config_json, is_enabled
        FROM view_rule_configs
        ORDER BY id ASC
      `
    )
    .all() as ViewRuleRow[];

  return rows.map((row) => ({
    ruleKey: row.rule_key,
    displayName: row.display_name,
    config: parseConfigJson(row.rule_key, row.config_json),
    isEnabled: row.is_enabled === 1
  }));
}

export function saveViewRuleConfig(
  db: SqliteDatabase,
  ruleKey: string,
  config: unknown
): SaveViewRuleConfigResult {
  if (!isJsonObject(config)) {
    return { ok: false, reason: "invalid-config" };
  }

  ensureDefaultViewRules(db);

  const normalizedRuleKey = ruleKey.trim();
  const defaultRule = defaultViewRuleByKey.get(normalizedRuleKey as ViewRuleKey);

  if (!defaultRule) {
    return { ok: false, reason: "not-found" };
  }

  const normalizedConfig = normalizeViewRuleConfig(normalizedRuleKey, config);

  const updateResult = db
    .prepare(
      `
        UPDATE view_rule_configs
        SET config_json = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE rule_key = ?
      `
    )
    .run(JSON.stringify(normalizedConfig), normalizedRuleKey);

  if (updateResult.changes > 0) {
    return { ok: true };
  }

  db.prepare(
    `
      INSERT INTO view_rule_configs (rule_key, display_name, config_json, is_enabled)
      VALUES (?, ?, ?, 1)
    `
  ).run(defaultRule.ruleKey, defaultRule.displayName, JSON.stringify(normalizedConfig));

  return { ok: true };
}

function parseConfigJson(ruleKey: string, rawValue: string): ViewRuleConfigValues {
  // Persisted config_json is parsed defensively so one bad row does not break the whole settings page.
  try {
    const parsed = JSON.parse(rawValue);

    if (isJsonObject(parsed)) {
      return normalizeViewRuleConfig(ruleKey, parsed);
    }
  } catch {
    // Invalid rows fall through to deterministic defaults.
  }

  const defaultRule = defaultViewRuleByKey.get(ruleKey as ViewRuleKey);
  return defaultRule?.config ?? defaultViewRuleDefinitions[0].config;
}

function isJsonObject(value: unknown): value is Record<string, JsonValue> {
  // View rules currently use object-based config payloads; arrays/primitives are rejected as malformed input.
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
