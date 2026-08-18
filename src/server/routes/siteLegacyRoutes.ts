import { renderControlPage, renderHistoryPage, renderNotFoundPage, renderNoticePage } from "../renderPages.js";
import type { SitePageRouteContext } from "./sitePageRouteShared.js";
import { redirectToLogin } from "./sitePageSystemHelpers.js";

/** 注册旧报告页、控制页和统一 404 fallback，给历史入口保留稳定兼容层。 */
export function registerSiteLegacyRoutes(context: SitePageRouteContext): void {
  const { app, options, deps, authEnabled, hasUnifiedShellDeps } = context;

  if (!authEnabled && !hasUnifiedShellDeps) {
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
