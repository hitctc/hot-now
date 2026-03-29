import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LatestReportEmailError, type LatestReportEmailErrorReason } from "../core/pipeline/sendLatestReportEmail.js";
import type { ContentCardView, ContentViewKey } from "../core/content/listContentView.js";
import type { FeedbackSaveResult, ReactionValue } from "../core/feedback/feedbackRepository.js";
import type { RatingDimension, SaveRatingsResult } from "../core/ratings/ratingRepository.js";
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
import { renderContentPage } from "./renderContentPages.js";
import { renderProfilePage, renderSourcesPage, renderViewRulesPage } from "./renderSystemPages.js";

type ReportSummary = {
  date: string;
  topicCount: number;
  degraded: boolean;
  mailStatus: string;
};
type ParseRatingScoresResult =
  | { ok: true; scores: Record<string, number> }
  | { ok: false; reason: "invalid-ratings-payload" };
type SaveViewRuleResult = { ok: true } | { ok: false; reason: "invalid-config" | "not-found" };
type ToggleSourceResult = { ok: true } | { ok: false; reason: "not-found" };
type ViewRuleCard = {
  ruleKey: string;
  displayName: string;
  config: Record<string, unknown>;
  isEnabled: boolean;
};
type SourceCard = {
  kind: string;
  name: string;
  rssUrl: string | null;
  isEnabled: boolean;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
};
type CurrentUserProfile = {
  username: string;
  displayName: string;
  role: string;
  email: string | null;
};
type ManualCollectResult = { accepted: true; action: "collect" };
type ManualSendLatestEmailResult =
  | { accepted: true; action: "send-latest-email" }
  | { accepted: false; reason: LatestReportEmailErrorReason };

