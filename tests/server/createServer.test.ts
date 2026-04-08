import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sessionCookieName } from "../../src/core/auth/session.js";
import { createServer } from "../../src/server/createServer.js";

function makeAppEnv() {
  return {
    ...process.env,
    PORT: "0",
    SMTP_HOST: "smtp.qq.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "sender@qq.com",
    SMTP_PASS: "test-auth-code",
    MAIL_TO: "receiver@example.com",
    BASE_URL: "http://127.0.0.1:3030",
    AUTH_USERNAME: "admin",
    AUTH_PASSWORD: "admin",
    SESSION_SECRET: "test-session-secret"
  };
}

async function runCommand(command: string, args: string[]) {
  const child = spawn(command, args, {
    env: process.env,
    stdio: "inherit"
  });

  const outcome = Promise.race([
    once(child, "error").then(([error]) => {
      throw error;
    }),
    once(child, "exit").then(([code]) => {
      if (code !== 0) {
        throw new Error(`${command} ${args.join(" ")} exited with code ${code}`);
      }
    })
  ]);

  await outcome;
}

async function waitForHealth(port: number) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // The server may still be starting up; keep polling until it responds.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for /health from the built entry point");
}

function pickCookieValue(setCookieHeader: string | string[] | undefined) {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;

  if (!raw) {
    return null;
  }

  return raw.split(";")[0] ?? null;
}

function extractListeningPort(output: string) {
  const matches = [...output.matchAll(/Server listening at http:\/\/127\.0\.0\.1:(\d+)/g)];
  const lastMatch = matches.at(-1);

  if (!lastMatch) {
    return null;
  }

  return Number(lastMatch[1]);
}

async function waitForListeningPort(child: ReturnType<typeof spawn>) {
  const chunks: string[] = [];

  const onData = (chunk: Buffer) => {
    chunks.push(chunk.toString("utf8"));
  };

  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  return await new Promise<number>((resolve, reject) => {
    const finish = (callback: () => void) => {
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
      child.off("exit", onExit);
      child.off("error", onError);
      callback();
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(() => {
        reject(
          new Error(
            `Built entry point exited before reporting a listening port (code: ${code}, signal: ${signal ?? "none"})`
          )
        );
      });
    };

    const onError = (error: Error) => {
      finish(() => reject(error));
    };

    const onListeningPort = () => {
      const port = extractListeningPort(chunks.join(""));

      if (typeof port !== "number" || !Number.isFinite(port)) {
        return;
      }

      finish(() => resolve(port));
    };

    child.on("exit", onExit);
    child.on("error", onError);
    child.stdout?.on("data", onListeningPort);
    child.stderr?.on("data", onListeningPort);
  });
}

function readClientIndexHtml() {
  return readFileSync(fileURLToPath(new URL("../../dist/client/index.html", import.meta.url)), "utf8");
}

function createClientDevIndexHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script type="module" src="/client/@vite/client"></script>
    <script type="module" src="/client/main.ts"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`;
}

function extractClientAssetPaths(html: string) {
  return [...html.matchAll(/\/client\/assets\/[^"' >]+\.(?:js|css)/g)].map((match) => match[0]);
}

describe("createServer", () => {
  beforeAll(async () => {
    // Build first so the smoke check always exercises the emitted entry point.
    await runCommand("npm", ["run", "build"]);
  }, 30000);

  it("returns a health response", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("starts the built entry point and returns health", async () => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/server/main.js", import.meta.url))], {
      // The built entry now boots the real digest app, so the smoke test has to provide the required runtime env.
      env: makeAppEnv(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    const childExit = once(child, "exit");
    const childError = once(child, "error").then(([error]) => {
      throw error;
    });
    const childFailedBeforePort = childExit.then(([code, signal]) => {
      throw new Error(
        `Built entry point exited before reporting a listening port (code: ${code}, signal: ${signal ?? "none"})`
      );
    });

    let port = 0;

    try {
      port = await Promise.race([waitForListeningPort(child), childError, childFailedBeforePort]);

      await Promise.race([waitForHealth(port), childError, childFailedBeforePort]);

      const response = await fetch(`http://127.0.0.1:${port}/health`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await childExit;
      }
    }
  });

  it("keeps content pages public when unified shell auth is enabled", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      },
      listContentView: vi.fn().mockResolvedValue([]),
      listRatingDimensions: vi.fn().mockResolvedValue([])
    });

    const response = await app.inject({ method: "GET", url: "/ai-new" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<div id="app"></div>');
    expect(response.body).toContain('/client/assets/');
    expect(response.body).not.toContain('class="shell-root"');
  });

  it("returns a readable fallback shell instead of fake asset paths when the client build is missing", async () => {
    const tempWorkspace = mkdtempSync(path.join(tmpdir(), "hot-now-missing-client-build-"));
    const app = createServer({
      clientBuildRoot: path.join(tempWorkspace, "dist/client"),
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue({
          username: "admin",
          displayName: "管理员",
          role: "owner"
        })
      },
      getCurrentUserProfile: vi.fn().mockResolvedValue({
        username: "admin",
        displayName: "管理员",
        role: "owner",
        email: "admin@example.com"
      })
    });

    const response = await app.inject({ method: "GET", url: "/settings/profile" });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/login");

    const loginResponse = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "admin", password: "admin" }
    });

    expect(loginResponse.statusCode).toBe(302);

    const sessionCookie = pickCookieValue(loginResponse.headers["set-cookie"]);

    expect(sessionCookie).toBeTruthy();

    const shellResponse = await app.inject({
      method: "GET",
      url: "/settings/profile",
      headers: {
        cookie: sessionCookie ?? ""
      }
    });

    expect(shellResponse.statusCode).toBe(200);
    expect(shellResponse.body).toContain("客户端资源未准备好");
    expect(shellResponse.body).toContain("npm run build:client");
    expect(shellResponse.body).not.toContain("/client/assets/index.js");
    expect(shellResponse.body).not.toContain("/client/assets/index.css");
  });

  it("redirects anonymous users to login for unified shell system pages when auth is enabled", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({ method: "GET", url: "/settings/profile" });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/login");
  });

  it("renders the shared workspace login page when auth is enabled", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({ method: "GET", url: "/login" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('class="login-page"');
    expect(response.body).toContain('class="login-shell"');
    expect(response.body).toContain('class="login-card"');
    expect(response.body).toContain("HotNow Workspace");
    expect(response.body).toContain('id="login-form"');
    expect(response.body).toContain('<link rel="stylesheet" href="/assets/site.css" />');
  });

  it("rejects anonymous collect actions when unified shell auth is enabled", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      },
      triggerManualCollect: vi.fn().mockResolvedValue({ accepted: true, action: "collect" })
    });

    const response = await app.inject({ method: "POST", url: "/actions/collect" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ accepted: false, reason: "unauthorized" });
  });

  it("rejects anonymous send-latest-email actions when unified shell auth is enabled", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      },
      triggerManualSendLatestEmail: vi.fn().mockResolvedValue({ accepted: true, action: "send-latest-email" })
    });

    const response = await app.inject({ method: "POST", url: "/actions/send-latest-email" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ accepted: false, reason: "unauthorized" });
  });

  it("logs in and serves the Vue client entry HTML for system pages", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue({
          username: "admin",
          displayName: "系统管理员",
          role: "admin"
        })
      }
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "admin", password: "admin" }
    });

    expect(loginResponse.statusCode).toBe(302);
    expect(loginResponse.headers.location).toBe("/");

    const cookie = pickCookieValue(loginResponse.headers["set-cookie"]);
    expect(cookie).toContain("hot_now_session=");

    const shellResponse = await app.inject({
      method: "GET",
      url: "/settings/profile",
      headers: {
        cookie: cookie ?? ""
      }
    });

    const clientIndexHtml = readClientIndexHtml();

    expect(shellResponse.statusCode).toBe(200);
    expect(shellResponse.body).toContain('<div id="app"></div>');
    expect(shellResponse.body).toContain('/client/assets/');
    expect(shellResponse.body).toContain('<script type="module" crossorigin src="/client/assets/');
    expect(shellResponse.body).toContain('<link rel="stylesheet" crossorigin href="/client/assets/');
    expect(shellResponse.body).not.toContain("系统管理员");
    expect(shellResponse.body).not.toContain("当前登录用户");
    expect(shellResponse.body).toBe(clientIndexHtml);
  });

  it("prefers the Vite dev client entry for content pages when a dev client origin is available", async () => {
    const app = createServer({
      clientDevOrigin: "http://127.0.0.1:5173",
      readClientDevEntryHtml: vi.fn().mockResolvedValue(createClientDevIndexHtml()),
      listContentView: vi.fn().mockResolvedValue([]),
      listRatingDimensions: vi.fn().mockResolvedValue([])
    });

    const response = await app.inject({ method: "GET", url: "/ai-new" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('src="http://127.0.0.1:5173/client/@vite/client"');
    expect(response.body).toContain('src="http://127.0.0.1:5173/client/main.ts"');
    expect(response.body).not.toContain('/client/assets/');
  });

  it("falls back to the built client entry when the Vite dev client entry is unavailable", async () => {
    const app = createServer({
      clientDevOrigin: "http://127.0.0.1:5173",
      readClientDevEntryHtml: vi.fn().mockResolvedValue(null),
      listContentView: vi.fn().mockResolvedValue([]),
      listRatingDimensions: vi.fn().mockResolvedValue([])
    });

    const response = await app.inject({ method: "GET", url: "/ai-new" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('/client/assets/');
    expect(response.body).toContain('<script type="module" crossorigin src="/client/assets/');
  });

  it("serves built client assets under /client/assets and blocks path traversal", async () => {
    const app = createServer();
    const clientIndexHtml = readClientIndexHtml();
    const assetPaths = extractClientAssetPaths(clientIndexHtml);

    expect(assetPaths.length).toBeGreaterThan(0);

    const jsAsset = assetPaths.find((assetPath) => assetPath.endsWith(".js"));
    const cssAsset = assetPaths.find((assetPath) => assetPath.endsWith(".css"));

    expect(jsAsset).toBeTruthy();
    expect(cssAsset).toBeTruthy();

    const jsResponse = await app.inject({ method: "GET", url: jsAsset ?? "" });
    const cssResponse = await app.inject({ method: "GET", url: cssAsset ?? "" });
    const traversalResponse = await app.inject({ method: "GET", url: "/client/assets/../index.html" });

    expect(jsResponse.statusCode).toBe(200);
    expect(jsResponse.headers["content-type"]).toContain("application/javascript");
    expect(jsResponse.body.length).toBeGreaterThan(0);
    expect(cssResponse.statusCode).toBe(200);
    expect(cssResponse.headers["content-type"]).toContain("text/css");
    expect(cssResponse.body.length).toBeGreaterThan(0);
    expect(traversalResponse.statusCode).toBe(404);
  });

  it("clears the session cookie on logout", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({ method: "POST", url: "/logout" });
    const setCookie = Array.isArray(response.headers["set-cookie"])
      ? response.headers["set-cookie"][0]
      : response.headers["set-cookie"];

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/login");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("accepts the browser logout form content type and redirects the cleared session back to login", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue({
          username: "admin",
          displayName: "系统管理员",
          role: "admin"
        })
      }
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/login",
      payload: { username: "admin", password: "admin" }
    });
    const loginCookie = pickCookieValue(loginResponse.headers["set-cookie"]);

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/logout",
      headers: {
        cookie: loginCookie ?? "",
        "content-type": "text/plain;charset=UTF-8"
      },
      payload: ""
    });
    const clearedCookie = pickCookieValue(logoutResponse.headers["set-cookie"]);

    const protectedResponse = await app.inject({
      method: "GET",
      url: "/settings/profile",
      headers: {
        cookie: clearedCookie ?? `${sessionCookieName}=`
      }
    });

    expect(logoutResponse.statusCode).toBe(302);
    expect(logoutResponse.headers.location).toBe("/login");
    expect(clearedCookie).toBe(`${sessionCookieName}=`);
    expect(protectedResponse.statusCode).toBe(302);
    expect(protectedResponse.headers.location).toBe("/login");
  });

  it("returns json for async logout requests that accept application/json", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/logout",
      headers: {
        accept: "application/json"
      }
    });
    const setCookie = Array.isArray(response.headers["set-cookie"])
      ? response.headers["set-cookie"][0]
      : response.headers["set-cookie"];

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(setCookie).toContain("Max-Age=0");
  });

  it("redirects anonymous legacy page routes to login when auth is enabled", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      },
      latestReportDate: vi.fn().mockResolvedValue("2026-03-26"),
      readReportHtml: vi.fn().mockResolvedValue("<html>report</html>")
    });

    const historyResponse = await app.inject({ method: "GET", url: "/history" });
    const reportResponse = await app.inject({ method: "GET", url: "/reports/2026-03-26" });
    const controlResponse = await app.inject({ method: "GET", url: "/control" });

    expect(historyResponse.statusCode).toBe(302);
    expect(historyResponse.headers.location).toBe("/login");
    expect(reportResponse.statusCode).toBe(302);
    expect(reportResponse.headers.location).toBe("/login");
    expect(controlResponse.statusCode).toBe(302);
    expect(controlResponse.headers.location).toBe("/login");
  });

  it("rejects anonymous manual run route with unauthorized when auth is enabled", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      },
      triggerManualRun: vi.fn().mockResolvedValue({ accepted: true })
    });

    const response = await app.inject({ method: "POST", url: "/actions/run" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ accepted: false, reason: "unauthorized" });
  });
});
