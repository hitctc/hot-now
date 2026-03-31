import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SourcesPage from "../../src/client/pages/settings/SourcesPage.vue";
import * as settingsApi from "../../src/client/services/settingsApi";

vi.mock("../../src/client/services/settingsApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/settingsApi")>(
    "../../src/client/services/settingsApi"
  );

  return {
    ...actual,
    readSettingsSources: vi.fn(),
    toggleSource: vi.fn(),
    triggerManualCollect: vi.fn(),
    triggerManualSendLatestEmail: vi.fn()
  };
});

function createSourcesModel() {
  return {
    sources: [
      {
        kind: "openai",
        name: "OpenAI",
        rssUrl: "https://openai.com/news/rss.xml",
        isEnabled: true,
        lastCollectedAt: "2026-03-31T08:00:00.000Z",
        lastCollectionStatus: "completed",
        totalCount: 20,
        publishedTodayCount: 3,
        collectedTodayCount: 2,
        viewStats: {
          hot: { candidateCount: 5, visibleCount: 2 },
          articles: { candidateCount: 4, visibleCount: 3 },
          ai: { candidateCount: 6, visibleCount: 4 }
        }
      }
    ],
    operations: {
      lastCollectionRunAt: "2026-03-31T08:10:00.000Z",
      lastSendLatestEmailAt: "2026-03-31T08:30:00.000Z",
      canTriggerManualCollect: true,
      canTriggerManualSendLatestEmail: true,
      isRunning: false
    }
  } satisfies settingsApi.SettingsSourcesResponse;
}

describe("SourcesPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });
    Object.defineProperty(window, "getComputedStyle", {
      writable: true,
      value: vi.fn().mockReturnValue({
        width: "0px",
        height: "0px",
        getPropertyValue: vi.fn().mockReturnValue("0px")
      })
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders operation cards and source tables from the api model", async () => {
    vi.mocked(settingsApi.readSettingsSources).mockResolvedValue(createSourcesModel());

    const wrapper = mount(SourcesPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(wrapper.get("[data-sources-section='manual-collect']").text()).toContain("手动执行采集");
    expect(wrapper.get("[data-sources-section='analytics']").text()).toContain("AI 新讯入池 / 展示");
    expect(wrapper.get("[data-sources-section='analytics']").text()).not.toContain("Articles 入池 / 展示");
    expect(wrapper.get("[data-sources-section='analytics']").text()).toContain("OpenAI");
    expect(wrapper.get("[data-sources-section='inventory']").text()).toContain("completed");
  });

  it("toggles a source and reloads the latest sources model", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce({
        ...createSourcesModel(),
        sources: [{ ...createSourcesModel().sources[0], isEnabled: false }]
      });
    vi.mocked(settingsApi.toggleSource).mockResolvedValue({
      ok: true,
      kind: "openai",
      enable: false
    });

    const wrapper = mount(SourcesPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();
    await wrapper.get("[data-source-toggle='openai']").trigger("click");
    await flushPromises();

    expect(settingsApi.toggleSource).toHaveBeenCalledWith("openai", false);
    expect(settingsApi.readSettingsSources).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("已停用 source");
  });

  it("starts manual collection and refreshes the page model", async () => {
    vi.mocked(settingsApi.readSettingsSources)
      .mockResolvedValueOnce(createSourcesModel())
      .mockResolvedValueOnce(createSourcesModel());
    vi.mocked(settingsApi.triggerManualCollect).mockResolvedValue({
      accepted: true,
      action: "collect"
    });

    const wrapper = mount(SourcesPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();
    await wrapper.get("[data-action='manual-collect']").trigger("click");
    await flushPromises();

    expect(settingsApi.triggerManualCollect).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("已开始执行采集");
  });
});
