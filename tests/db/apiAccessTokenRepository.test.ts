import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDatabaseHandle } from "../helpers/testDatabase.js";
import { createTestDatabase } from "../helpers/testDatabase.js";
import {
  authenticateApiAccessToken,
  createApiAccessToken,
  listApiAccessTokens,
  revokeApiAccessToken
} from "../../src/core/auth/apiAccessTokenRepository.js";

describe("apiAccessTokenRepository", () => {
  let handle: TestDatabaseHandle;

  beforeEach(async () => {
    handle = await createTestDatabase();
  });

  afterEach(() => {
    handle.close();
  });

  it("stores only a digest and authenticates an active one-year token", () => {
    const now = new Date("2026-10-09T08:00:00.000Z");
    const created = createApiAccessToken(handle.db, "admin", "MacBook", now);
    const stored = handle.db.prepare("SELECT token_hash FROM admin_api_access_tokens WHERE id = ?").get(created.id) as {
      token_hash: string;
    };

    expect(created.expiresAt).toBe("2027-10-09T08:00:00.000Z");
    expect(stored.token_hash).not.toBe(created.token);
    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(authenticateApiAccessToken(handle.db, created.token, now)).toMatchObject({
      id: created.id,
      username: "admin",
      role: "admin",
      expiresAt: created.expiresAt
    });

    const lastUsed = handle.db.prepare("SELECT last_used_at FROM admin_api_access_tokens WHERE id = ?").get(created.id) as {
      last_used_at: string | null;
    };
    expect(lastUsed.last_used_at).toBe(now.toISOString());
  });

  it("does not expose plaintext tokens in listings and rejects expired, revoked, or unknown tokens", () => {
    const now = new Date("2026-10-09T08:00:00.000Z");
    const active = createApiAccessToken(handle.db, "admin", "Current", now);
    const revoked = createApiAccessToken(handle.db, "admin", "Revoked", now);

    expect(listApiAccessTokens(handle.db)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: active.id, name: "Current", revokedAt: null }),
        expect.objectContaining({ id: revoked.id, name: "Revoked", revokedAt: null })
      ])
    );
    expect(JSON.stringify(listApiAccessTokens(handle.db))).not.toContain(active.token);
    expect(authenticateApiAccessToken(handle.db, "unknown-token", now)).toBeNull();
    expect(authenticateApiAccessToken(handle.db, active.token, new Date("2027-10-10T08:00:00.000Z"))).toBeNull();

    expect(revokeApiAccessToken(handle.db, revoked.id, "admin", now)).toBe(true);
    expect(authenticateApiAccessToken(handle.db, revoked.token, now)).toBeNull();
    expect(revokeApiAccessToken(handle.db, revoked.id, "admin", now)).toBe(false);
  });

  it("rejects blank or overlong token names", () => {
    expect(() => createApiAccessToken(handle.db, "admin", "   ")).toThrow();
    expect(() => createApiAccessToken(handle.db, "admin", "x".repeat(65))).toThrow();
    expect(() => createApiAccessToken(handle.db, "admin", "line\nbreak")).toThrow();
  });
});
