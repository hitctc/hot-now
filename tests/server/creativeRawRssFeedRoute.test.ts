import { afterEach, describe, expect, it } from "vitest";

import { resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { createServer } from "../../src/server/createServer.js";
import { type TestDatabaseHandle, createTestDatabase } from "../helpers/testDatabase.js";

const handles: TestDatabaseHandle[] = [];

afterEach(() => {
  while (handles.length > 0) handles.pop()?.close();
});

describe("creative raw RSS feed route", () => {
  it("requires the creative token and returns missing RSS handoff items", async () => {
    const handle = await createTestDatabase("hot-now-creative-raw-rss-route-");
    handles.push(handle);
    const source = resolveSourceByKind(handle.db, "juya");
    if (!source) throw new Error("juya source missing in test database");
    const publishedAt = new Date().toISOString();
    upsertContentItems(handle.db, {
      sourceId: source.id,
      items: [{
        externalId: "route-rss-1",
        title: "路由交接 RSS 素材",
        canonicalUrl: "https://example.com/route-rss-1",
        publishedAt,
        fetchedAt: publishedAt
      }]
    });

    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });
    const unauthorized = await app.inject({
      method: "GET",
      url: "/api/creative/feed/raw-rss?sourceFeed=juya-ai-daily"
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/creative/feed/raw-rss?sourceFeed=juya-ai-daily&windowHours=48",
      headers: { "x-creative-token": "test-token" }
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      total: 1,
      items: [{ externalId: "route-rss-1", sourceFeed: "juya-ai-daily" }]
    });

    await app.close();
  });

  it("rejects an unsupported source feed without querying the database", async () => {
    const handle = await createTestDatabase("hot-now-creative-raw-rss-invalid-");
    handles.push(handle);
    const app = createServer({ db: handle.db, creativeApiToken: "test-token" });

    const response = await app.inject({
      method: "GET",
      url: "/api/creative/feed/raw-rss?sourceFeed=unknown",
      headers: { "x-creative-token": "test-token" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, reason: "invalid-source-feed" });

    await app.close();
  });
});
