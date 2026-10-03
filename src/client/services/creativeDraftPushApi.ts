import { requestModelTask as requestJson } from "./modelTaskRequest.js";
import type { WechatThemeId } from "./creativeImageApi.js";


// ─── WeChat Draft Push ───

export type PushDraftResult = {
  ok: boolean;
  mediaId?: string;
  errorCode?: string;
  errorMessage?: string;
  pushCount?: number;
};

export type PushStepId = "validate" | "compat" | "token" | "cover" | "images" | "draft" | "status";

export type PushProgressEvent = {
  step: PushStepId | "complete";
  status: "running" | "done" | "error";
  detail?: string;
  mediaId?: string;
  pushCount?: number;
  errorCode?: string;
  errorMessage?: string;
};

/** SSE 流式推送文章到微信草稿箱，逐条返回进度事件，最终返回 PushDraftResult */
export async function streamPushArticleToDraft(
  id: number,
  themeId: WechatThemeId,
  wechatHtml: string | undefined,
  onProgress: (event: PushProgressEvent) => void,
): Promise<PushDraftResult> {
  const response = await fetch(`/api/creative/finished-articles/${id}/push-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ themeId, wechatHtml }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body) throw new Error("ReadableStream 不可用");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: PushDraftResult = { ok: false, errorCode: "no-complete-event", errorMessage: "未收到完成事件" };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 事件以 \n\n 分隔
    const parts = buffer.split("\n\n");
    buffer = parts.pop()!;

    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6)) as PushProgressEvent;
          onProgress(event);
          if (event.step === "complete") {
            finalResult = {
              ok: event.status === "done",
              mediaId: event.mediaId,
              pushCount: event.pushCount,
              errorCode: event.errorCode,
              errorMessage: event.errorMessage,
            };
          }
        } catch { /* 跳过格式异常的事件 */ }
      }
    }
  }

  return finalResult;
}

export type PushLogEntry = {
  id: number;
  article_id: number;
  account_id: number;
  theme_id: string;
  media_id: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  pushed_at: string;
  account_name: string;
};

/** 获取文章推送记录 */
export function readArticlePushLog(id: number): Promise<{ ok: boolean; log: PushLogEntry[] }> {
  return requestJson<{ ok: boolean; log: PushLogEntry[] }>(
    `/api/creative/finished-articles/${id}/push-log`
  );
}
