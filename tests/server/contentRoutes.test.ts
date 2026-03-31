import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/createServer.js";

describe("content routes", () => {
  it("serves the AI-first content shell on /, /ai-new and /ai-hot, and removes /articles", async () => {
    const app = createServer({
      listContentView: vi.fn().mockResolvedValue([]),
      listRatingDimensions: vi.fn().mockResolvedValue([])
    } as never);

    for (const pathname of ["/", "/ai-new", "/ai-hot"]) {
      const response = await app.inject({ method: "GET", url: pathname });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('<div id="app"></div>');
      expect(response.body).toContain('/client/assets/');
    }

    const rootResponse = await app.inject({ method: "GET", url: "/" });

    expect(rootResponse.body).toContain('data-shell-nav href="/ai-new"');
    expect(rootResponse.body).toContain('data-shell-nav href="/ai-hot"');
    expect(rootResponse.body).toContain('data-shell-nav href="/settings/view-rules"');
    expect(rootResponse.body).not.toContain('href="/articles"');
    expect(rootResponse.body.indexOf('data-shell-nav href="/ai-new"')).toBeLessThan(
      rootResponse.body.indexOf('data-shell-nav href="/ai-hot"')
    );
    expect(rootResponse.body.indexOf('data-shell-nav href="/ai-hot"')).toBeLessThan(
      rootResponse.body.indexOf('data-shell-nav href="/settings/view-rules"')
    );

    const articlesResponse = await app.inject({ method: "GET", url: "/articles" });

    expect(articlesResponse.statusCode).toBe(404);
  });
});
