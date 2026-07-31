import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLOW_REQUEST_MS,
  installPerformanceMonitoring,
  resolveSlowRequestThreshold,
  type SlowRequestDetails
} from "../../src/server/performanceMonitoring.js";

describe("performance monitoring", () => {
  it("falls back when the slow request threshold is invalid", () => {
    expect(resolveSlowRequestThreshold(undefined)).toBe(DEFAULT_SLOW_REQUEST_MS);
    expect(resolveSlowRequestThreshold("-1")).toBe(DEFAULT_SLOW_REQUEST_MS);
    expect(resolveSlowRequestThreshold("invalid")).toBe(DEFAULT_SLOW_REQUEST_MS);
    expect(resolveSlowRequestThreshold("250")).toBe(250);
  });

  it("logs only the route pattern and exposes server timing", async () => {
    const slowRequests: SlowRequestDetails[] = [];
    const app = Fastify({ logger: false });
    installPerformanceMonitoring(app, {
      slowRequestMs: 0,
      logSlowRequest: (details) => slowRequests.push(details)
    });
    app.get("/api/items/:id", async () => ({ ok: true }));

    const response = await app.inject({
      method: "GET",
      url: "/api/items/42?token=must-not-be-logged"
    });

    expect(response.headers["server-timing"]).toMatch(/^app;dur=\d+\.\d$/);
    expect(slowRequests).toHaveLength(1);
    expect(slowRequests[0]).toMatchObject({
      method: "GET",
      route: "/api/items/:id",
      statusCode: 200
    });
    expect(JSON.stringify(slowRequests[0])).not.toContain("must-not-be-logged");

    await app.close();
  });

  it("keeps fast requests quiet", async () => {
    const slowRequests: SlowRequestDetails[] = [];
    const app = Fastify({ logger: false });
    installPerformanceMonitoring(app, {
      slowRequestMs: 60_000,
      logSlowRequest: (details) => slowRequests.push(details)
    });
    app.get("/health", async () => ({ ok: true }));

    await app.inject({ method: "GET", url: "/health" });

    expect(slowRequests).toEqual([]);
    await app.close();
  });
});
