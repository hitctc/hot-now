import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ViewRulesPage from "../../src/client/pages/settings/ViewRulesPage.vue";
import * as settingsApi from "../../src/client/services/settingsApi";

vi.mock("../../src/client/services/settingsApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/settingsApi")>(
    "../../src/client/services/settingsApi"
  );

  return {
    ...actual,
    readSettingsViewRules: vi.fn(),
    saveViewRuleConfig: vi.fn(),
    saveProviderSettings: vi.fn(),
    deleteProviderSettings: vi.fn(),
    saveNlRules: vi.fn(),
    createDraftFromFeedback: vi.fn(),
    deleteFeedbackEntry: vi.fn(),
    clearFeedbackPool: vi.fn(),
    saveStrategyDraft: vi.fn(),
    deleteStrategyDraft: vi.fn()
  };
});

function createWorkbench() {
  return {
    numericRules: [
      {
        ruleKey: "hot",
        displayName: "热点策略",
        config: {
          limit: 20,
          freshnessWindowDays: 3,
          freshnessWeight: 0.35,
          sourceWeight: 0.1,
          completenessWeight: 0.1,
          aiWeight: 0.05,
          heatWeight: 0.4
        },
        isEnabled: true
      }
    ],
    providerSettings: {
      providerKind: "deepseek",
      apiKeyLast4: "1234",
      isEnabled: true,
      updatedAt: "2026-03-31T09:00:00.000Z"
    },
    providerCapability: {
      hasMasterKey: true,
      featureAvailable: true,
      message: "已配置可用厂商"
    },
    nlRules: [
      { scope: "global", ruleText: "保留 workflow 深度总结。", createdAt: "", updatedAt: "" },
      { scope: "hot", ruleText: "", createdAt: "", updatedAt: "" },
      { scope: "articles", ruleText: "", createdAt: "", updatedAt: "" },
      { scope: "ai", ruleText: "优先展示 agent 相关内容。", createdAt: "", updatedAt: "" }
    ],
    feedbackPool: [
      {
        id: 201,
        contentItemId: 501,
        contentTitle: "Agent 工作流总结",
        canonicalUrl: "https://example.com/agent",
        sourceName: "OpenAI",
        reactionSnapshot: "like",
        freeText: "这类内容应该更靠前。",
        suggestedEffect: "提高权重",
        strengthLevel: "high",
        positiveKeywords: ["agent", "workflow"],
        negativeKeywords: [],
        createdAt: "2026-03-31T08:00:00.000Z",
        updatedAt: "2026-03-31T08:10:00.000Z"
      }
    ],
    strategyDrafts: [
      {
        id: 301,
        sourceFeedbackId: 201,
        draftText: "优先展示包含 agent workflow 的深度总结。",
        suggestedScope: "ai",
        draftEffectSummary: "强化 AI 页的 agent 内容。",
        positiveKeywords: ["agent", "workflow"],
        negativeKeywords: ["融资"],
        createdAt: "2026-03-31T08:30:00.000Z",
        updatedAt: "2026-03-31T08:40:00.000Z"
      }
    ],
    latestEvaluationRun: {
      id: 1,
      runType: "full",
      status: "completed",
      providerKind: "deepseek",
      startedAt: "2026-03-31T09:10:00.000Z",
      finishedAt: "2026-03-31T09:11:00.000Z",
      itemCount: 20,
      successCount: 20,
      failureCount: 0,
      notes: null,
      createdAt: "2026-03-31T09:10:00.000Z"
    },
    isEvaluationRunning: false
  } satisfies settingsApi.SettingsViewRulesResponse;
}

describe("ViewRulesPage", () => {
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
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the provider, nl-rules, feedback and draft sections from the api workbench", async () => {
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createWorkbench());

    const wrapper = mount(ViewRulesPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(settingsApi.readSettingsViewRules).toHaveBeenCalledTimes(1);
    expect(wrapper.get("[data-settings-intro='view-rules']").classes()).toContain("rounded-editorial-xl");
    expect(wrapper.get("[data-settings-intro='view-rules']").classes()).toContain("bg-editorial-panel");
    expect(wrapper.get("[data-settings-intro='view-rules']").classes()).toContain("shadow-editorial-page");
    expect(wrapper.get("[data-view-rules-section='provider-settings']").classes()).toContain(
      "rounded-editorial-xl"
    );
    expect(wrapper.get("[data-view-rules-section='provider-settings']").classes()).toContain(
      "border"
    );
    expect(wrapper.get("[data-view-rules-section='provider-settings']").classes()).toContain(
      "border-editorial-border"
    );
    expect(wrapper.get("[data-view-rules-section='provider-settings']").classes()).toContain(
      "bg-editorial-panel"
    );
    expect(wrapper.get("[data-view-rules-section='provider-settings']").classes()).toContain(
      "shadow-editorial-card"
    );
    expect(wrapper.get("[data-view-rules-section='provider-settings']").text()).toContain("DeepSeek");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").classes()).toContain("rounded-editorial-xl");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").classes()).toContain("bg-editorial-panel");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").classes()).toContain("shadow-editorial-card");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("正式自然语言策略");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("AI 热点规则");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("AI 新讯规则");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).not.toContain("Articles 规则");
    expect(wrapper.get("[data-view-rules-section='feedback-pool']").classes()).toContain("rounded-editorial-xl");
    expect(wrapper.get("[data-view-rules-section='feedback-pool']").text()).toContain("Agent 工作流总结");
    expect(
      (wrapper.get("[data-draft-form='301'] textarea").element as HTMLTextAreaElement).value
    ).toBe("优先展示包含 agent workflow 的深度总结。");
  });

  it("saves nl rules and reloads the workbench", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce(createWorkbench());
    vi.mocked(settingsApi.saveNlRules).mockResolvedValue({
      ok: true,
      run: {
        status: "completed"
      }
    });

    const wrapper = mount(ViewRulesPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    await wrapper.get("[data-nl-rule-scope='global']").setValue("新的全局规则");
    await wrapper.get("[data-view-rules-form='nl-rules']").trigger("submit");
    await flushPromises();

    expect(settingsApi.saveNlRules).toHaveBeenCalledWith({
      global: "新的全局规则",
      hot: "",
      articles: "",
      ai: "优先展示 agent 相关内容。"
    });
    expect(settingsApi.readSettingsViewRules).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("当前内容库已完成重算");
  });

  it("applies a draft into the matching nl-rule editor without saving immediately", async () => {
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createWorkbench());

    const wrapper = mount(ViewRulesPage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    await wrapper.get("[data-action='apply-draft'][data-draft-id='301']").trigger("click");

    expect((wrapper.get("[data-nl-rule-scope='ai']").element as HTMLTextAreaElement).value).toContain(
      "优先展示包含 agent workflow 的深度总结。"
    );
    expect(settingsApi.saveNlRules).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("草稿已写入正式策略编辑器");
  });
});
