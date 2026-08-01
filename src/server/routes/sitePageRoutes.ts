import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SessionUser } from "../../core/auth/session.js";
import { createSessionToken, serializeClearedSessionCookie, serializeSessionCookie } from "../../core/auth/session.js";
import { readNextCollectionRunAt } from "../../core/scheduler/readNextCollectionRunAt.js";
import type { ContentSortMode } from "../../core/content/buildContentViewSelection.js";
import { readAiTimelineApiData } from "../aiTimelineApiData.js";
import {
  aiTimelineEventTypes,
  aiTimelineImportanceLevels,
  aiTimelineReliabilityStatuses,
  aiTimelineVisibilityStatuses,
  type AiTimelineHealthOverview,
  type AiTimelinePageModel,
  type AiTimelineSourceHealthRecord
} from "../../core/aiTimeline/aiTimelineTypes.js";
import type { ContentCardView, ContentViewKey } from "../../core/content/listContentView.js";
import type { ContentSourceOption } from "../../core/source/listContentSources.js";
import type { TwitterAccountRecord } from "../../core/twitter/twitterAccountRepository.js";
import type { TwitterSearchKeywordRecord } from "../../core/twitter/twitterSearchKeywordRepository.js";
import type { WechatRssSourceRecord } from "../../core/wechatRss/wechatRssSourceRepository.js";
import { renderControlPage, renderHistoryPage, renderNoticePage, renderNotFoundPage } from "../renderPages.js";
import { findAppShellPage, getAppShellPages, renderAppLayout } from "../renderAppLayout.js";
import { renderContentPage } from "../renderContentPages.js";
import { renderProfilePage, renderSourcesPage, renderViewRulesPage } from "../renderSystemPages.js";
import type { ContentPageModel, ServerDeps } from "../createServer.js";

/** 站点页面域仅保留实际需要的装配回调，避免路由模块持有完整服务入口。 */
type ContentPageKey = "ai-new" | "ai-hot";
type SettingsAiTimelineAdminResponse = {
  overview: AiTimelineHealthOverview;
  sources: AiTimelineSourceHealthRecord[];
  options: {
    eventTypes: typeof aiTimelineEventTypes;
    importanceLevels: typeof aiTimelineImportanceLevels;
    visibilityStatuses: typeof aiTimelineVisibilityStatuses;
    reliabilityStatuses: typeof aiTimelineReliabilityStatuses;
  };
  events: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
    filters: AiTimelinePageModel["filters"];
    events: AiTimelinePageModel["events"];
  };
};

type SitePageDeps = Pick<
  ServerDeps,
  | "auth"
  | "clientBuildRoot"
  | "clientDevOrigin"
  | "config"
  | "db"
  | "getContentPageModel"
  | "getCurrentUserProfile"
  | "getSourcesOperationSummary"
  | "getViewRulesWorkbenchData"
  | "isRunning"
  | "latestReportDate"
  | "listContentSources"
  | "listContentView"
  | "listSources"
  | "listTwitterAccounts"
  | "listTwitterSearchKeywords"
  | "listHackerNewsQueries"
  | "listBilibiliQueries"
  | "listWechatRssSources"
  | "getWeiboTrendingState"
  | "readAiTimelinePage"
  | "listReportSummaries"
  | "readClientDevEntryHtml"
  | "readReportHtml"
  | "triggerManualCollect"
  | "triggerManualRun"
  | "triggerManualSendLatestEmail"
  | "triggerManualTwitterCollect"
  | "triggerManualTwitterKeywordCollect"
>;

export interface SitePageRouteOptions extends SitePageDeps {
  creativeApiToken?: string;
  authorizeCreativeApiToken: (request: FastifyRequest, reply: FastifyReply) => boolean;
  readSession: (cookieHeader: string | undefined) => SessionUser | null;
}

