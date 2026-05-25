import { requestJson } from "./http.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type DailyDigestStatus = "generated" | "publishing" | "published" | "failed";

export type DailyDigestListItem = {
  id: number;
  date: string;
  title: string;
  coverImage: string | null;
  totalItems: number;
  categories: string[];
  status: DailyDigestStatus;
  collectorAgent: string;
  createdAt: string;
  updatedAt: string;
};

export type DailyDigestRecord = DailyDigestListItem & {
  contentMarkdown: string;
};

export type DailyDigestListResponse = {
  items: DailyDigestListItem[];
  total: number;
  page: number;
  pageSize: number;
};

// ── List ─────────────────────────────────────────────────────────────────────

export function readDailyDigests(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<DailyDigestListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.status) query.set("status", params.status);
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  const qs = query.toString();
  return requestJson<DailyDigestListResponse>(`/api/creative/daily-digests${qs ? `?${qs}` : ""}`);
}

// ── Detail ───────────────────────────────────────────────────────────────────

export function readDailyDigest(id: number): Promise<DailyDigestRecord> {
  return requestJson<DailyDigestRecord>(`/api/creative/daily-digests/${id}`);
}

// ── Update status ────────────────────────────────────────────────────────────

export function updateDailyDigestStatus(id: number, status: DailyDigestStatus): Promise<DailyDigestRecord> {
  return requestJson<DailyDigestRecord>(`/api/creative/daily-digests/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// ── Edit content ─────────────────────────────────────────────────────────────

export function editDailyDigest(id: number, fields: {
  contentMarkdown?: string;
  title?: string;
}): Promise<DailyDigestRecord> {
  return requestJson<DailyDigestRecord>(`/api/creative/daily-digests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

// ── Trigger generation ───────────────────────────────────────────────────────

export type GenerateDigestResult = {
  ok: boolean;
  detail?: string;
  reason?: string;
};

export function triggerGenerateDigest(date?: string): Promise<GenerateDigestResult> {
  return requestJson<GenerateDigestResult>("/api/creative/daily-digests/generate", {
    method: "POST",
    body: JSON.stringify(date ? { date } : {}),
  });
}

// ── Push to WeChat draft (SSE) ───────────────────────────────────────────────

export type DigestPushStepId = "validate" | "compat" | "token" | "cover" | "draft" | "status";

export type DigestPushProgressEvent = {
  step: DigestPushStepId | "complete";
  status: "running" | "done" | "error";
  detail?: string;
  mediaId?: string;
  errorCode?: string;
  errorMessage?: string;
};

export async function streamPushDigestToDraft(
  id: number,
  themeId: string,
  wechatHtml: string,
  onProgress: (event: DigestPushProgressEvent) => void,
): Promise<{ ok: boolean; mediaId?: string; errorCode?: string; errorMessage?: string }> {
  const response = await fetch(`/api/creative/daily-digests/${id}/push-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ themeId, wechatHtml }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body) throw new Error("ReadableStream 不可用");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: { ok: boolean; mediaId?: string; errorCode?: string; errorMessage?: string } = {
    ok: false,
    errorCode: "no-complete-event",
    errorMessage: "未收到完成事件",
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop()!;

    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6)) as DigestPushProgressEvent;
          onProgress(event);
          if (event.step === "complete") {
            finalResult = {
              ok: event.status === "done",
              mediaId: event.mediaId,
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