type ServerDeps = {
  config?: Partial<RuntimeConfig>;
  listReportSummaries?: () => Promise<ReportSummary[]>;
  latestReportDate?: () => Promise<string | null>;
  readReportHtml?: (date: string) => Promise<string>;
  triggerManualRun?: () => Promise<{ accepted: boolean }>;
  triggerManualCollect?: () => Promise<ManualCollectResult>;
  triggerManualSendLatestEmail?: () => Promise<ManualSendLatestEmailResult>;
  isRunning?: () => boolean;
  listContentView?: (viewKey: ContentViewKey) => Promise<ContentCardView[]> | ContentCardView[];
  saveFavorite?: (contentItemId: number, isFavorited: boolean) => Promise<FeedbackSaveResult> | FeedbackSaveResult;
  saveReaction?: (contentItemId: number, reaction: ReactionValue) => Promise<FeedbackSaveResult> | FeedbackSaveResult;
  listRatingDimensions?: () => Promise<RatingDimension[]> | RatingDimension[];
  saveRatings?: (contentItemId: number, scores: Record<string, number>) => Promise<SaveRatingsResult> | SaveRatingsResult;
  listViewRules?: () => Promise<ViewRuleCard[]> | ViewRuleCard[];
  saveViewRuleConfig?: (ruleKey: string, config: Record<string, unknown>) => Promise<SaveViewRuleResult> | SaveViewRuleResult;
  listSources?: () => Promise<SourceCard[]> | SourceCard[];
  toggleSource?: (kind: string, enable: boolean) => Promise<ToggleSourceResult> | ToggleSourceResult;
  getCurrentUserProfile?: () => Promise<CurrentUserProfile | null> | CurrentUserProfile | null;
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
  const hasUnifiedShellDeps = Boolean(
    deps.listContentView || deps.listViewRules || deps.listSources || deps.getCurrentUserProfile
  );
  const siteCss = readSiteCss();
  const siteJs = readSiteJs();

  app.get("/health", async () => ({ ok: true }));
  app.get("/assets/site.css", async (_request, reply) => reply.type("text/css; charset=utf-8").send(siteCss));
  app.get("/assets/site.js", async (_request, reply) => reply.type("application/javascript; charset=utf-8").send(siteJs));

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

        const contentViewKey = mapPathToContentViewKey(currentPage.path);
        const contentHtml = contentViewKey
          ? await renderContentForView(deps, contentViewKey)
          : await renderSystemPageForPath(deps, currentPage.path, true);

        return reply.type("text/html").send(
          renderAppLayout({
            currentPath: currentPage.path,
            page: currentPage,
            user: {
              username: session.username,
              displayName: session.displayName,
              role: session.role
            },
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

        const contentViewKey = mapPathToContentViewKey(currentPage.path);
        const contentHtml = contentViewKey
          ? await renderContentForView(deps, contentViewKey)
          : await renderSystemPageForPath(deps, currentPage.path, false);

        return reply.type("text/html").send(
          renderAppLayout({
            currentPath: currentPage.path,
            page: currentPage,
            contentHtml
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
    return await handleManualCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualCollect ?? deps.triggerManualRun
    );
  });

  app.post("/actions/collect", async (request, reply) => {
    return await handleManualCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualCollect ?? deps.triggerManualRun
    );
  });

  app.post("/actions/send-latest-email", async (request, reply) => {
    return await handleManualSendLatestEmailAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualSendLatestEmail
    );
  });

  app.post("/actions/content/:id/favorite", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.saveFavorite) {
      return reply.code(503).send({ ok: false, reason: "content-actions-disabled" });
    }

    const contentItemId = parseContentItemId(request.params);

    if (!contentItemId) {
      return reply.code(400).send({ ok: false, reason: "invalid-content-id" });
    }

    const body = request.body as { isFavorited?: unknown } | undefined;

    if (typeof body?.isFavorited !== "boolean") {
      return reply.code(400).send({ ok: false, reason: "invalid-favorite-payload" });
    }

    const result = await deps.saveFavorite(contentItemId, body.isFavorited);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, contentItemId, isFavorited: body.isFavorited });
  });

  app.post("/actions/content/:id/reaction", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.saveReaction) {
      return reply.code(503).send({ ok: false, reason: "content-actions-disabled" });
    }

    const contentItemId = parseContentItemId(request.params);

    if (!contentItemId) {
      return reply.code(400).send({ ok: false, reason: "invalid-content-id" });
    }

    const body = request.body as { reaction?: unknown } | undefined;

    if (!isReactionValue(body?.reaction)) {
      return reply.code(400).send({ ok: false, reason: "invalid-reaction" });
    }

    const result = await deps.saveReaction(contentItemId, body.reaction);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, contentItemId, reaction: body.reaction });
  });

  app.post("/actions/content/:id/ratings", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.saveRatings) {
      return reply.code(503).send({ ok: false, reason: "content-actions-disabled" });
    }

    const contentItemId = parseContentItemId(request.params);

    if (!contentItemId) {
      return reply.code(400).send({ ok: false, reason: "invalid-content-id" });
    }

    const body = request.body as { scores?: unknown } | undefined;
    const parsedScores = parseRatingScores(body?.scores);

    if (!parsedScores.ok) {
      return reply.code(400).send({ ok: false, reason: "invalid-ratings-payload" });
    }

    const result = await deps.saveRatings(contentItemId, parsedScores.scores);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    if (!result.ok && result.reason === "unknown-dimensions") {
      return reply.code(400).send({ ok: false, reason: "unknown-dimensions", unknownKeys: result.unknownKeys });
    }

    return reply.send({
      ok: true,
      contentItemId,
      saved: result.saved,
      averageRating: result.averageRating
    });
  });

  app.post("/actions/view-rules/:ruleKey", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.saveViewRuleConfig) {
      return reply.code(503).send({ ok: false, reason: "view-rules-disabled" });
    }

    const ruleKeyCandidate = (request.params as { ruleKey?: unknown } | undefined)?.ruleKey;
    const ruleKey = typeof ruleKeyCandidate === "string" ? ruleKeyCandidate.trim() : "";

    if (!ruleKey) {
      return reply.code(400).send({ ok: false, reason: "invalid-rule-key" });
    }

    const body = request.body as { config?: unknown } | undefined;

    if (!isPlainObject(body?.config)) {
      return reply.code(400).send({ ok: false, reason: "invalid-view-rule-payload" });
    }

    const result = await deps.saveViewRuleConfig(ruleKey, body.config);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    if (!result.ok && result.reason === "invalid-config") {
      return reply.code(400).send({ ok: false, reason: "invalid-view-rule-payload" });
    }

    return reply.send({ ok: true, ruleKey });
  });

  app.post("/actions/sources/toggle", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.toggleSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const body = request.body as { kind?: unknown; enable?: unknown } | undefined;
    const kind = typeof body?.kind === "string" ? body.kind.trim() : "";
    const enable = typeof body?.enable === "boolean" ? body.enable : null;

    if (!kind) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-kind" });
    }

    if (enable === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-enable" });
    }

    const result = await deps.toggleSource(kind, enable);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, kind, enable });
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

function readSiteJs() {
  // The browser helper stays optional at runtime, but the server still serves a safe fallback script.
  try {
    return readFileSync(new URL("./public/site.js", import.meta.url), "utf8");
  } catch {
    try {
      return readFileSync(path.resolve(process.cwd(), "src/server/public/site.js"), "utf8");
    } catch {
      return "(() => {})();";
    }
  }
}

function mapPathToContentViewKey(pathname: string): ContentViewKey | null {
  // Content menu paths map to one canonical view key so ranking logic stays inside content modules.
  if (pathname === "/") {
    return "hot";
  }

  if (pathname === "/articles") {
    return "articles";
  }

  if (pathname === "/ai") {
    return "ai";
  }

  return null;
}

async function renderContentForView(deps: ServerDeps, viewKey: ContentViewKey): Promise<string | undefined> {
  // Rendering stays data-only now: the page consumes scored cards and no longer needs rating dimensions.
  if (!deps.listContentView) {
    return undefined;
  }

  const cards = await deps.listContentView(viewKey);

  return renderContentPage({ viewKey, cards });
}

