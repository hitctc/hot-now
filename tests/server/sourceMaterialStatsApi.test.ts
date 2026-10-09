import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDatabaseHandle } from "../helpers/testDatabase.js";
import { createTestDatabase, insertTestContentItem } from "../helpers/testDatabase.js";
import { authenticateApiAccessToken, createApiAccessToken, listApiAccessTokens, revokeApiAccessToken } from "../../src/core/auth/apiAccessTokenRepository.js";
import { createSessionToken, sessionCookieName } from "../../src/core/auth/session.js";
import { createServer } from "../../src/server/createServer.js";

describe("source material stats API", () => {
  let handle: TestDatabaseHandle;
  let app: ReturnType<typeof createServer>;

  beforeEach(async () => {
    handle = await createTestDatabase();
    app = createServer({
      db: handle.db,
      auth: { requireLogin: true, sessionSecret: "test-secret" },
      apiTokens: {
        authenticate: (token) => authenticateApiAccessToken(handle.db, token),
        list: (ownerUsername) => listApiAccessTokens(handle.db, ownerUsername),
        create: (ownerUsername, name) => createApiAccessToken(handle.db, ownerUsername, name),
        revoke: (id, ownerUsername) => revokeApiAccessToken(handle.db, id, ownerUsername)
      }
    });
  });

  afterEach(async () => {
    await app.close();
    handle.close();
  });

  it("requires an admin session and returns daily counts without material payloads", async () => {
    insertTestContentItem(handle.db, {
      fetchedAt: "2026-10-06T16:00:00.000Z",
      canonicalUrl: "https://example.com/juya-stat"
    });
    const token = createApiAccessToken(handle.db, "admin", "stats test");

    const unauthorized = await app.inject({
      method: "GET",
      url: "/api/settings/source-material-stats?from=2026-10-07&to=2026-10-09"
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/settings/source-material-stats?from=2026-10-07&to=2026-10-09",
      headers: { authorization: `Bearer ${token.token}` }
    });
    const viewerCookie = `${sessionCookieName}=${createSessionToken(
      { username: "admin", displayName: "普通用户", role: "viewer" },
      "test-secret"
    )}`;
    const forbidden = await app.inject({
      method: "GET",
      url: "/api/settings/source-material-stats?from=2026-10-07&to=2026-10-09",
      headers: { cookie: viewerCookie }
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(forbidden.statusCode).toBe(403);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      from: "2026-10-07",
      to: "2026-10-09",
      timezone: "Asia/Shanghai",
      days: [
        { date: "2026-10-07", juyaRssCount: 1, aiHotCount: 0 },
        { date: "2026-10-08", juyaRssCount: 0, aiHotCount: 0 },
        { date: "2026-10-09", juyaRssCount: 0, aiHotCount: 0 }
      ]
    });
  });

  it("rejects invalid or overly wide date ranges", async () => {
    const token = createApiAccessToken(handle.db, "admin", "stats test");
    const invalidDate = await app.inject({
      method: "GET",
      url: "/api/settings/source-material-stats?from=2026-02-30&to=2026-10-09",
      headers: { authorization: `Bearer ${token.token}` }
    });
    const wideRange = await app.inject({
      method: "GET",
      url: "/api/settings/source-material-stats?from=2026-08-01&to=2026-10-09",
      headers: { authorization: `Bearer ${token.token}` }
    });

    expect(invalidDate.statusCode).toBe(400);
    expect(invalidDate.json()).toEqual({ ok: false, reason: "invalid-date-range" });
    expect(wideRange.statusCode).toBe(400);
  });
});
