import type { CreativeFinishedArticleRouteContext } from "./creativeFinishedArticleRouteShared.js";

/** 注册成品文章的Publish路由，保持既有 HTTP 契约。 */
export function registerCreativeFinishedArticlePublishRoutes(context: CreativeFinishedArticleRouteContext): void {
  const { app, options } = context;

  // ─── 微信公众号：推送到草稿箱（session 鉴权） ───

  app.post("/api/creative/finished-articles/:id/push-draft", async (request, reply) => {
    if (!options.authorizeStateAction(request, reply)) {
      return;
    }
    if (!options.pushArticleToWechatDraft) {
      return reply.code(503).send({ ok: false, reason: "wechat-push-not-configured" });
    }

    const params = request.params as { id: string };
    const body = request.body as { themeId?: string; wechatHtml?: string } | undefined;
    const id = parseInt(params.id, 10);
    const themeId = body?.themeId ?? "bauhaus";
    const wechatHtml = body?.wechatHtml;

    // 接管响应，用 SSE 流式推送进度
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    // 禁用 TCP Nagle 算法，确保每次 write 立即发送
    res.socket?.setNoDelay(true);

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const onProgress = async (step: string, status: "running" | "done" | "error", detail?: string) => {
      const event: Record<string, unknown> = { step, status };
      if (detail) event.detail = detail;
      sendEvent(event);
      // 每个状态变化后短暂停顿，让前端用户能看到步骤过渡
      if (status === "done" || status === "running") {
        await new Promise(r => setTimeout(r, 100));
      }
    };

    try {
      const result = await options.pushArticleToWechatDraft(id, themeId, wechatHtml, onProgress);
      if (result.ok) {
        sendEvent({ step: "complete", status: "done", mediaId: result.mediaId, pushCount: result.pushCount });
      } else {
        sendEvent({ step: "complete", status: "error", errorCode: result.errorCode, errorMessage: result.errorMessage });
      }
    } catch (err) {
      sendEvent({ step: "complete", status: "error", errorMessage: (err as Error).message });
    } finally {
      res.end();
    }
  });

  // 获取文章推送记录
  app.get("/api/creative/finished-articles/:id/push-log", async (request, reply) => {
    const session = options.readSession(request, reply);
    if (session === undefined) return;

    if (!options.getArticleWechatPushLog) {
      return reply.code(503).send({ ok: false, reason: "wechat-push-not-configured" });
    }

    const params = request.params as { id: string };
    const id = parseInt(params.id, 10);
    const log = options.getArticleWechatPushLog(id);
    return reply.send({ ok: true, log });
  });
}