/** 注册站点静态资源、公开内容、认证壳层和 legacy 页面。 */
export function registerSitePageRoutes(app: FastifyInstance, options: SitePageRouteOptions): void {
  const deps: SitePageDeps = options;
  const authConfig = options.auth;
  const authEnabled = authConfig?.requireLogin === true;
  const db = deps.db;
  const hasUnifiedShellDeps = Boolean(
    deps.listContentView || deps.getViewRulesWorkbenchData || deps.listSources || deps.getCurrentUserProfile
  );
  const siteCss = readSiteCss();
  const siteJs = readSiteJs();
  // Tests can override the client build root so missing-bundle scenarios do not mutate the process cwd.
  const clientBuildRoot = deps.clientBuildRoot ?? path.resolve(process.cwd(), "dist/client");
  const clientIndexPath = path.join(clientBuildRoot, "index.html");
  const clientDevOrigin = normalizeClientDevOrigin(deps.clientDevOrigin ?? null);

  app.get("/health", async () => ({ ok: true }));
  app.get("/assets/site.css", async (_request, reply) => reply.type("text/css; charset=utf-8").send(siteCss));
  app.get("/assets/site.js", async (_request, reply) => reply.type("application/javascript; charset=utf-8").send(siteJs));
  app.get("/favicon.ico", async (_request, reply) => {
    const faviconPath = path.resolve(process.cwd(), "src/server/public/brand/hotnow-favicon.png");

    try {
      return reply.type("image/png").send(readFileSync(faviconPath));
    } catch {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }
  });
  app.get("/brand/*", async (request, reply) => {
    const { "*": rawAssetPath = "" } = request.params as { "*": string };
    const normalizedAssetPath = normalizeClientAssetPath(rawAssetPath);

    if (!normalizedAssetPath || path.extname(normalizedAssetPath).toLowerCase() !== ".png") {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    const brandRoot = path.resolve(process.cwd(), "src/server/public/brand");
    const resolvedAssetPath = path.resolve(brandRoot, normalizedAssetPath);
    const brandRootWithSeparator = `${brandRoot}${path.sep}`;

    // 品牌静态资源只允许读取 brand 目录下的 png，避免请求路径越界到工作区其他文件。
    if (!resolvedAssetPath.startsWith(brandRootWithSeparator) && resolvedAssetPath !== brandRoot) {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    try {
      const assetBody = readFileSync(resolvedAssetPath);
      return reply
        .header("Cache-Control", resolveBrandCacheControl(request))
        .type("image/png")
        .send(assetBody);
    } catch {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }
  });
  app.get("/client/*", async (request, reply) => {
    const { "*": rawAssetPath = "" } = request.params as { "*": string };
    const normalizedAssetPath = normalizeClientAssetPath(rawAssetPath);

    if (!normalizedAssetPath) {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    const resolvedAssetPath = path.resolve(clientBuildRoot, normalizedAssetPath);
    const clientBuildRootWithSeparator = `${clientBuildRoot}${path.sep}`;

    // The static client endpoint only serves files that remain under dist/client.
    if (!resolvedAssetPath.startsWith(clientBuildRootWithSeparator) && resolvedAssetPath !== clientBuildRoot) {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    const extension = path.extname(resolvedAssetPath).toLowerCase();

    if (extension !== ".js" && extension !== ".css") {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    try {
      const assetBody = readFileSync(resolvedAssetPath, "utf8");
      return reply.type(resolveClientAssetMimeType(extension)).send(assetBody);
    } catch {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }
  });


  app.get("/api/content/ai-new", async (request, reply) => {
    return reply.send(await readContentPageModelApiData(deps, request, "ai-new"));
  });

  app.get("/api/content/ai-hot", async (request, reply) => {
    return reply.send(await readContentPageModelApiData(deps, request, "ai-hot"));
  });




  // ─── Creative: Feed API（为外部 Agent 暴露高分 AI 新讯候选，token 鉴权） ───

  app.get("/api/creative/feed/ai-new", async (request, reply) => {
    if (!options.authorizeCreativeApiToken(request, reply)) {
      return;
    }

    if (!deps.listContentView) {
      return reply.code(503).send({ ok: false, reason: "content-view-not-available" });
    }

    if (!db) {
      return reply.code(503).send({ ok: false, reason: "database-not-available" });
    }

    // minScore 为百分制整数（0-100），默认 80
    const query = request.query as Record<string, string | undefined>;
    const rawMinScore = parseFloat(query.minScore ?? "80");
    const minScore = Number.isFinite(rawMinScore) && rawMinScore >= 0 && rawMinScore <= 100 ? rawMinScore : 80;

    // 按评分降序拉取 AI 新讯全量候选（不传 selectedSourceKinds，不受用户来源偏好影响）
    const allCards = await deps.listContentView("ai", { sortMode: "content_score" });

    // 查出已推入素材库的 URL 集合，用于去重
    const pushedUrls = new Set<string>(
      (db.prepare("SELECT url FROM creative_source_items").all() as Array<{ url: string }>).map((r) => r.url)
    );

    const filtered = allCards
      .filter((card) => card.contentScore >= minScore && !pushedUrls.has(card.canonicalUrl))
      .slice(0, 50);

    // 批量取 body_markdown，RSS 来源大多为空，Agent 需自行抓取原文
    const idPlaceholders = filtered.map(() => "?").join(", ");
    const bodyRows = filtered.length > 0
      ? (db.prepare(`SELECT id, body_markdown FROM content_items WHERE id IN (${idPlaceholders})`).all(...filtered.map((c) => c.id)) as Array<{ id: number; body_markdown: string | null }>)
      : [];
    const bodyById = new Map(bodyRows.map((r) => [r.id, r.body_markdown]));

    const candidates = filtered.map((card) => ({
      id: card.id,
      title: card.title,
      summary: card.summary,
      fullContent: bodyById.get(card.id) ?? null,
      canonicalUrl: card.canonicalUrl,
      publishedAt: card.publishedAt,
      contentScore: card.contentScore,
      sourceName: card.sourceName,
      sourceKind: card.sourceKind
    }));

    return reply.send({ ok: true, total: candidates.length, items: candidates });
  });

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

  app.get("/history", async (request, reply) => {
    if (authEnabled) {
      // Legacy pages stay mounted for compatibility, but unified auth mode requires a valid session first.
      const session = options.readSession(request.headers.cookie);

      if (!session) {
        return redirectToLogin(reply, request);
      }
    }

    const summaries = (await deps.listReportSummaries?.()) ?? [];
    return reply.type("text/html").send(renderHistoryPage(summaries));
  });

  app.get("/reports/:date", async (request, reply) => {
    if (authEnabled) {
      const session = options.readSession(request.headers.cookie);

      if (!session) {
        return redirectToLogin(reply, request);
      }
    }

    if (!deps.readReportHtml) {
      return reply.code(503).type("text/html").send(renderNoticePage("HotNow 报告", "报告内容暂不可用"));
    }

    const { date } = request.params as { date: string };
    const html = await deps.readReportHtml(date);
    return reply.type("text/html").send(html);
  });

  app.get("/control", async (request, reply) => {
    if (authEnabled) {
      const session = options.readSession(request.headers.cookie);

      if (!session) {
        return redirectToLogin(reply, request);
      }
    }

    return reply.type("text/html").send(renderControlPage(deps.config, deps.isRunning?.() ?? false));
  });

  // ─── 404 fallback ───

  app.setNotFoundHandler((request, reply) => {
    // API 请求返回 JSON
    if (request.headers.accept?.includes("application/json") || request.url.startsWith("/api/")) {
      return reply.code(404).send({ ok: false, reason: "not-found", path: request.url });
    }

    // 浏览器请求返回 HTML 404 页面
    return reply.code(404).type("text/html; charset=utf-8").send(renderNotFoundPage(request.url));
  });

}

async function readClientEntryHtml(
  clientIndexPath: string,
  options: {
    clientDevOrigin: string | null;
    readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined;
  }
): Promise<string> {
  const devClientEntryHtml = await tryReadClientDevEntryHtml(options.clientDevOrigin, options.readClientDevEntryHtml);

  if (devClientEntryHtml) {
    return devClientEntryHtml;
  }

  // Unified shell routes prefer the built client entry, but still need a readable fallback when the frontend bundle is absent.
  try {
    return readFileSync(clientIndexPath, "utf8");
  } catch {
    // Missing frontend assets should fail loudly with a readable hint instead of referencing fake bundle names.
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HotNow 客户端资源未准备好</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: #eef3ff;
        background: #111722;
      }
      main {
        max-width: 560px;
        padding: 24px 28px;
        border: 1px solid rgba(126, 162, 255, 0.28);
        border-radius: 18px;
        background: rgba(23, 31, 44, 0.92);
        box-shadow: 0 24px 48px rgba(3, 8, 18, 0.48);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0;
        line-height: 1.7;
        color: #c4cedf;
      }
      code {
        font-family: "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
        color: #7ea2ff;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>客户端资源未准备好</h1>
      <p>请先运行 <code>npm run build:client</code>，或者重新执行 <code>npm run dev</code> / <code>npm run dev:local</code> 后再刷新。</p>
    </main>
  </body>
</html>
`;
  }
}

// 本地开发时允许 3030 页面直接借用 Vite dev server 的 HTML，这样入口路径不变也能拿到 HMR 和 Vue DevTools。
async function tryReadClientDevEntryHtml(
  clientDevOrigin: string | null,
  readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined
): Promise<string | null> {
  if (!clientDevOrigin) {
    return null;
  }

  const rawClientDevEntryHtml = readClientDevEntryHtml
    ? await readClientDevEntryHtml()
    : await fetchClientDevEntryHtml(clientDevOrigin);

  if (!rawClientDevEntryHtml?.trim()) {
    return null;
  }

  return rewriteClientDevEntryHtml(rawClientDevEntryHtml, clientDevOrigin);
}

// 这里只探测 Vite dev server 的根 HTML；失败时会自动回退到 dist/client，不把开发辅助能力变成硬依赖。
async function fetchClientDevEntryHtml(clientDevOrigin: string): Promise<string | null> {
  try {
    const response = await fetch(`${clientDevOrigin}/client/`, {
      headers: {
        Accept: "text/html"
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

// 开发态 HTML 会继续挂在 3030 域名下，所以这里把 /client/... 资源改写成当前 clientDevOrigin 绝对地址，避免还去命中构建产物。
function rewriteClientDevEntryHtml(clientEntryHtml: string, clientDevOrigin: string): string {
  const normalizedClientDevAssetBase = `${clientDevOrigin}/client/`;

  return clientEntryHtml
    .replaceAll('="/client/brand/', '="/brand/')
    .replaceAll("='/client/brand/", "='/brand/")
    .replaceAll('="/client/', `="${normalizedClientDevAssetBase}`)
    .replaceAll("='/client/", `='${normalizedClientDevAssetBase}`);
}

// 开发态入口只接受 origin 级配置，尾部斜杠统一在这里收掉，后面拼接 /client/ 时就不会重复。
function normalizeClientDevOrigin(clientDevOrigin: string | null): string | null {
  const normalizedClientDevOrigin = clientDevOrigin?.trim().replace(/\/+$/, "") ?? "";

  return normalizedClientDevOrigin ? normalizedClientDevOrigin : null;
}

function isClientSettingsPath(pathname: string) {
  // Settings routes still need a dedicated branch because legacy pages remain server-rendered.
  return pathname.startsWith("/settings/");
}

async function serveClientSettingsShell(
  reply: FastifyReply,
  clientIndexPath: string,
  options: {
    clientDevOrigin: string | null;
    readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined;
  }
) {
  // System pages should always render the latest available client entry.
  return reply.type("text/html; charset=utf-8").send(await readClientEntryHtml(clientIndexPath, options));
}

async function serveClientContentShell(
  reply: FastifyReply,
  clientIndexPath: string,
  options: {
    clientDevOrigin: string | null;
    readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined;
  }
) {
  // Content routes use the same live client entry and recover as soon as a client build exists.
  return reply.type("text/html; charset=utf-8").send(await readClientEntryHtml(clientIndexPath, options));
}

function resolveBrandCacheControl(request: FastifyRequest): string {
  // 页面引用使用版本参数，可安全长期缓存；未版本化直链保留短缓存，避免未来品牌更新长期滞后。
  const requestUrl = new URL(request.raw.url ?? request.url, "http://hot-now.local");

  return requestUrl.searchParams.has("v")
    ? "public, max-age=31536000, immutable"
    : "public, max-age=86400";
}

function normalizeClientAssetPath(rawAssetPath: string): string | null {
  // Static asset requests are normalized once so path traversal checks can operate on a clean relative path.
  const trimmedPath = rawAssetPath.trim().replace(/\\/g, "/");

  if (!trimmedPath) {
    return null;
  }

  const normalizedPath = path.posix.normalize(trimmedPath).replace(/^\/+/, "");

  if (!normalizedPath || normalizedPath === "." || normalizedPath.startsWith("..")) {
    return null;
  }

  return normalizedPath;
}

function resolveClientAssetMimeType(extension: string): string {
  // The client bundle only exposes CSS and JS in this phase, so a two-branch mime map is enough.
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }

  return "application/javascript; charset=utf-8";
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

async function readContentPageModelApiData(
  deps: SitePageDeps,
  request: FastifyRequest,
  pageKey: ContentPageKey
): Promise<ContentPageModel> {
  if (deps.getContentPageModel) {
    const selectedSourceKinds = readSelectedSourceKindsHeader(request.headers["x-hot-now-source-filter"]);
    const selectedTwitterAccountIds = readSelectedEntityIdsHeader(request.headers["x-hot-now-twitter-account-filter"]);
    const selectedTwitterKeywordIds = readSelectedEntityIdsHeader(request.headers["x-hot-now-twitter-keyword-filter"]);
    const selectedWechatRssSourceIds = readSelectedEntityIdsHeader(request.headers["x-hot-now-wechat-rss-filter"]);
    const sortMode = readContentSortModeHeader(request.headers["x-hot-now-content-sort"]);
    const searchKeyword = readContentSearchHeader(request.headers["x-hot-now-content-search"]);
    const page = readContentPageQueryPage(request);
    return deps.getContentPageModel(
      pageKey,
      selectedSourceKinds === undefined &&
        selectedTwitterAccountIds === undefined &&
        selectedTwitterKeywordIds === undefined &&
        selectedWechatRssSourceIds === undefined &&
        sortMode === undefined &&
        searchKeyword === undefined &&
        page === 1
        ? undefined
        : {
            selectedSourceKinds,
            selectedTwitterAccountIds,
            selectedTwitterKeywordIds,
            selectedWechatRssSourceIds,
            sortMode,
            page,
            searchKeyword
          }
    );
  }

  return buildContentPageModelFromDependencies(deps, request, pageKey);
}

async function readAiTimelineAdminApiData(deps: SitePageDeps, request: FastifyRequest) {
  return await readAiTimelineApiData({ readAiTimelinePage: deps.readAiTimelinePage }, request);
}

export async function readSettingsAiTimelineAdminApiData(
  deps: SitePageDeps,
  request: FastifyRequest
): Promise<SettingsAiTimelineAdminResponse> {
  const [overview, sources, events] = await Promise.all([
    readSettingsAiTimelineHealthOverview(deps),
    readSettingsAiTimelineSourceHealth(deps),
    readAiTimelineAdminApiData(deps, request)
  ]);

  return {
    overview,
    sources,
    options: {
      eventTypes: aiTimelineEventTypes,
      importanceLevels: aiTimelineImportanceLevels,
      visibilityStatuses: aiTimelineVisibilityStatuses,
      reliabilityStatuses: aiTimelineReliabilityStatuses
    },
    events
  };
}

async function readSettingsAiTimelineHealthOverview(deps: SitePageDeps): Promise<AiTimelineHealthOverview> {
  if (!deps.readAiTimelinePage) {
    return {
      visibleImportantCount7d: 0,
      latestVisiblePublishedAt: null,
      latestCollectStartedAt: null,
      failedSourceCount: 0,
      staleSourceCount: 0
    };
  }

  const model = await deps.readAiTimelinePage({
    visibilityStatuses: ["auto_visible"],
    recentDays: 7,
    page: 1,
    pageSize: 1
  });

  return {
    visibleImportantCount7d: model.pagination.totalResults,
    latestVisiblePublishedAt: model.events[0]?.publishedAt ?? null,
    latestCollectStartedAt: null,
    failedSourceCount: 0,
    staleSourceCount: 0
  };
}

async function readSettingsAiTimelineSourceHealth(_deps: SitePageDeps): Promise<AiTimelineSourceHealthRecord[]> {
  return [];
}

async function buildContentPageModelFromDependencies(
  deps: SitePageDeps,
  request: FastifyRequest,
  pageKey: ContentPageKey
): Promise<ContentPageModel> {
  const viewKey = pageKey === "ai-hot" ? "hot" : "ai";

  if (!deps.listContentView) {
    return {
      pageKey,
      featuredCard: null,
      cards: [],
      strategySummary: {
        pageKey,
        items: []
      },
      pagination: null,
      emptyState: {
        title: pageKey === "ai-hot" ? "暂无 AI 热点" : "暂无 AI 新讯",
        description: "可以稍后刷新，或先检查数据源采集状态。",
        tone: "default"
      }
    };
  }

  try {
    const twitterAccounts = (await deps.listTwitterAccounts?.()) ?? [];
    const twitterKeywords = (await deps.listTwitterSearchKeywords?.()) ?? [];
    const hackerNewsQueries = (await deps.listHackerNewsQueries?.()) ?? [];
    const bilibiliQueries = (await deps.listBilibiliQueries?.()) ?? [];
    const wechatRssSources = (await deps.listWechatRssSources?.()) ?? [];
    const sourceOptions = buildContentPageSourceOptions(
      ((await deps.listContentSources?.()) ?? []).filter((source) => source.isEnabled),
      twitterAccounts.length > 0,
      twitterKeywords.length > 0,
      hackerNewsQueries.length > 0,
      bilibiliQueries.length > 0,
      false,
      wechatRssSources.length > 0
    );
    const selectedSourceKinds = readContentPageSelectedSourceKinds(request.headers["x-hot-now-source-filter"], sourceOptions);
    const effectiveSelectedSourceKinds = selectedSourceKinds ?? deriveDefaultSelectedSourceKinds(sourceOptions);
    const twitterAccountFilter = buildTwitterAccountFilterModel(
      twitterAccounts,
      readSelectedEntityIdsHeader(request.headers["x-hot-now-twitter-account-filter"])
    );
    const twitterKeywordFilter = buildTwitterKeywordFilterModel(
      twitterKeywords,
      readSelectedEntityIdsHeader(request.headers["x-hot-now-twitter-keyword-filter"])
    );
    const wechatRssFilter = buildWechatRssFilterModel(
      wechatRssSources,
      readSelectedEntityIdsHeader(request.headers["x-hot-now-wechat-rss-filter"])
    );
    const sortMode = readContentSortModeHeader(request.headers["x-hot-now-content-sort"]) ?? "published_at";
    const searchKeyword = readContentSearchHeader(request.headers["x-hot-now-content-search"]);
    const requestedPage = readContentPageQueryPage(request);
    const allCards = await deps.listContentView(viewKey, {
      selectedSourceKinds: effectiveSelectedSourceKinds,
      selectedTwitterAccountIds:
        effectiveSelectedSourceKinds.includes("twitter_accounts") ? twitterAccountFilter?.selectedAccountIds : undefined,
      selectedTwitterKeywordIds:
        effectiveSelectedSourceKinds.includes("twitter_keyword_search") ? twitterKeywordFilter?.selectedKeywordIds : undefined,
      selectedWechatRssSourceIds:
        effectiveSelectedSourceKinds.includes("wechat_rss") ? wechatRssFilter?.selectedSourceIds : undefined,
      sortMode
    });
    const filteredCards = filterCardsByTitleKeyword(allCards, searchKeyword);
    const pagination = paginateContentCards(filteredCards, requestedPage);
    const currentPageVisibleCountsBySourceKind = countCurrentPageVisibleCardsBySourceKind(pagination.cards);

    return {
      pageKey,
      sourceFilter: sourceOptions.length > 0
        ? {
            options: sourceOptions.map((source) => ({
              kind: source.kind,
              name: source.name,
              showAllWhenSelected: source.showAllWhenSelected,
              currentPageVisibleCount: currentPageVisibleCountsBySourceKind[source.kind] ?? 0
            })),
            selectedSourceKinds: effectiveSelectedSourceKinds
          }
        : undefined,
      twitterAccountFilter,
      twitterKeywordFilter,
      wechatRssFilter,
      // AI 新讯和 AI 热点都统一成标准卡流，保留 featuredCard 仅作兼容空字段。
      featuredCard: null,
      cards: pagination.cards,
      strategySummary: {
        pageKey,
        items: []
      },
      pagination: pagination.meta,
      emptyState:
        effectiveSelectedSourceKinds.length === 0
          ? {
              title: "当前未选择任何数据源",
              description: "重新全选后即可恢复内容结果。",
              tone: "filtered"
            }
          : hasSearchKeyword(searchKeyword) && pagination.meta.totalResults === 0
            ? {
                title: "没有找到匹配的内容",
                description: "可以换个关键词，或清空搜索后查看全部结果。",
                tone: "filtered"
              }
          : pagination.meta.totalResults === 0
            ? {
                title: pageKey === "ai-new" ? "当前 24 小时内暂无 AI 新讯" : "暂无 AI 热点",
                description: pageKey === "ai-new"
                  ? "可以稍后刷新，或者检查最近 24 小时内是否有新的 AI 内容进入内容池。"
                  : "可以稍后刷新，或先检查数据源采集状态。",
                tone: "default"
              }
            : null
    };
  } catch (error) {
    if (!isMalformedContentStoreError(error)) {
      throw error;
    }

    return {
      pageKey,
      featuredCard: null,
      cards: [],
      strategySummary: {
        pageKey,
        items: []
      },
      pagination: null,
      emptyState: {
        title: "内容暂不可用",
        description: "检测到本地内容库读取失败，请修复或重建 data/hot-now.sqlite 后再刷新。",
        tone: "degraded"
      }
    };
  }
}

function countCurrentPageVisibleCardsBySourceKind(cards: ContentCardView[]) {
  // fallback 内容接口直接按当前请求已经返回的卡片分布计算来源数量，避免再跑一套独立稳定口径。
  const counts = new Map<string, number>();

  for (const card of cards) {
    if (!card.sourceKind) {
      continue;
    }

    counts.set(card.sourceKind, (counts.get(card.sourceKind) ?? 0) + 1);
  }

  return Object.fromEntries(counts.entries());
}

function readContentPageQueryPage(request: FastifyRequest) {
  const query = request.query as { page?: string | number | undefined };
  const parsed = Number(query.page);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  const normalized = Math.floor(parsed);
  return normalized >= 1 ? normalized : 1;
}

// fallback API 也要保持和核心模型一致：关键词只匹配标题，匹配前先做 trim + lowercase。
function filterCardsByTitleKeyword(cards: ContentCardView[], keyword: string | undefined) {
  const normalizedKeyword = normalizeSearchKeyword(keyword);

  if (!normalizedKeyword) {
    return cards;
  }

  return cards.filter((card) => card.title.toLowerCase().includes(normalizedKeyword));
}

function paginateContentCards(cards: ContentCardView[], requestedPage: number) {
  // 内容 API fallback 也要和核心模型保持一致，统一按 50 条分页并在越界时回退到最后一页。
  const pageSize = 50;
  const totalResults = cards.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    cards: cards.slice(startIndex, startIndex + pageSize),
    meta: {
      page,
      pageSize,
      totalResults,
      totalPages
    }
  };
}

function readContentPageSelectedSourceKinds(
  headerValue: string | string[] | undefined,
  sourceOptions: ContentSourceOption[]
) {
  const selectedSourceKinds = readSelectedSourceKindsHeader(headerValue);

  if (selectedSourceKinds === undefined) {
    return undefined;
  }

  return normalizeSelectedSourceKindsForOptions(selectedSourceKinds, sourceOptions);
}

function readSelectedEntityIdsHeader(headerValue: string | string[] | undefined) {
  if (typeof headerValue === "undefined") {
    return undefined;
  }

  const rawValue = Array.isArray(headerValue) ? headerValue.join(",") : headerValue ?? "";

  if (rawValue === "") {
    return [];
  }

  return rawValue
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value, index, array) => Number.isInteger(value) && value > 0 && array.indexOf(value) === index);
}

function readSelectedSourceKindsHeader(headerValue: string | string[] | undefined) {
  if (typeof headerValue === "undefined") {
    return undefined;
  }

  const rawValue = Array.isArray(headerValue) ? headerValue.join(",") : headerValue ?? "";

  if (rawValue === "") {
    return [];
  }

  return rawValue
    .split(",")
    .map((kind) => kind.trim())
    .filter(Boolean);
}

function normalizeSelectedSourceKindsForOptions(
  selectedSourceKinds: string[] | undefined,
  sourceOptions: ContentSourceOption[]
) {
  if (selectedSourceKinds === undefined) {
    return undefined;
  }

  const enabledSourceKinds = new Set(sourceOptions.map((source) => source.kind));

  return selectedSourceKinds.filter((kind, index, array) => {
    return enabledSourceKinds.has(kind) && array.indexOf(kind) === index;
  });
}

function deriveDefaultSelectedSourceKinds(sourceOptions: ContentSourceOption[]): string[] {
  // First-visit defaults intentionally leave full-display sources unchecked so users do not land on
  // an unexpectedly long feed before opting into that behavior.
  return sourceOptions.filter((source) => !source.showAllWhenSelected).map((source) => source.kind);
}

function buildContentPageSourceOptions(
  sourceOptions: ContentSourceOption[],
  hasTwitterAccounts: boolean,
  hasTwitterKeywords: boolean,
  hasHackerNewsQueries: boolean,
  hasBilibiliQueries: boolean,
  hasWeiboTrending: boolean,
  hasWechatRss: boolean
): ContentSourceOption[] {
  const nextOptions = [...sourceOptions];

  if (hasTwitterAccounts) {
    nextOptions.push({
      kind: "twitter_accounts",
      name: "Twitter 账号",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasTwitterKeywords) {
    nextOptions.push({
      kind: "twitter_keyword_search",
      name: "Twitter 关键词搜索",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasHackerNewsQueries) {
    nextOptions.push({
      kind: "hackernews_search",
      name: "Hacker News",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasBilibiliQueries) {
    nextOptions.push({
      kind: "bilibili_search",
      name: "B 站搜索",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasWeiboTrending) {
    nextOptions.push({
      kind: "weibo_trending",
      name: "微博热搜",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  if (hasWechatRss) {
    nextOptions.push({
      kind: "wechat_rss",
      name: "微信公众号 RSS",
      isEnabled: true,
      showAllWhenSelected: false
    });
  }

  return nextOptions;
}

function buildTwitterAccountFilterModel(
  accounts: TwitterAccountRecord[],
  selectedAccountIds: number[] | undefined
) {
  if (accounts.length === 0) {
    return undefined;
  }

  const availableIds = accounts.map((account) => account.id);

  return {
    options: accounts.map((account) => ({
      id: account.id,
      label: account.displayName,
      username: account.username
    })),
    selectedAccountIds: normalizeSelectedEntityIds(selectedAccountIds, availableIds)
  };
}

function buildTwitterKeywordFilterModel(
  keywords: TwitterSearchKeywordRecord[],
  selectedKeywordIds: number[] | undefined
) {
  if (keywords.length === 0) {
    return undefined;
  }

  const availableIds = keywords.map((keyword) => keyword.id);

  return {
    options: keywords.map((keyword) => ({
      id: keyword.id,
      label: keyword.keyword
    })),
    selectedKeywordIds: normalizeSelectedEntityIds(selectedKeywordIds, availableIds)
  };
}

function buildWechatRssFilterModel(
  sources: WechatRssSourceRecord[],
  selectedSourceIds: number[] | undefined
) {
  if (sources.length === 0) {
    return undefined;
  }

  const availableIds = sources.map((source) => source.id);

  return {
    options: sources.map((source) => ({
      id: source.id,
      label: source.displayName?.trim() || `微信公众号 RSS #${source.id}`,
      rssUrl: source.rssUrl
    })),
    selectedSourceIds: normalizeSelectedEntityIds(selectedSourceIds, availableIds)
  };
}

function normalizeSelectedEntityIds(selectedIds: number[] | undefined, availableIds: number[]) {
  const availableIdSet = new Set(availableIds);

  if (!selectedIds) {
    return availableIds;
  }

  return selectedIds.filter((id, index, array) => availableIdSet.has(id) && array.indexOf(id) === index);
}

// 搜索 header 先按客户端编码规则解码，再统一规整空白；旧客户端发纯 ASCII 时也能保持兼容。
function readContentSearchHeader(headerValue: string | string[] | undefined) {
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const decodedValue = decodeContentSearchHeaderValue(rawValue);
  const normalizedKeyword = normalizeSearchKeyword(decodedValue);

  return normalizedKeyword === "" ? undefined : decodedValue?.trim();
}

function decodeContentSearchHeaderValue(headerValue: string | undefined) {
  if (typeof headerValue !== "string") {
    return undefined;
  }

  try {
    return decodeURIComponent(headerValue);
  } catch {
    return headerValue;
  }
}

// 这个判断用于空态分支，确保空白关键词不会误触发“搜索无结果”提示。
function hasSearchKeyword(keyword: string | undefined) {
  return normalizeSearchKeyword(keyword) !== "";
}

// 搜索关键词只做最小规范化：trim + lowercase，后续按标题 includes 匹配。
function normalizeSearchKeyword(keyword: string | undefined) {
  if (typeof keyword !== "string") {
    return "";
  }

  return keyword.trim().toLowerCase();
}

function readContentSortModeHeader(headerValue: string | string[] | undefined): ContentSortMode | undefined {
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (rawValue === "published_at" || rawValue === "content_score") {
    return rawValue;
  }

  return undefined;
}

async function renderSystemPageForPath(deps: SitePageDeps, pathname: string, loggedIn: boolean): Promise<string | undefined> {
  // System pages keep callback wiring in main; routes only decide which renderer to call for the current path.
  if (pathname === "/settings/view-rules") {
    if (!deps.getViewRulesWorkbenchData) {
      return undefined;
    }

    const workbench = await deps.getViewRulesWorkbenchData();
    return renderViewRulesPage(workbench);
  }

  if (pathname === "/settings/sources") {
    if (!deps.listSources) {
      return undefined;
    }

    const sources = await deps.listSources();
    const operationSummary = deps.getSourcesOperationSummary
      ? await deps.getSourcesOperationSummary()
      : { lastCollectionRunAt: null, lastSendLatestEmailAt: null };
    const nextCollectionRunAt = readNextCollectionRunAt(deps.config?.collectionSchedule);

    return renderSourcesPage(sources, {
      canTriggerManualCollect: typeof (deps.triggerManualCollect ?? deps.triggerManualRun) === "function",
      canTriggerManualTwitterCollect: typeof deps.triggerManualTwitterCollect === "function",
      canTriggerManualTwitterKeywordCollect: typeof deps.triggerManualTwitterKeywordCollect === "function",
      canTriggerManualSendLatestEmail: typeof deps.triggerManualSendLatestEmail === "function",
      isRunning: deps.isRunning?.() ?? false,
      lastCollectionRunAt: operationSummary.lastCollectionRunAt,
      lastSendLatestEmailAt: operationSummary.lastSendLatestEmailAt,
      nextCollectionRunAt
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


function isMalformedContentStoreError(error: unknown): boolean {
  // Only known SQLite file-shape errors degrade to an empty state; other exceptions must still surface for debugging.
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorCode = "code" in error && typeof error.code === "string" ? error.code : "";
  const errorMessage = "message" in error && typeof error.message === "string" ? error.message : "";

  return (
    errorCode === "SQLITE_CORRUPT" ||
    errorCode === "SQLITE_NOTADB" ||
    /database disk image is malformed/i.test(errorMessage) ||
    /file is not a database/i.test(errorMessage)
  );
}

function safeRedirectTarget(target: unknown): string | null {
  if (typeof target !== "string") return null;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return null;
  if (target === "/login") return null;
  if (/[<>\r\n]/.test(target)) return null;
  return target;
}

// 未登录跳登录页时带上原地址，登录后才能回到原页面；helper 收口多处调用避免漏改
function redirectToLogin(reply: FastifyReply, request: FastifyRequest) {
  const target = safeRedirectTarget(request.url) || "";
  return reply.redirect(target ? `/login?redirect=${encodeURIComponent(target)}` : "/login");
}

function renderLoginPage(redirectTarget?: string) {
  // Login remains a small self-contained page that posts JSON without adding extra Fastify plugins.
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>登录 | 热讯平台HotNow</title>
    <link rel="icon" type="image/png" href="/brand/hotnow-favicon.png" />
    <link rel="stylesheet" href="/assets/site.css" />
  </head>
  <body class="login-page">
    <main class="login-shell">
      <section class="login-stage" data-login-stage="brand">
        <div class="login-stage__halo" aria-hidden="true"></div>
        <p class="login-kicker">Spotlight Feed</p>
        <div class="login-stage__brandlock">
          <img class="login-stage__logo" src="/brand/hotnow-logo-mark.png?v=1" alt="HotNow logo" />
          <div>
            <p class="login-stage__title">HotNow</p>
            <p class="login-stage__eyebrow">AI 热点与新讯</p>
          </div>
        </div>
        <h1>欢迎回到 HotNow</h1>
        <p class="login-subtitle">登录后继续管理来源、筛选规则和统一站点的系统能力。</p>
        <ul class="login-stage__highlights">
          <li>统一查看 AI 新讯、AI 热点和来源调度状态</li>
          <li>在同一套深浅色主题里切换系统配置与内容工作台</li>
          <li>把危险操作收口在受保护的系统菜单中，避免误触</li>
        </ul>
      </section>

      <section class="login-card" data-login-panel="form">
        <p class="login-card__eyebrow">账号验证</p>
        <h2>登录 HotNow</h2>
        <p class="login-card__summary">统一站点已启用账号校验，请使用管理员账号继续。</p>
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
      </section>
    </main>
    <script>
      const redirectTarget = ${JSON.stringify(redirectTarget || "")};
      const form = document.getElementById("login-form");
      const errorNode = document.getElementById("login-error");
      const submitBtn = form ? form.querySelector(".primary-button") : null;
      const usernameInput = document.getElementById("username");
      const passwordInput = document.getElementById("password");

      // 账号密码都填好后才激活按钮，给用户"可以点了"的视觉反馈
      function syncReady() {
        if (!submitBtn || !usernameInput || !passwordInput) return;
        const ready = (usernameInput.value || "").trim() !== "" && (passwordInput.value || "") !== "";
        submitBtn.classList.toggle("is-ready", ready);
      }
      usernameInput?.addEventListener("input", syncReady);
      passwordInput?.addEventListener("input", syncReady);
      syncReady();

      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorNode.textContent = "";
        const username = (document.getElementById("username")?.value || "").trim();
        const password = document.getElementById("password")?.value || "";
        // 提交中：禁用按钮 + 切换文案，防止重复点击并给出加载反馈
        const originalText = submitBtn ? submitBtn.textContent : "登录";
        if (submitBtn) {
          submitBtn.classList.add("is-loading");
          submitBtn.disabled = true;
          submitBtn.textContent = "登录中…";
        }
        try {
          const response = await fetch("/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username, password, redirect: redirectTarget || undefined })
          });

          if (response.redirected) {
            location.href = response.url;
            return;
          }

          if (response.status === 200 || response.status === 204 || response.status === 302) {
            location.href = redirectTarget || "/";
            return;
          }

          errorNode.textContent = "登录失败，请检查用户名和密码。";
        } catch {
          errorNode.textContent = "登录请求失败，请稍后重试。";
        } finally {
          if (submitBtn) {
            submitBtn.classList.remove("is-loading");
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
          }
        }
      });
    </script>
  </body>
</html>`;
}
