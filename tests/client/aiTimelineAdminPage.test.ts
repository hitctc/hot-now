import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AiTimelineAdminPage from "../../src/client/pages/settings/AiTimelineAdminPage.vue";
import { systemShellPageMetas } from "../../src/client/router";
import * as aiTimelineAdminApi from "../../src/client/services/aiTimelineAdminApi";
import { mountWithApp } from "./helpers/mountWithApp";

vi.mock("../../src/client/services/aiTimelineAdminApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/aiTimelineAdminApi")>(
    "../../src/client/services/aiTimelineAdminApi"
  );

  return {
    ...actual,
    readAiTimelineAdminWorkbench: vi.fn(),
    readAiTimelineAdminEvents: vi.fn()
  };
});

const mountedWrappers: VueWrapper[] = [];

function mountAiTimelineAdminPage() {
  const wrapper = mountWithApp(AiTimelineAdminPage, {
    global: {
      stubs: {
        teleport: false,
        transition: true
      }
    }
  });

  mountedWrappers.push(wrapper);
  return wrapper;
}

function createAdminWorkbench() {
  return {
    overview: {
      visibleImportantCount7d: 3,
      latestVisiblePublishedAt: "2026-04-24T10:00:00.000Z",
      latestCollectStartedAt: null,
      failedSourceCount: 0,
      staleSourceCount: 0
    },
    sources: [],
    options: {
      eventTypes: ["要闻", "模型发布", "开发生态", "产品应用", "行业动态", "官方前瞻"],
      importanceLevels: ["S", "A", "B", "C"],
      visibilityStatuses: ["auto_visible", "hidden", "manual_visible"],
      reliabilityStatuses: ["single_source", "multi_source", "source_degraded", "manual_verified"]
    },
    events: {
      page: 1,
      pageSize: 50,
      totalResults: 1,
      totalPages: 1,
      filters: {
        eventTypes: ["模型发布"],
        companies: [{ key: "openai", name: "OpenAI", eventCount: 1 }]
      },
      events: [
        {
          id: 101,
          companyKey: "openai",
          companyName: "OpenAI",
          eventType: "模型发布",
          title: "Introducing GPT-5.5",
          summary: "Official release notes from OpenAI.",
          officialUrl: "https://openai.com/news/introducing-gpt-5-5/",
          sourceLabel: "OpenAI News",
          sourceKind: "official_blog",
          publishedAt: "2026-04-24T10:00:00.000Z",
          discoveredAt: "2026-04-24T12:00:00.000Z",
          importance: 95,
          importanceLevel: "S",
          releaseStatus: "released",
          importanceSummaryZh: "OpenAI 正式发布主力模型，影响 API 和产品能力。",
          visibilityStatus: "auto_visible",
          manualTitle: null,
          manualSummaryZh: null,
          manualImportanceLevel: null,
          detectedEntities: ["GPT-5.5"],
          eventKey: "openai:gpt-5-5:2026-04-24",
          reliabilityStatus: "multi_source",
          evidenceCount: 2,
          lastVerifiedAt: "2026-04-25T01:00:00.000Z",
          evidenceLinks: [
            {
              id: 1,
              eventId: 101,
              sourceId: "openai-news",
              companyKey: "openai",
              sourceLabel: "OpenAI News",
              sourceKind: "official_blog",
              officialUrl: "https://openai.com/news/introducing-gpt-5-5/",
              title: "Introducing GPT-5.5",
              summary: null,
              publishedAt: "2026-04-24T10:00:00.000Z",
              discoveredAt: "2026-04-24T12:00:00.000Z",
              rawSourceJson: {},
              createdAt: "2026-04-24T12:00:00.000Z",
              updatedAt: "2026-04-24T12:00:00.000Z"
            }
          ],
          displayTitle: "Introducing GPT-5.5",
          displaySummaryZh: "OpenAI 正式发布主力模型，影响 API 和产品能力。",
          rawSourceJson: {},
          createdAt: "2026-04-24T12:00:00.000Z",
          updatedAt: "2026-04-24T12:00:00.000Z"
        }
      ]
    }
  } satisfies Awaited<ReturnType<typeof aiTimelineAdminApi.readAiTimelineAdminWorkbench>>;
}

describe("AiTimelineAdminPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    document.body.innerHTML = "";
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  });

  it("registers the AI timeline feed entry in the system menu metadata", () => {
    expect(systemShellPageMetas.map((meta) => meta.navLabel)).toContain("AI 时间线 feed");
    expect(systemShellPageMetas.find((meta) => meta.navLabel === "AI 时间线 feed")?.path).toBe(
      "/settings/ai-timeline"
    );
  });

  it("renders the read-only feed workbench sections", async () => {
    const workbench = createAdminWorkbench();
    vi.mocked(aiTimelineAdminApi.readAiTimelineAdminWorkbench).mockResolvedValue(workbench);

    const wrapper = mountAiTimelineAdminPage();

    await flushPromises();

    expect(wrapper.get("[data-ai-timeline-admin-page]").text()).toContain("AI 时间线 feed");
    expect(wrapper.get("[data-ai-timeline-admin-overview]").text()).toContain("主时间线状态");
    expect(wrapper.get("[data-ai-timeline-source-health]").text()).toContain("feed 来源状态");
    expect(wrapper.get("[data-ai-timeline-candidate-events]").text()).toContain("feed 事件");
    expect(wrapper.get("[data-ai-timeline-candidate-events]").text()).toContain("read-only feed");
    expect(wrapper.find("[data-ai-timeline-admin-edit='101']").exists()).toBe(false);
  });
});
