import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/core/auth/passwords.js";
import { createSessionToken, readSessionToken } from "../../src/core/auth/session.js";

describe("auth session helpers", () => {
  it("creates and reads a signed session token", () => {
    const token = createSessionToken(
      { username: "admin", displayName: "Admin", role: "admin" },
      "test-secret",
      { maxAgeSeconds: 300, now: () => 1_000 }
    );
    const parsed = readSessionToken(token, "test-secret", { now: () => 1_100 });

    expect(parsed).toEqual({
      username: "admin",
      displayName: "Admin",
      role: "admin",
      issuedAt: 1_000,
      expiresAt: 1_300
    });
  });

  it("uses a fixed 7 day default session ttl", () => {
    const token = createSessionToken(
      { username: "admin", displayName: "Admin", role: "admin" },
      "test-secret",
      { now: () => 1_000 }
    );
    const parsed = readSessionToken(token, "test-secret", { now: () => 1_100 });

    expect(parsed?.expiresAt).toBe(1_000 + 60 * 60 * 24 * 7);
  });

  it("returns null for a tampered token", () => {
    const token = createSessionToken({ username: "admin", displayName: "Admin", role: "admin" }, "test-secret");
    const tamperedToken = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");

    expect(readSessionToken(tamperedToken, "test-secret")).toBeNull();
  });

  it("returns null for an expired token", () => {
    const token = createSessionToken(
      { username: "admin", displayName: "Admin", role: "admin" },
      "test-secret",
      { maxAgeSeconds: 60, now: () => 1_000 }
    );

    expect(readSessionToken(token, "test-secret", { now: () => 1_061 })).toBeNull();
  });

  it("hashes and verifies passwords with scrypt format", () => {
    const hashed = hashPassword("admin-password");

    expect(hashed).toMatch(/^scrypt\$/);
    expect(verifyPassword("admin-password", hashed)).toBe(true);
    expect(verifyPassword("wrong-password", hashed)).toBe(false);
  });
});
