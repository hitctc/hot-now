import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
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

describe("createServer", () => {
  beforeAll(async () => {
    // Build first so the smoke check always exercises the emitted entry point.
    await runCommand("npm", ["run", "build"]);
  });

  it("returns a health response", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("starts the built entry point and returns health", async () => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/main.js", import.meta.url))], {
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

  it("redirects anonymous users to login when unified shell auth is enabled", async () => {
    const app = createServer({
      auth: {
        requireLogin: true,
        sessionSecret: "test-secret",
        verifyLogin: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({ method: "GET", url: "/articles" });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/login");
  });

  it("logs in and renders unified shell pages with user info", async () => {
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

    expect(shellResponse.statusCode).toBe(200);
    expect(shellResponse.body).toContain("系统管理员");
    expect(shellResponse.body).toContain("/articles");
    expect(shellResponse.body).toContain("/settings/profile");
    expect(shellResponse.body).toContain("热点资讯");
    expect(shellResponse.body).toContain("热门文章");
    expect(shellResponse.body).toContain("最新 AI 消息");
    expect(shellResponse.body).toContain("筛选策略");
    expect(shellResponse.body).toContain("数据迭代收集");
    expect(shellResponse.body).toContain("当前登录用户");
    expect(shellResponse.body).toContain("退出登录");
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
