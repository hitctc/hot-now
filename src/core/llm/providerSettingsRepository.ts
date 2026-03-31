import type { SqliteDatabase } from "../db/openDatabase.js";
import { decryptProviderSecret, encryptProviderSecret } from "./providerSettingsCrypto.js";

export type LlmProviderKind = "deepseek" | "minimax" | "kimi";

export type SaveProviderSettingsInput = {
  providerKind: LlmProviderKind;
  apiKey: string;
  isEnabled?: boolean;
};

export type ProviderSettingsMasterKeyInput = {
  settingsMasterKey: string | null;
};

export type SaveProviderSettingsResult = { ok: true } | { ok: false; reason: "master-key-required" };

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
        id,
        provider_kind,
        encrypted_api_key,
        api_key_last4,
        is_enabled
      )
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        provider_kind = excluded.provider_kind,
        encrypted_api_key = excluded.encrypted_api_key,
        api_key_last4 = excluded.api_key_last4,
        is_enabled = excluded.is_enabled,
        updated_at = CURRENT_TIMESTAMP
    `
  ).run(
    input.providerKind,
    encryptProviderSecret(input.apiKey, masterKeyInput.settingsMasterKey),
    readApiKeyLast4(input.apiKey),
    input.isEnabled === false ? 0 : 1
  );

  return { ok: true };
}

export function getProviderSettingsSummary(db: SqliteDatabase): ProviderSettingsSummary | null {
  const row = readProviderSettingsRow(db);

  if (!row) {
    return null;
  }

  return {
    providerKind: row.providerKind,
    apiKeyLast4: row.apiKeyLast4,
    isEnabled: row.isEnabled === 1,
    updatedAt: row.updatedAt
  };
}

export function readProviderSettings(
  db: SqliteDatabase,
  masterKeyInput: ProviderSettingsMasterKeyInput
): ReadProviderSettingsResult {
  if (!masterKeyInput.settingsMasterKey) {
    return { ok: false, reason: "master-key-required" };
  }

  const row = readProviderSettingsRow(db);

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

export function deleteProviderSettings(db: SqliteDatabase): boolean {
  const result = db.prepare("DELETE FROM llm_provider_settings WHERE id = 1").run();
  return result.changes > 0;
}

function readProviderSettingsRow(db: SqliteDatabase): ProviderSettingsRow | null {
  const row = db
    .prepare(
      `
        SELECT
          provider_kind AS providerKind,
          encrypted_api_key AS encryptedApiKey,
          api_key_last4 AS apiKeyLast4,
          is_enabled AS isEnabled,
          updated_at AS updatedAt
        FROM llm_provider_settings
        WHERE id = 1
        LIMIT 1
      `
    )
    .get() as ProviderSettingsRow | undefined;

  return row ?? null;
}

function readApiKeyLast4(apiKey: string): string {
  const normalized = apiKey.trim();
  return normalized.slice(-4);
}
