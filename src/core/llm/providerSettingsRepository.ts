import type { SqliteDatabase } from "../db/openDatabase.js";
import { decryptProviderSecret, encryptProviderSecret } from "./providerSettingsCrypto.js";

export type LlmProviderKind = "deepseek" | "minimax" | "kimi";

export type SaveProviderSettingsInput = {
  providerKind: LlmProviderKind;
  apiKey: string;
};

export type UpdateProviderSettingsActivationInput = {
  providerKind: LlmProviderKind;
  enable: boolean;
};

export type ProviderSettingsMasterKeyInput = {
  settingsMasterKey: string | null;
};

export type SaveProviderSettingsResult = { ok: true } | { ok: false; reason: "master-key-required" };
export type UpdateProviderSettingsActivationResult = { ok: true } | { ok: false; reason: "not-found" };

export type ProviderSettingsSummary = {
  providerKind: LlmProviderKind;
  apiKeyLast4: string;
  isEnabled: boolean;
  updatedAt: string;
};

export type ResolvedProviderSettings = ProviderSettingsSummary & {
  apiKey: string;
};

export type ReadProviderSettingsResult =
  | { ok: true; settings: ResolvedProviderSettings | null }
  | { ok: false; reason: "master-key-required" | "decrypt-failed" };

type ProviderSettingsRow = {
  providerKind: LlmProviderKind;
  encryptedApiKey: string;
  apiKeyLast4: string;
  isEnabled: number;
  createdAt: string;
  updatedAt: string;
};

