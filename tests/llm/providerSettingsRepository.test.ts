import { afterEach, describe, expect, it } from "vitest";
import {
  getEnabledProviderSettingsSummary,
  listProviderSettingsSummaries,
  readEnabledProviderSettings,
  deleteProviderSettings,
  readProviderSettings,
  saveProviderSettings,
  updateProviderSettingsActivation
} from "../../src/core/llm/providerSettingsRepository.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

describe("providerSettingsRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("stores encrypted provider settings per provider and exposes only summary metadata by default", async () => {
    const handle = await createTestDatabase("hot-now-provider-settings-");
    handles.push(handle);

    const deepseekSaveResult = saveProviderSettings(
      handle.db,
      {
        providerKind: "deepseek",
        apiKey: "sk-live-secret-1234"
      },
      {
        settingsMasterKey: "master-key-123"
      }
    );
    const minimaxSaveResult = saveProviderSettings(
      handle.db,
      {
        providerKind: "minimax",
        apiKey: "minimax-secret-5678"
      },
      {
        settingsMasterKey: "master-key-123"
      }
    );

    expect(deepseekSaveResult).toEqual({ ok: true });
    expect(minimaxSaveResult).toEqual({ ok: true });

    const rawRows = handle.db
      .prepare(
        `
          SELECT provider_kind, encrypted_api_key, api_key_last4, is_enabled
          FROM llm_provider_settings
          ORDER BY provider_kind
        `
      )
      .all() as Array<{
      provider_kind: string;
      encrypted_api_key: string;
      api_key_last4: string;
      is_enabled: number;
    }>;

    expect(rawRows).toHaveLength(2);
    expect(rawRows[0]).toMatchObject({
      provider_kind: "deepseek",
      api_key_last4: "1234",
      is_enabled: 0
    });
    expect(rawRows[0]!.encrypted_api_key).not.toContain("sk-live-secret-1234");
    expect(rawRows[1]).toMatchObject({
      provider_kind: "minimax",
      api_key_last4: "5678",
      is_enabled: 0
    });
    expect(rawRows[1]!.encrypted_api_key).not.toContain("minimax-secret-5678");
    expect(listProviderSettingsSummaries(handle.db)).toEqual([
      {
        providerKind: "deepseek",
        apiKeyLast4: "1234",
        isEnabled: false,
        updatedAt: expect.any(String)
      },
      {
        providerKind: "minimax",
        apiKeyLast4: "5678",
        isEnabled: false,
        updatedAt: expect.any(String)
      }
    ]);
    expect(getEnabledProviderSettingsSummary(handle.db)).toBeNull();
    expect(
      readProviderSettings(
        handle.db,
        {
          providerKind: "minimax"
        },
        { settingsMasterKey: "master-key-123" }
      )
    ).toEqual({
      ok: true,
      settings: {
        providerKind: "minimax",
        apiKey: "minimax-secret-5678",
        apiKeyLast4: "5678",
        isEnabled: false,
        updatedAt: expect.any(String)
      }
    });
  });

  it("enables one saved provider at a time without deleting the others", async () => {
    const handle = await createTestDatabase("hot-now-provider-settings-");
    handles.push(handle);

    saveProviderSettings(
      handle.db,
      {
        providerKind: "deepseek",
        apiKey: "sk-live-secret-1234"
      },
      {
        settingsMasterKey: "master-key-123"
      }
    );
    saveProviderSettings(
      handle.db,
      {
        providerKind: "kimi",
        apiKey: "kimi-secret-9999"
      },
      {
        settingsMasterKey: "master-key-123"
      }
    );

    expect(
      updateProviderSettingsActivation(handle.db, {
        providerKind: "deepseek",
        enable: true
      })
    ).toEqual({ ok: true });
    expect(getEnabledProviderSettingsSummary(handle.db)).toEqual({
      providerKind: "deepseek",
      apiKeyLast4: "1234",
      isEnabled: true,
      updatedAt: expect.any(String)
    });
    expect(readEnabledProviderSettings(handle.db, { settingsMasterKey: "master-key-123" })).toEqual({
      ok: true,
      settings: {
        providerKind: "deepseek",
        apiKey: "sk-live-secret-1234",
        apiKeyLast4: "1234",
        isEnabled: true,
        updatedAt: expect.any(String)
      }
    });

    expect(
      updateProviderSettingsActivation(handle.db, {
        providerKind: "kimi",
        enable: true
      })
    ).toEqual({ ok: true });
    expect(listProviderSettingsSummaries(handle.db)).toEqual([
      {
        providerKind: "deepseek",
        apiKeyLast4: "1234",
        isEnabled: false,
        updatedAt: expect.any(String)
      },
      {
        providerKind: "kimi",
        apiKeyLast4: "9999",
        isEnabled: true,
        updatedAt: expect.any(String)
      }
    ]);
    expect(
      updateProviderSettingsActivation(handle.db, {
        providerKind: "kimi",
        enable: false
      })
    ).toEqual({ ok: true });
    expect(getEnabledProviderSettingsSummary(handle.db)).toBeNull();
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

    expect(
      readProviderSettings(
        handle.db,
        {
          providerKind: "kimi"
        },
        { settingsMasterKey: null }
      )
    ).toEqual({
      ok: false,
      reason: "master-key-required"
    });
    expect(
      readProviderSettings(
        handle.db,
        {
          providerKind: "kimi"
        },
        { settingsMasterKey: "wrong-master-key" }
      )
    ).toEqual({
      ok: false,
      reason: "decrypt-failed"
    });
  });

  it("deletes only the targeted provider settings", async () => {
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
    saveProviderSettings(
      handle.db,
      {
        providerKind: "deepseek",
        apiKey: "sk-live-secret-1234"
      },
      {
        settingsMasterKey: "master-key-123"
      }
    );

    expect(deleteProviderSettings(handle.db, "minimax")).toBe(true);
    expect(listProviderSettingsSummaries(handle.db)).toEqual([
      {
        providerKind: "deepseek",
        apiKeyLast4: "1234",
        isEnabled: false,
        updatedAt: expect.any(String)
      }
    ]);
  });
});
