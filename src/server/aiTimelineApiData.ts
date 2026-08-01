import type { FastifyRequest } from "fastify";
import { aiTimelineEventTypes, isAiTimelineImportanceLevel, isAiTimelineVisibilityStatus, type AiTimelineListQuery, type AiTimelinePageModel } from "../core/aiTimeline/aiTimelineTypes.js";
export type AiTimelineReadDependencies = { readAiTimelinePage?: (query: AiTimelineListQuery) => Promise<AiTimelinePageModel> | AiTimelinePageModel };

export async function readAiTimelineApiData(deps: AiTimelineReadDependencies, request: FastifyRequest) {
  const query = readAiTimelineQuery(request);

  if (!deps.readAiTimelinePage) {
    return {
      page: query.page ?? 1,
      pageSize: 50,
      totalResults: 0,
      totalPages: 0,
      filters: {
        eventTypes: [...aiTimelineEventTypes],
        companies: []
      },
      generatedAt: null,
      events: []
    };
  }

  const model = await deps.readAiTimelinePage(query);

  return {
    page: model.pagination.page,
    pageSize: model.pagination.pageSize,
    totalResults: model.pagination.totalResults,
    totalPages: model.pagination.totalPages,
    filters: model.filters,
    generatedAt: model.generatedAt,
    events: model.events
  };
}


function readAiTimelineQuery(request: FastifyRequest): AiTimelineListQuery {
  const query = request.query as Record<string, unknown>;
  const eventType = readQueryString(query.eventType);
  const companyKey = readQueryString(query.company);
  const searchKeyword = readQueryString(query.q);
  const importanceLevels = parseAiTimelineImportanceLevels(readQueryString(query.importance));
  const visibilityStatuses = parseAiTimelineVisibilityStatuses(readQueryString(query.visibility));
  const recentDays = readPositiveQueryInteger(query.recentDays);
  const page = readPositiveQueryInteger(query.page);
  const pageSize = readPositiveQueryInteger(query.pageSize);

  return {
    ...(eventType ? { eventType } : {}),
    ...(companyKey ? { companyKey } : {}),
    ...(searchKeyword ? { searchKeyword } : {}),
    ...(importanceLevels ? { importanceLevels } : {}),
    ...(visibilityStatuses ? { visibilityStatuses } : {}),
    ...(recentDays ? { recentDays } : {}),
    ...(page ? { page } : {}),
    ...(pageSize ? { pageSize } : {})
  };
}

function parseAiTimelineImportanceLevels(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const values = value.split(",").map((item) => item.trim()).filter(isAiTimelineImportanceLevel);
  return values.length > 0 ? values : undefined;
}

function parseAiTimelineVisibilityStatuses(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const values = value.split(",").map((item) => item.trim()).filter(isAiTimelineVisibilityStatus);
  return values.length > 0 ? values : undefined;
}

function readQueryString(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function readPositiveQueryInteger(value: unknown): number | undefined {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }

  return Math.floor(parsed);
}

