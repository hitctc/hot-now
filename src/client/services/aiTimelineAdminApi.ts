import { requestJson } from "./http";
import type {
  ManualAiTimelineCollectResponse,
  SettingsAiTimelineAdminResponse,
  SettingsAiTimelineEventsResponse,
  UpdateAiTimelineEventPayload,
  UpdateAiTimelineEventResponse
} from "./settingsApi";

export type AiTimelineAdminQuery = {
  eventType?: string;
  company?: string;
  searchKeyword?: string;
  importance?: string[];
  visibility?: string[];
  recentDays?: number | null;
  page?: number;
};

export function readAiTimelineAdminWorkbench(
  query: AiTimelineAdminQuery = {}
): Promise<SettingsAiTimelineAdminResponse> {
  const queryString = buildAiTimelineAdminQueryString(query);
  return requestJson<SettingsAiTimelineAdminResponse>(
    queryString ? `/api/settings/ai-timeline?${queryString}` : "/api/settings/ai-timeline"
  );
}

export function readAiTimelineAdminEvents(
  query: AiTimelineAdminQuery = {}
): Promise<SettingsAiTimelineEventsResponse> {
  const queryString = buildAiTimelineAdminQueryString(query);
  return requestJson<SettingsAiTimelineEventsResponse>(
    queryString ? `/api/settings/ai-timeline/events?${queryString}` : "/api/settings/ai-timeline/events"
  );
}

export function updateAiTimelineAdminEvent(
  eventId: number,
  input: UpdateAiTimelineEventPayload
): Promise<UpdateAiTimelineEventResponse> {
  return requestJson<UpdateAiTimelineEventResponse>(
    `/actions/ai-timeline/events/${encodeURIComponent(String(eventId))}/update`,
    {
      method: "POST",
      body: JSON.stringify(input)
    }
  );
}

export function triggerAiTimelineAdminCollect(): Promise<ManualAiTimelineCollectResponse> {
  return requestJson<ManualAiTimelineCollectResponse>("/actions/ai-timeline/collect", {
    method: "POST",
    body: JSON.stringify({})
  });
}

// 后台时间线筛选仍然走 query string，方便后续把页面状态同步到 URL。
function buildAiTimelineAdminQueryString(query: AiTimelineAdminQuery): string {
  const params = new URLSearchParams();

  if (query.eventType?.trim()) {
    params.set("eventType", query.eventType.trim());
  }

  if (query.company?.trim()) {
    params.set("company", query.company.trim());
  }

  if (query.searchKeyword?.trim()) {
    params.set("q", query.searchKeyword.trim());
  }

  if (query.importance && query.importance.length > 0) {
    params.set("importance", query.importance.join(","));
  }

  if (query.visibility && query.visibility.length > 0) {
    params.set("visibility", query.visibility.join(","));
  }

  if (query.recentDays !== undefined && query.recentDays !== null && query.recentDays > 0) {
    params.set("recentDays", String(Math.floor(query.recentDays)));
  }

  if (query.page !== undefined && Number.isInteger(query.page) && query.page > 1) {
    params.set("page", String(query.page));
  }

  return params.toString();
}
