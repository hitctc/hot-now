import Fastify from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RuntimeConfig } from "../core/types/appConfig.js";
import {
  createSessionToken,
  readSessionCookieToken,
  readSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie
} from "../core/auth/session.js";
import {
  renderControlPage,
  renderHistoryPage,
  renderNoticePage
} from "./renderPages.js";
import { findAppShellPage, getAppShellPages, renderAppLayout } from "./renderAppLayout.js";

type ReportSummary = {
  date: string;
  topicCount: number;
  degraded: boolean;
  mailStatus: string;
};

type ServerDeps = {
  config?: Partial<RuntimeConfig>;
  listReportSummaries?: () => Promise<ReportSummary[]>;
  latestReportDate?: () => Promise<string | null>;
  readReportHtml?: (date: string) => Promise<string>;
  triggerManualRun?: () => Promise<{ accepted: boolean }>;
  isRunning?: () => boolean;
  auth?: {
    requireLogin: boolean;
    sessionSecret: string;
    verifyLogin?: (
      username: string,
      password: string
    ) =>
      | Promise<{ username: string; displayName?: string | null; role?: string | null } | null>
      | { username: string; displayName?: string | null; role?: string | null }
      | null;
    sessionTtlSeconds?: number;
    secureCookie?: boolean;
  };
};

