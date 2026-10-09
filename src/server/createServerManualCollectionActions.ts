import type { FastifyReply, FastifyRequest } from "fastify";

import { LatestReportEmailError, type LatestReportEmailErrorReason } from "../core/pipeline/sendLatestReportEmail.js";
import type { ApiAccessTokenPrincipal } from "../core/auth/apiAccessTokenRepository.js";
import type { ServerDeps } from "./createServer.js";
import { ensureManualActionAuthorized } from "./createServerSession.js";

/** 仅在请求没有有效登录 Cookie 时，用 Bearer 值解析管理员 API 凭证。 */
type ApiTokenLookup = (token: string) => ApiAccessTokenPrincipal | null;

/** 手动采集路由只负责鉴权、运行锁和响应映射，具体采集仍由注入回调完成。 */

/** 使用统一会话或可选 API 凭证鉴权后触发普通采集，并保留运行锁与受理响应。 */
export async function handleManualCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualCollect: ServerDeps["triggerManualCollect"] | ServerDeps["triggerManualRun"],
  readApiToken?: ApiTokenLookup
) {
  // Manual collection endpoints share the same auth, lock, and disabled semantics so the legacy alias stays behaviorally identical.
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret, readApiToken)) {
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

/** 鉴权后触发 Twitter 账号采集；API 凭证只用于补充原登录态门禁。 */
export async function handleManualTwitterCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualTwitterCollect: ServerDeps["triggerManualTwitterCollect"],
  readApiToken?: ApiTokenLookup
) {
  // Twitter 账号采集和常规采集共用一套权限与运行锁，但返回更细的账号采集结果摘要。
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret, readApiToken)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualTwitterCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualTwitterCollect();
  return reply.code(202).send(result);
}

/** 鉴权后触发 Twitter 关键词采集，并返回既有关键词结果摘要。 */
export async function handleManualTwitterKeywordCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualTwitterKeywordCollect: ServerDeps["triggerManualTwitterKeywordCollect"],
  readApiToken?: ApiTokenLookup
) {
  // Twitter 关键词搜索和账号采集共用锁与权限门，但单独返回关键词侧的命中统计。
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret, readApiToken)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualTwitterKeywordCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualTwitterKeywordCollect();
  return reply.code(202).send(result);
}

/** 鉴权后触发 Hacker News 搜索，并保持原有运行锁和结果响应。 */
export async function handleManualHackerNewsCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualHackerNewsCollect: ServerDeps["triggerManualHackerNewsCollect"],
  readApiToken?: ApiTokenLookup
) {
  // Hacker News 搜索沿用同一套手动动作权限和运行锁门禁，但单独返回 HN 侧结果摘要。
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret, readApiToken)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualHackerNewsCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualHackerNewsCollect();
  return reply.code(202).send(result);
}

/** 鉴权后触发 B 站搜索；可选 token lookup 支持非浏览器调用。 */
export async function handleManualBilibiliCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualBilibiliCollect: ServerDeps["triggerManualBilibiliCollect"],
  readApiToken?: ApiTokenLookup
) {
  // B 站搜索和 HN 一样只做手动触发，但返回的是视频搜索侧的单独统计。
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret, readApiToken)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualBilibiliCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualBilibiliCollect();
  return reply.code(202).send(result);
}

/** 鉴权后只触发微信公众号 RSS 采集，不影响普通 RSS 周期。 */
export async function handleManualWechatRssCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualWechatRssCollect: ServerDeps["triggerManualWechatRssCollect"],
  readApiToken?: ApiTokenLookup
) {
  // 公众号 RSS 是独立来源表，手动入口只处理这组配置，不影响普通 RSS 的默认采集。
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret, readApiToken)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualWechatRssCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualWechatRssCollect();
  return reply.code(202).send(result);
}

/** 鉴权后触发微博热搜匹配，并沿用独立结果摘要。 */
export async function handleManualWeiboTrendingCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualWeiboTrendingCollect: ServerDeps["triggerManualWeiboTrendingCollect"],
  readApiToken?: ApiTokenLookup
) {
  // 微博热搜榜匹配和其他手动采集保持同一套权限与运行锁，但只返回热点匹配侧摘要。
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret, readApiToken)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualWeiboTrendingCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualWeiboTrendingCollect();
  return reply.code(202).send(result);
}

/** Juya 是独立 RSS 入口，不参与普通采集运行锁和日报生成。 */

// Juya RSS 独立采集：只抓 juya 一个源，独占锁，不生成日报，结果只回条目数。
/** 鉴权后独立触发 Juya RSS 采集，不持有普通采集锁或生成日报。 */
export async function handleManualJuyaCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  triggerManualJuyaCollect: ServerDeps["triggerManualJuyaCollect"],
  readApiToken?: ApiTokenLookup
) {
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret, readApiToken)) {
    return;
  }

  if (!triggerManualJuyaCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualJuyaCollect();
  return reply.code(202).send(result);
}

/** 鉴权后重发最新日报；API token 可调用原接口允许的邮件发送动作。 */
export async function handleManualSendLatestEmailAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualSendLatestEmail: ServerDeps["triggerManualSendLatestEmail"],
  readApiToken?: ApiTokenLookup
) {
  // Resend uses the same action gate as collection, but maps mail-specific pipeline errors to stable HTTP statuses.
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret, readApiToken)) {
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

/** 邮件错误原因映射为稳定 HTTP 状态，页面无需依赖异常文本。 */

export function mapLatestEmailReasonToStatus(reason: LatestReportEmailErrorReason) {
  // The resend endpoint exposes pipeline reason codes directly, so callers can distinguish missing reports from delivery failures.
  if (reason === "not-found") {
    return 404;
  }

  if (reason === "report-unavailable") {
    return 503;
  }

  return 502;
}