export function saveProviderSettings(
  db: SqliteDatabase,
  input: SaveProviderSettingsInput,
  masterKeyInput: ProviderSettingsMasterKeyInput
): SaveProviderSettingsResult {
  // Persisted provider settings must never store plaintext API keys, so writes are gated on the
  // separate master key even though the rest of the app can boot without NL matching enabled.
  if (!masterKeyInput.settingsMasterKey) {
    return { ok: false, reason: "master-key-required" };
  }

  db.prepare(
    `
      INSERT INTO llm_provider_settings (
        provider_kind,
        encrypted_api_key,
        api_key_last4,
        is_enabled
      )
      VALUES (
        ?,
        ?,
        ?,
        COALESCE((SELECT is_enabled FROM llm_provider_settings WHERE provider_kind = ?), 0)
      )
      ON CONFLICT(provider_kind) DO UPDATE SET
        encrypted_api_key = excluded.encrypted_api_key,
        api_key_last4 = excluded.api_key_last4,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(
    input.providerKind,
    encryptProviderSecret(input.apiKey, masterKeyInput.settingsMasterKey),
    readApiKeyLast4(input.apiKey),
    input.providerKind
  );

  return { ok: true };
}

export function listProviderSettingsSummaries(db: SqliteDatabase): ProviderSettingsSummary[] {
  // 工作台需要一次拿到所有已保存厂商，才能在切换选择后立刻判断当前厂商状态。
  const rows = db
    .prepare(
      `
        SELECT
          provider_kind AS providerKind,
          encrypted_api_key AS encryptedApiKey,
          api_key_last4 AS apiKeyLast4,
          is_enabled AS isEnabled,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM llm_provider_settings
        ORDER BY provider_kind
      `
    )
    .all() as ProviderSettingsRow[];

  return rows.map((row) => buildProviderSettingsSummary(row));
}

export function readProviderSettings(
  db: SqliteDatabase,
  query: { providerKind: LlmProviderKind },
  masterKeyInput: ProviderSettingsMasterKeyInput
): ReadProviderSettingsResult {
  if (!masterKeyInput.settingsMasterKey) {
    return { ok: false, reason: "master-key-required" };
  }

  const row = readProviderSettingsRowByKind(db, query.providerKind);

  if (!row) {
    return { ok: true, settings: null };
  }

  try {
    return {
      ok: true,
      settings: {
        ...buildProviderSettingsSummary(row),
        apiKey: decryptProviderSecret(row.encryptedApiKey, masterKeyInput.settingsMasterKey)
      }
    };
  } catch {
    return { ok: false, reason: "decrypt-failed" };
  }
}

export function getEnabledProviderSettingsSummary(db: SqliteDatabase): ProviderSettingsSummary | null {
  // 自然语言链路只认当前启用厂商，所以这里单独暴露启用态摘要给入口层判断能力开关。
  const row = readEnabledProviderSettingsRow(db);

  return row ? buildProviderSettingsSummary(row) : null;
}

export function readEnabledProviderSettings(
  db: SqliteDatabase,
  masterKeyInput: ProviderSettingsMasterKeyInput
): ReadProviderSettingsResult {
  if (!masterKeyInput.settingsMasterKey) {
    return { ok: false, reason: "master-key-required" };
  }

  const row = readEnabledProviderSettingsRow(db);

  if (!row) {
    return { ok: true, settings: null };
  }

  try {
    return {
      ok: true,
      settings: {
        providerKind: row.providerKind,
        apiKey: decryptProviderSecret(row.encryptedApiKey, masterKeyInput.settingsMasterKey),
        apiKeyLast4: row.apiKeyLast4,
        isEnabled: row.isEnabled === 1,
        updatedAt: row.updatedAt
      }
    };
  } catch {
    return { ok: false, reason: "decrypt-failed" };
  }
}

export function updateProviderSettingsActivation(
  db: SqliteDatabase,
  input: UpdateProviderSettingsActivationInput
): UpdateProviderSettingsActivationResult {
  // 启用状态必须保持单活，所以这里统一走事务，把旧启用项和新启用项一起切完。
  const updateActivation = db.transaction(
    (providerKind: LlmProviderKind, enable: boolean): UpdateProviderSettingsActivationResult => {
      const existingRow = readProviderSettingsRowByKind(db, providerKind);

      if (!existingRow) {
        return { ok: false, reason: "not-found" };
      }

      if (enable) {
        db.prepare(
          `
            UPDATE llm_provider_settings
            SET is_enabled = CASE WHEN provider_kind = ? THEN 1 ELSE 0 END,
                updated_at = CASE WHEN provider_kind = ? THEN CURRENT_TIMESTAMP ELSE updated_at END
          `
        ).run(providerKind, providerKind);
        return { ok: true };
      }

      db.prepare(
        `
          UPDATE llm_provider_settings
          SET is_enabled = 0,
              updated_at = CURRENT_TIMESTAMP
          WHERE provider_kind = ?
        `
      ).run(providerKind);

      return { ok: true };
    }
  );

  return updateActivation(input.providerKind, input.enable);
}

export function deleteProviderSettings(db: SqliteDatabase, providerKind: LlmProviderKind): boolean {
  // 删除只针对当前选中的厂商，其他已保存厂商配置必须保持不动。
  const result = db.prepare("DELETE FROM llm_provider_settings WHERE provider_kind = ?").run(providerKind);
  return result.changes > 0;
}

function readProviderSettingsRowByKind(db: SqliteDatabase, providerKind: LlmProviderKind): ProviderSettingsRow | null {
  const row = db
    .prepare(
      `
        SELECT
          provider_kind AS providerKind,
          encrypted_api_key AS encryptedApiKey,
          api_key_last4 AS apiKeyLast4,
          is_enabled AS isEnabled,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM llm_provider_settings
        WHERE provider_kind = ?
        LIMIT 1
      `
    )
    .get(providerKind) as ProviderSettingsRow | undefined;

  return row ?? null;
}

function readEnabledProviderSettingsRow(db: SqliteDatabase): ProviderSettingsRow | null {
  const row = db
    .prepare(
      `
        SELECT
          provider_kind AS providerKind,
          encrypted_api_key AS encryptedApiKey,
          api_key_last4 AS apiKeyLast4,
          is_enabled AS isEnabled,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM llm_provider_settings
        WHERE is_enabled = 1
        LIMIT 1
      `
    )
    .get() as ProviderSettingsRow | undefined;

  return row ?? null;
}

function buildProviderSettingsSummary(row: ProviderSettingsRow): ProviderSettingsSummary {
  // 摘要对象统一在这里组装，避免列表视图和启用态解析各自手写一遍字段转换。
  return {
    providerKind: row.providerKind,
    apiKeyLast4: row.apiKeyLast4,
    isEnabled: row.isEnabled === 1,
    updatedAt: row.updatedAt
  };
}

function readApiKeyLast4(apiKey: string): string {
  const normalized = apiKey.trim();
  return normalized.slice(-4);
}