// This server keeps the old health route intact and layers report pages on top through dependency injection.
export function createServer(deps: ServerDeps = {}) {
  const app = Fastify({ logger: true });
  const authConfig = deps.auth;
  const authEnabled = authConfig?.requireLogin === true;
  const siteCss = readSiteCss();

  app.get("/health", async () => ({ ok: true }));
  app.get("/assets/site.css", async (_request, reply) => reply.type("text/css; charset=utf-8").send(siteCss));

  if (authEnabled) {
    app.get("/login", async (request, reply) => {
      const existingSession = readAuthenticatedSession(request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (existingSession) {
        return reply.redirect("/");
      }

      return reply.type("text/html").send(renderLoginPage());
    });

    app.post("/login", async (request, reply) => {
      if (!authConfig?.verifyLogin) {
        return reply.code(503).send({ ok: false, reason: "login-disabled" });
      }

      const body = request.body as { username?: unknown; password?: unknown } | undefined;
      const username = typeof body?.username === "string" ? body.username.trim() : "";
      const password = typeof body?.password === "string" ? body.password : "";

      if (!username || !password) {
        return reply.code(400).send({ ok: false, reason: "invalid-credentials-format" });
      }

      const user = await authConfig.verifyLogin(username, password);

      if (!user) {
        return reply.code(401).send({ ok: false, reason: "invalid-credentials" });
      }

      const sessionToken = createSessionToken(
        {
          username: user.username,
          displayName: user.displayName?.trim() || user.username,
          role: user.role?.trim() || "admin"
        },
        authConfig.sessionSecret,
        { maxAgeSeconds: authConfig.sessionTtlSeconds }
      );

      reply.header(
        "set-cookie",
        serializeSessionCookie(sessionToken, {
          maxAgeSeconds: authConfig.sessionTtlSeconds,
          secure: authConfig.secureCookie
        })
      );

      return reply.redirect("/");
    });

    app.post("/logout", async (_request, reply) => {
      reply.header(
        "set-cookie",
        serializeClearedSessionCookie({
          secure: authConfig?.secureCookie
        })
      );
      return reply.redirect("/login");
    });

    for (const page of getAppShellPages()) {
      app.get(page.path, async (request, reply) => {
        const session = readAuthenticatedSession(request.headers.cookie, authConfig?.sessionSecret ?? "");

        if (!session) {
          return reply.redirect("/login");
        }

        const currentPage = findAppShellPage(page.path);

        if (!currentPage) {
          return reply.code(404).type("text/html").send(renderNoticePage("HotNow", "页面不存在"));
        }

        return reply.type("text/html").send(
          renderAppLayout({
            currentPath: currentPage.path,
            page: currentPage,
            user: {
              username: session.username,
              displayName: session.displayName,
              role: session.role
            }
          })
        );
      });
    }
  } else {
    app.get("/", async (_request, reply) => {
      const latestDate = await deps.latestReportDate?.();

      if (!latestDate) {
        return reply.type("text/html").send(renderNoticePage("HotNow 最新报告", "今日尚未生成报告"));
      }

      if (!deps.readReportHtml) {
        return reply.code(503).type("text/html").send(renderNoticePage("HotNow 最新报告", "报告内容暂不可用"));
      }

      const html = await deps.readReportHtml(latestDate);
      return reply.type("text/html").send(html);
    });
  }

  app.get("/history", async (_request, reply) => {
    if (authEnabled) {
      // Legacy pages stay mounted for compatibility, but unified auth mode requires a valid session first.
      const session = readAuthenticatedSession(_request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (!session) {
        return reply.redirect("/login");
      }
    }

    const summaries = (await deps.listReportSummaries?.()) ?? [];
    return reply.type("text/html").send(renderHistoryPage(summaries));
  });

  app.get("/reports/:date", async (request, reply) => {
    if (authEnabled) {
      const session = readAuthenticatedSession(request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (!session) {
        return reply.redirect("/login");
      }
    }

    if (!deps.readReportHtml) {
      return reply.code(503).type("text/html").send(renderNoticePage("HotNow 报告", "报告内容暂不可用"));
    }

    const { date } = request.params as { date: string };
    const html = await deps.readReportHtml(date);
    return reply.type("text/html").send(html);
  });

  app.get("/control", async (_request, reply) => {
    if (authEnabled) {
      const session = readAuthenticatedSession(_request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (!session) {
        return reply.redirect("/login");
      }
    }

    return reply.type("text/html").send(renderControlPage(deps.config, deps.isRunning?.() ?? false));
  });

  app.post("/actions/run", async (request, reply) => {
    if (authEnabled) {
      // Manual trigger is a state-changing action, so anonymous callers get a hard auth error instead of redirect.
      const session = readAuthenticatedSession(request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (!session) {
        return reply.code(401).send({ accepted: false, reason: "unauthorized" });
      }
    }

    if (deps.isRunning?.()) {
      return reply.code(409).send({ accepted: false, reason: "already-running" });
    }

    if (!deps.triggerManualRun) {
      return reply.code(503).send({ accepted: false });
    }

    const result = await deps.triggerManualRun();
    return reply.code(202).send(result);
  });

  return app;
}

function readAuthenticatedSession(cookieHeader: string | undefined, sessionSecret: string) {
  // Session parsing is centralized so every protected route shares one validation path.
  const sessionToken = readSessionCookieToken(cookieHeader);

  if (!sessionToken || !sessionSecret) {
    return null;
  }

  return readSessionToken(sessionToken, sessionSecret);
}

function readSiteCss() {
  // CSS is loaded from the source tree so both tsx dev and built runtime can serve one shared stylesheet.
  try {
    return readFileSync(new URL("./public/site.css", import.meta.url), "utf8");
  } catch {
    try {
      return readFileSync(path.resolve(process.cwd(), "src/server/public/site.css"), "utf8");
    } catch {
      return "body{font-family:sans-serif;background:#f8fafc;color:#0f172a;}";
    }
  }
}

function renderLoginPage() {
  // Login remains a small self-contained page that posts JSON without adding extra Fastify plugins.
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>登录 | HotNow</title>
    <link rel="stylesheet" href="/assets/site.css" />
  </head>
  <body class="login-page">
    <main class="login-card">
      <h1>登录 HotNow</h1>
      <p class="login-subtitle">统一站点已启用账号校验，请使用管理员账号继续。</p>
      <form id="login-form">
        <label class="field-label" for="username">用户名</label>
        <input id="username" class="field-input" name="username" autocomplete="username" required />
        <label class="field-label" for="password">密码</label>
        <input
          id="password"
          class="field-input"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        />
        <button class="primary-button" type="submit">登录</button>
      </form>
      <p id="login-error" class="form-error"></p>
    </main>
    <script>
      const form = document.getElementById("login-form");
      const errorNode = document.getElementById("login-error");

      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorNode.textContent = "";
        const username = (document.getElementById("username")?.value || "").trim();
        const password = document.getElementById("password")?.value || "";
        const response = await fetch("/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, password })
        });

        if (response.redirected) {
          location.href = response.url;
          return;
        }

        if (response.status === 200 || response.status === 204 || response.status === 302) {
          location.href = "/";
          return;
        }

        errorNode.textContent = "登录失败，请检查用户名和密码。";
      });
    </script>
  </body>
</html>`;
}
