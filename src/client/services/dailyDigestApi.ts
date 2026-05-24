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
