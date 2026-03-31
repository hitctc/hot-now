import { afterEach, describe, expect, it } from "vitest";
import {
  deleteProviderSettings,
  getProviderSettingsSummary,
  readProviderSettings,
  saveProviderSettings
} from "../../src/core/llm/providerSettingsRepository.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

describe("providerSettingsRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("stores encrypted provider settings and exposes only the summary metadata by default", async () => {
    const handle = await createTestDatabase("hot-now-provider-settings-");
    handles.push(handle);

    const saveResult = saveProviderSettings(
      handle.db,
      {
        providerKind: "deepseek",
        apiKey: "sk-live-secret-1234",
        isEnabled: true
      },
      {
        settingsMasterKey: "master-key-123"
      }
    );

    expect(saveResult).toEqual({ ok: true });

    const rawRow = handle.db
      .prepare(
        `
          SELECT provider_kind, encrypted_api_key, api_key_last4, is_enabled
          FROM llm_provider_settings
          WHERE id = 1
        `
      )
      .get() as {
      provider_kind: string;
      encrypted_api_key: string;
      api_key_last4: string;
      is_enabled: number;
    };

    expect(rawRow.provider_kind).toBe("deepseek");
    expect(rawRow.encrypted_api_key).not.toContain("sk-live-secret-1234");
    expect(rawRow.api_key_last4).toBe("1234");
    expect(rawRow.is_enabled).toBe(1);
    expect(getProviderSettingsSummary(handle.db)).toEqual({
      providerKind: "deepseek",
      apiKeyLast4: "1234",
      isEnabled: true,
      updatedAt: expect.any(String)
    });
    expect(readProviderSettings(handle.db, { settingsMasterKey: "master-key-123" })).toEqual({
      ok: true,
      settings: {
        providerKind: "deepseek",
        apiKey: "sk-live-secret-1234",
        apiKeyLast4: "1234",
        isEnabled: true,
        updatedAt: expect.any(String)
      }
    });
  });

  it("requires a master key before saving or decrypting provider settings", async () => {
    const handle = await createTestDatabase("hot-now-provider-settings-");
    handles.push(handle);

    expect(
      saveProviderSettings(
        handle.db,
        {
          providerKind: "kimi",
          apiKey: "kimi-secret-9999"
        },
        {
          settingsMasterKey: null
        }
      )
    ).toEqual({
      ok: false,
      reason: "master-key-required"
    });

    expect(
      saveProviderSettings(
        handle.db,
        {
          providerKind: "kimi",
          apiKey: "kimi-secret-9999"
        },
        {
          settingsMasterKey: "correct-master-key"
        }
      )
    ).toEqual({ ok: true });

    expect(readProviderSettings(handle.db, { settingsMasterKey: null })).toEqual({
      ok: false,
      reason: "master-key-required"
    });
    expect(readProviderSettings(handle.db, { settingsMasterKey: "wrong-master-key" })).toEqual({
      ok: false,
      reason: "decrypt-failed"
    });
  });

  it("deletes persisted provider settings", async () => {
    const handle = await createTestDatabase("hot-now-provider-settings-");
    handles.push(handle);

    saveProviderSettings(
      handle.db,
      {
        providerKind: "minimax",
        apiKey: "minimax-secret-5678"
      },
      {
        settingsMasterKey: "master-key-123"
      }
    );

    expect(deleteProviderSettings(handle.db)).toBe(true);
    expect(getProviderSettingsSummary(handle.db)).toBeNull();
  });
});
