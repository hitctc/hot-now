import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDatabaseHandle } from "../helpers/testDatabase.js";
import { createTestDatabase } from "../helpers/testDatabase.js";
import {
  authenticateApiAccessToken,
  createApiAccessToken,
  listApiAccessTokens,
  revokeApiAccessToken
} from "../../src/core/auth/apiAccessTokenRepository.js";
import { createSessionToken, sessionCookieName } from "../../src/core/auth/session.js";
import { createServer } from "../../src/server/createServer.js";

const apps: Array<ReturnType<typeof createServer>> = [];
let handle: TestDatabaseHandle;

beforeEach(async () => {
  handle = await createTestDatabase();
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  handle.close();
});

describe("API access token authentication", () => {
  it("allows a bearer token to use existing authenticated read and write APIs", async () => {
    const token = createApiAccessToken(handle.db, "admin", "integration test").token;
    const saveRule = vi.fn().mockResolvedValue({ ok: true, ruleKey: "ai" });
    const triggerManualCollect = vi.fn().mockResolvedValue({ accepted: true, action: "collect" });
    const app = createServer({
      db: handle.db,
      auth: { requireLogin: true, sessionSecret: "test-secret" },
      apiTokens: {
        authenticate: (value) => authenticateApiAccessToken(handle.db, value),
        list: () => [],
        create: () => { throw new Error("not used"); },
        revoke: () => false
      },
      readWriteQueuePreferences: () => null,
      saveContentFilterRule: saveRule,
      triggerManualCollect
    });
    apps.push(app);

    const readResponse = await app.inject({
      method: "GET",
      url: "/api/settings/write-queue-preferences",
      headers: { authorization: `Bearer ${token}` }
    });
    const writeResponse = await app.inject({
      method: "POST",
      url: "/actions/view-rules/content-filters",
      headers: { authorization: `Bearer ${token}` },
      payload: { ruleKey: "ai", toggles: {}, weights: {} }
    });
    const manualActionResponse = await app.inject({
      method: "POST",
      url: "/actions/collect",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(readResponse.statusCode).toBe(200);
    expect(writeResponse.statusCode).toBe(200);
    expect(manualActionResponse.statusCode).toBe(202);
    expect(saveRule).toHaveBeenCalledOnce();
    expect(triggerManualCollect).toHaveBeenCalledOnce();
  });

  it("rejects missing and revoked bearer tokens", async () => {
    const token = createApiAccessToken(handle.db, "admin", "revocable");
    const app = createServer({
      auth: { requireLogin: true, sessionSecret: "test-secret" },
      apiTokens: {
        authenticate: (value) => authenticateApiAccessToken(handle.db, value),
        list: () => [],
        create: () => { throw new Error("not used"); },
        revoke: () => false
      },
      readWriteQueuePreferences: () => null
    });
    apps.push(app);

    const missing = await app.inject({ method: "GET", url: "/api/settings/write-queue-preferences" });
    const revoked = await app.inject({
      method: "GET",
      url: "/api/settings/write-queue-preferences",
      headers: { authorization: `Bearer ${token.token}` }
    });
    handle.db.prepare("UPDATE admin_api_access_tokens SET revoked_at = ? WHERE id = ?")
      .run(new Date().toISOString(), token.id);
    const afterRevocation = await app.inject({
      method: "GET",
      url: "/api/settings/write-queue-preferences",
      headers: { authorization: `Bearer ${token.token}` }
    });

    expect(missing.statusCode).toBe(401);
    expect(revoked.statusCode).toBe(200);
    expect(afterRevocation.statusCode).toBe(401);
  });

  it("restricts token management to an administrator cookie session", async () => {
    const app = createServer({
      auth: { requireLogin: true, sessionSecret: "test-secret" },
      apiTokens: {
        authenticate: (value) => authenticateApiAccessToken(handle.db, value),
        list: (ownerUsername) => listApiAccessTokens(handle.db, ownerUsername),
        create: (ownerUsername, name) => createApiAccessToken(handle.db, ownerUsername, name),
        revoke: (id, ownerUsername) => revokeApiAccessToken(handle.db, id, ownerUsername)
      }
    });
    apps.push(app);
    const bearer = createApiAccessToken(handle.db, "admin", "existing");
    const cookieSession = createSessionToken(
      { username: "admin", displayName: "系统管理员", role: "admin" },
      "test-secret"
    );
    const cookie = `${sessionCookieName}=${cookieSession}`;
    const viewerCookie = `${sessionCookieName}=${createSessionToken(
      { username: "admin", displayName: "普通用户", role: "viewer" },
      "test-secret"
    )}`;

    const viewerCreateAttempt = await app.inject({
      method: "POST",
      url: "/api/settings/access-tokens",
      headers: { cookie: viewerCookie },
      payload: { name: "not-admin" }
    });
    const keyListAttempt = await app.inject({
      method: "GET",
      url: "/api/settings/access-tokens",
      headers: { authorization: `Bearer ${bearer.token}` }
    });
    const list = await app.inject({ method: "GET", url: "/api/settings/access-tokens", headers: { cookie } });
    const created = await app.inject({
      method: "POST",
      url: "/api/settings/access-tokens",
      headers: { cookie },
      payload: { name: "automation" }
    });
    const createdToken = created.json<{ token: { id: number; token: string } }>().token;
    const keyRevokeAttempt = await app.inject({
      method: "DELETE",
      url: `/api/settings/access-tokens/${createdToken.id}`,
      headers: { authorization: `Bearer ${bearer.token}` }
    });
    const revoked = await app.inject({
      method: "DELETE",
      url: `/api/settings/access-tokens/${createdToken.id}`,
      headers: { cookie }
    });

    expect(viewerCreateAttempt.statusCode).toBe(403);
    expect(keyListAttempt.statusCode).toBe(401);
    expect(list.statusCode).toBe(200);
    expect(list.json<{ tokens: unknown[] }>().tokens).toHaveLength(1);
    expect(created.statusCode).toBe(201);
    expect(createdToken.token).toMatch(/^hn_live_/);
    expect(keyRevokeAttempt.statusCode).toBe(401);
    expect(revoked.statusCode).toBe(200);
  });
});
