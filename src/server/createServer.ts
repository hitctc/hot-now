import Fastify from "fastify";
import type { RuntimeConfig } from "../core/types/appConfig.js";
import {
  renderControlPage,
  renderHistoryPage,
  renderNoticePage
} from "./renderPages.js";

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
};

// This server keeps the old health route intact and layers report pages on top through dependency injection.
export function createServer(deps: ServerDeps = {}) {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

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

  app.get("/history", async (_request, reply) => {
    const summaries = (await deps.listReportSummaries?.()) ?? [];
    return reply.type("text/html").send(renderHistoryPage(summaries));
  });

  app.get("/reports/:date", async (request, reply) => {
    if (!deps.readReportHtml) {
      return reply.code(503).type("text/html").send(renderNoticePage("HotNow 报告", "报告内容暂不可用"));
    }

    const { date } = request.params as { date: string };
    const html = await deps.readReportHtml(date);
    return reply.type("text/html").send(html);
  });

  app.get("/control", async (_request, reply) => {
    return reply.type("text/html").send(renderControlPage(deps.config, deps.isRunning?.() ?? false));
  });

  app.post("/actions/run", async (_request, reply) => {
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
