import {
  createSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from "../../core/auth/session.js";
import { findAppShellPage, getAppShellPages, renderAppLayout } from "../renderAppLayout.js";
import { renderNoticePage } from "../renderPages.js";
import type { SitePageRouteContext } from "./sitePageRouteShared.js";
import {
  isClientSettingsPath,
  serveClientContentShell,
  serveClientSettingsShell,
} from "./sitePageAssetHelpers.js";
import { renderLoginPage, renderSystemPageForPath, redirectToLogin, safeRedirectTarget } from "./sitePageSystemHelpers.js";

/** 注册登录、统一壳层和系统页的页面路由，保持原有 session/redirect 语义。 */
export function registerSiteAuthRoutes(context: SitePageRouteContext): void {
  const {
    app,
    options,
    deps,
    authConfig,
    authEnabled,
    hasUnifiedShellDeps,
    clientIndexPath,
    clientDevOrigin,
  } = context;

  if (authEnabled) {
    app.get("/login", async (request, reply) => {
      const existingSession = options.readSession(request.headers.cookie);
      const redirectTarget = safeRedirectTarget((request.query as { redirect?: unknown } | undefined)?.redirect) || "";

      // 已登录访问 /login：有回跳目标就去目标，否则回首页
      if (existingSession) {
        return reply.redirect(redirectTarget || "/");
      }

      return reply.type("text/html").send(renderLoginPage(redirectTarget));
    });

    app.post("/login", async (request, reply) => {
      if (!authConfig?.verifyLogin) {
        return reply.code(503).send({ ok: false, reason: "login-disabled" });
      }

      const body = request.body as { username?: unknown; password?: unknown; redirect?: unknown } | undefined;
      const username = typeof body?.username === "string" ? body.username.trim() : "";
      const password = typeof body?.password === "string" ? body.password : "";
      const redirectTarget = safeRedirectTarget(body?.redirect) || "";

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

      return reply.redirect(redirectTarget || "/");
    });

    app.post("/logout", async (request, reply) => {
      reply.header(
        "set-cookie",
        serializeClearedSessionCookie({
          secure: authConfig?.secureCookie
        })
      );

      if (request.headers.accept?.includes("application/json")) {
        return reply.send({ ok: true });
      }

      return reply.redirect("/login");
    });

    for (const page of getAppShellPages()) {
      app.get(page.path, async (request, reply) => {
        const currentPage = findAppShellPage(page.path);

        if (!currentPage) {
          return reply.code(404).type("text/html").send(renderNoticePage("HotNow", "页面不存在"));
        }

        const session = options.readSession(request.headers.cookie);

        // Content pages stay readable without a session, but system pages still require an authenticated user.
        if (!session && (currentPage.section === "system" || currentPage.section === "creative")) {
          return redirectToLogin(reply, request);
        }

        if (isClientSettingsPath(currentPage.path)) {
          return await serveClientSettingsShell(reply, clientIndexPath, {
            clientDevOrigin,
            readClientDevEntryHtml: deps.readClientDevEntryHtml
          });
        }

        if (currentPage.section === "content" || currentPage.section === "creative") {
          return await serveClientContentShell(reply, clientIndexPath, {
            clientDevOrigin,
            readClientDevEntryHtml: deps.readClientDevEntryHtml
          });
        }

        const contentHtml = await renderSystemPageForPath(deps, currentPage.path, Boolean(session));

        return reply.type("text/html").send(
          renderAppLayout({
            currentPath: currentPage.path,
            page: currentPage,
            user: session
              ? {
                  username: session.username,
                  displayName: session.displayName,
                  role: session.role
                }
              : undefined,
            showSystemMenu: Boolean(session),
            loginHref: session ? undefined : "/login",
            contentHtml
          })
        );
      });
    }
  } else if (hasUnifiedShellDeps) {
    for (const page of getAppShellPages()) {
      app.get(page.path, async (_request, reply) => {
        const currentPage = findAppShellPage(page.path);

        if (!currentPage) {
          return reply.code(404).type("text/html").send(renderNoticePage("HotNow", "页面不存在"));
        }

        if (isClientSettingsPath(currentPage.path)) {
          return await serveClientSettingsShell(reply, clientIndexPath, {
            clientDevOrigin,
            readClientDevEntryHtml: deps.readClientDevEntryHtml
          });
        }

        if (currentPage.section === "content" || currentPage.section === "creative") {
          return await serveClientContentShell(reply, clientIndexPath, {
            clientDevOrigin,
            readClientDevEntryHtml: deps.readClientDevEntryHtml
          });
        }

        const contentHtml = await renderSystemPageForPath(deps, currentPage.path, false);

        return reply.type("text/html").send(
          renderAppLayout({
            currentPath: currentPage.path,
            page: currentPage,
            contentHtml
          })
        );
      });
    }
  }
}