async function renderSystemPageForPath(deps: ServerDeps, pathname: string, loggedIn: boolean): Promise<string | undefined> {
  // System pages keep callback wiring in main; routes only decide which renderer to call for the current path.
  if (pathname === "/settings/view-rules") {
    if (!deps.listViewRules) {
      return undefined;
    }

    const rules = await deps.listViewRules();
    return renderViewRulesPage(rules);
  }

  if (pathname === "/settings/sources") {
    if (!deps.listSources) {
      return undefined;
    }

    const sources = await deps.listSources();
    return renderSourcesPage(sources, {
      canTriggerManualCollect: typeof (deps.triggerManualCollect ?? deps.triggerManualRun) === "function",
      canTriggerManualSendLatestEmail: typeof deps.triggerManualSendLatestEmail === "function",
      isRunning: deps.isRunning?.() ?? false
    });
  }

  if (pathname === "/settings/profile") {
    if (!deps.getCurrentUserProfile) {
      return undefined;
    }

    const profile = await deps.getCurrentUserProfile();

    if (!profile) {
      return renderProfilePage(null);
    }

    return renderProfilePage({
      username: profile.username,
      displayName: profile.displayName,
      role: profile.role,
      email: profile.email,
      loggedIn
    });
  }

  return undefined;
}

function ensureStateActionAuthorized(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string
) {
  // State-changing routes return hard 401 in auth mode, which keeps API-style actions script-friendly.
  if (!authEnabled) {
    return true;
  }

  const session = readAuthenticatedSession(request.headers.cookie, sessionSecret);

  if (!session) {
    void reply.code(401).send({ ok: false, reason: "unauthorized" });
    return false;
  }

  return true;
}

async function handleManualCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualCollect: ServerDeps["triggerManualCollect"] | ServerDeps["triggerManualRun"]
) {
  // Manual collection endpoints share the same auth, lock, and disabled semantics so the legacy alias stays behaviorally identical.
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualCollect();
  return reply.code(202).send(result);
}

async function handleManualSendLatestEmailAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualSendLatestEmail: ServerDeps["triggerManualSendLatestEmail"]
) {
  // Resend uses the same action gate as collection, but maps mail-specific pipeline errors to stable HTTP statuses.
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualSendLatestEmail) {
    return reply.code(503).send({ accepted: false });
  }

  try {
    const result = await triggerManualSendLatestEmail();

    if (result.accepted) {
      return reply.code(202).send(result);
    }

    return reply.code(mapLatestEmailReasonToStatus(result.reason)).send(result);
  } catch (error) {
    if (!(error instanceof LatestReportEmailError)) {
      throw error;
    }

    return reply.code(mapLatestEmailReasonToStatus(error.reason)).send({
      accepted: false,
      reason: error.reason
    });
  }
}

function ensureManualActionAuthorized(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string
) {
  // Manual job actions return API-style unauthorized payloads instead of redirects so browser forms and scripts see the same contract.
  if (!authEnabled) {
    return true;
  }

  const session = readAuthenticatedSession(request.headers.cookie, sessionSecret);

  if (!session) {
    void reply.code(401).send({ accepted: false, reason: "unauthorized" });
    return false;
  }

  return true;
}

function mapLatestEmailReasonToStatus(reason: LatestReportEmailErrorReason) {
  // The resend endpoint exposes pipeline reason codes directly, so callers can distinguish missing reports from delivery failures.
  if (reason === "not-found") {
    return 404;
  }

  if (reason === "report-unavailable") {
    return 503;
  }

  return 502;
}

function parseContentItemId(params: unknown): number | null {
  // Action routes accept ids from path params only, so we enforce positive integer parsing here once.
  const idCandidate = (params as { id?: unknown } | undefined)?.id;
  const parsedId = Number(idCandidate);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return null;
  }

  return parsedId;
}

function isReactionValue(value: unknown): value is ReactionValue {
  // Only the three explicit reaction values are accepted to avoid writing arbitrary feedback strings.
  return value === "like" || value === "dislike" || value === "none";
}

function parseRatingScores(value: unknown): ParseRatingScoresResult {
  // Ratings payload is strict: one invalid entry invalidates the full request, so partial writes never happen.
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "invalid-ratings-payload" };
  }

  const parsedScores: Record<string, number> = {};

  for (const [dimensionKey, rawScore] of Object.entries(value)) {
    if (typeof dimensionKey !== "string" || !dimensionKey.trim()) {
      return { ok: false, reason: "invalid-ratings-payload" };
    }

    const score = Number(rawScore);

    if (!Number.isFinite(score) || score < 1 || score > 5) {
      return { ok: false, reason: "invalid-ratings-payload" };
    }

    parsedScores[dimensionKey] = score;
  }

  if (Object.keys(parsedScores).length === 0) {
    return { ok: false, reason: "invalid-ratings-payload" };
  }

  return { ok: true, scores: parsedScores };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  // System action payloads currently rely on JSON object shapes and reject arrays/primitives.
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
