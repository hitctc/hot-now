import { afterEach, describe, expect, it, vi } from "vitest";

import { createServer } from "../../src/server/createServer.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("remote API proxy", () => {
  it("forwards production login, rewrites the cookie and keeps the local redirect", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: {
        location: "https://now.achuan.cc/creative/finished-articles",
        "content-encoding": "gzip",
        "set-cookie": "hot_now_session=remote-session; Path=/; HttpOnly; Secure; SameSite=Lax"
      }
    }));
    const app = createServer({ remoteApiOrigin: "https://now.achuan.cc" });

    const response = await app.inject({
      method: "POST",
      url: "/login",
      headers: { "content-type": "application/json" },
      payload: { username: "admin", password: "secret" }
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("http://localhost/creative/finished-articles");
    expect(response.headers["set-cookie"]).toContain("hot_now_session=remote-session");
    expect(response.headers["set-cookie"]).not.toContain("Secure");
    expect(response.headers["content-encoding"]).toBeUndefined();
    const [loginUrl, loginInit] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(loginUrl)).toBe("https://now.achuan.cc/login");
    expect(loginInit).toEqual(expect.objectContaining({ method: "POST", redirect: "manual" }));

    await app.close();
  });

  it("forwards the browser cookie and JSON body to the production API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const app = createServer({ remoteApiOrigin: "https://now.achuan.cc" });

    const response = await app.inject({
      method: "PUT",
      url: "/actions/creative/finished-articles/2373",
      headers: {
        cookie: "hot_now_session=remote-session",
        "content-type": "application/json"
      },
      payload: { humanMarkdown: "正式数据新正文" }
    });

    expect(response.statusCode).toBe(200);
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(url)).toBe("https://now.achuan.cc/actions/creative/finished-articles/2373");
    expect((init?.headers as Headers).get("cookie")).toBe("hot_now_session=remote-session");
    expect(init?.body).toBe(JSON.stringify({ humanMarkdown: "正式数据新正文" }));

    await app.close();
  });

  it("does not alter an existing local route when remote mode is disabled", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(globalThis.fetch).toBe(originalFetch);

    await app.close();
  });
});
