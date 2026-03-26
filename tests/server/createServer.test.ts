import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server/createServer.js";

describe("createServer", () => {
  it("returns a health response", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
