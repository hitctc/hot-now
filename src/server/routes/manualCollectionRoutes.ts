import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

type ManualActionHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export type ManualCollectionRouteOptions = {
  runCollect: ManualActionHandler;
  sendLatestEmail: ManualActionHandler;
  collectTwitterAccounts: ManualActionHandler;
  collectTwitterKeywords: ManualActionHandler;
  collectHackerNews: ManualActionHandler;
  collectBilibili: ManualActionHandler;
  collectWechatRss: ManualActionHandler;
  collectWeibo: ManualActionHandler;
  collectJuya: ManualActionHandler;
  authorizeManualAction: (request: FastifyRequest, reply: FastifyReply) => boolean;
};

/** 注册各来源的手动采集入口，并继续复用入口层已存在的鉴权与任务处理语义。 */
export function registerManualCollectionRoutes(
  app: FastifyInstance,
  options: ManualCollectionRouteOptions
): void {
  // 旧版 /actions/run 是 /actions/collect 的兼容别名，两个入口必须完全共用处理逻辑。
  app.post("/actions/run", options.runCollect);
  app.post("/actions/collect", options.runCollect);
  app.post("/actions/send-latest-email", options.sendLatestEmail);
  app.post("/actions/twitter-accounts/collect", options.collectTwitterAccounts);
  app.post("/actions/twitter-keywords/collect", options.collectTwitterKeywords);
  app.post("/actions/hackernews/collect", options.collectHackerNews);
  app.post("/actions/bilibili/collect", options.collectBilibili);
  app.post("/actions/wechat-rss/collect", options.collectWechatRss);
  app.post("/actions/weibo/collect", options.collectWeibo);
  app.post("/actions/sources/juya/collect", options.collectJuya);
  app.post("/actions/ai-timeline/collect", async (request, reply) => {
    if (!options.authorizeManualAction(request, reply)) {
      return;
    }

    // AI 时间线只接受外部 Feed 自动同步，保留原有的明确拒绝响应。
    return reply.code(410).send({
      accepted: false,
      reason: "ai-timeline-feed-automation-only"
    });
  });
}
