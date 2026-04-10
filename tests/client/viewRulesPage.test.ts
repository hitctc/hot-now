import { flushPromises } from "@vue/test-utils";
import { message } from "ant-design-vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ViewRulesPage from "../../src/client/pages/settings/ViewRulesPage.vue";
import * as settingsApi from "../../src/client/services/settingsApi";
import { mountWithApp } from "./helpers/mountWithApp";

function createMockMessageHandle(): ReturnType<typeof message.success> {
  return (() => undefined) as ReturnType<typeof message.success>;
}

vi.mock("../../src/client/services/settingsApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/settingsApi")>(
    "../../src/client/services/settingsApi"
  );

  return {
    ...actual,
    readSettingsViewRules: vi.fn(),
    saveContentFilterRule: vi.fn(),
    saveProviderSettings: vi.fn(),
    updateProviderSettingsActivation: vi.fn(),
    deleteProviderSettings: vi.fn(),
    deleteFeedbackEntry: vi.fn(),
    clearFeedbackPool: vi.fn()
  };
});

function createWorkbench() {
  return {
    filterWorkbench: {
      aiRule: {
        ruleKey: "ai",
        displayName: "AI 新讯怎么排",
        summary: "现在 AI 新讯默认只看最近 24 小时。排序时主要看 AI 内容、AI 新讯重点来源、综合分，下面会把这些词的意思直接写清楚。",
        toggles: {
          enableTimeWindow: true,
          enableSourceViewBonus: true,
          enableAiKeywordWeight: true,
          enableHeatKeywordWeight: false,
          enableFreshnessWeight: true,
          enableScoreRanking: true
        },
        weights: {
          freshnessWeight: 0.1,
          sourceWeight: 0.1,
          completenessWeight: 0.15,
          aiWeight: 0.5,
          heatWeight: 0.15
        }
      },
      hotRule: {
        ruleKey: "hot",
        displayName: "AI 热点怎么排",
        summary: "现在 AI 热点不限制 24 小时。排序时主要看热点词、新内容、AI 热点重点来源、综合分，下面会把这些词的意思直接写清楚。",
        toggles: {
          enableTimeWindow: false,
          enableSourceViewBonus: true,
          enableAiKeywordWeight: false,
          enableHeatKeywordWeight: true,
          enableFreshnessWeight: true,
          enableScoreRanking: true
        },
        weights: {
          freshnessWeight: 0.35,
          sourceWeight: 0.1,
          completenessWeight: 0.1,
          aiWeight: 0.05,
          heatWeight: 0.4
        }
      }
    },
    providerSettings: [
      {
        providerKind: "deepseek",
        apiKeyLast4: "1234",
        isEnabled: true,
        updatedAt: "2026-03-31T09:00:00.000Z"
      },
      {
        providerKind: "minimax",
        apiKeyLast4: "5678",
        isEnabled: false,
        updatedAt: "2026-03-31T08:40:00.000Z"
      }
    ],
    providerCapability: {
      hasMasterKey: true,
      featureAvailable: true,
      message: "当前版本暂不使用这些配置参与筛选策略或重算。"
    },
    feedbackPool: [
      {
        id: 201,
        contentItemId: 501,
        contentTitle: "Agent 工作流总结",
        canonicalUrl: "https://example.com/agent",
        sourceName: "OpenAI",
        freeText: "这类内容应该更靠前。",
        suggestedEffect: "提高权重",
        strengthLevel: "high",
        positiveKeywords: ["agent", "workflow"],
        negativeKeywords: ["融资"],
        createdAt: "2026-03-31T08:00:00.000Z",
        updatedAt: "2026-03-31T08:10:00.000Z"
      }
    ]
  } satisfies settingsApi.SettingsViewRulesResponse;
}

function createEmptyWorkbench() {
  return {
    ...createWorkbench(),
    providerSettings: [],
    feedbackPool: []
  } satisfies settingsApi.SettingsViewRulesResponse;
}

describe("ViewRulesPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(message, "success").mockReturnValue(createMockMessageHandle());
    vi.spyOn(message, "warning").mockReturnValue(createMockMessageHandle());
    vi.spyOn(message, "error").mockReturnValue(createMockMessageHandle());
    vi.spyOn(message, "info").mockReturnValue(createMockMessageHandle());
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

  it("renders the content filter workbench above feedback pool and llm settings", async () => {
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createWorkbench());

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    expect(settingsApi.readSettingsViewRules).toHaveBeenCalledTimes(1);
    expect(wrapper.get("[data-settings-section='filter-overview']").text()).toContain("当前筛选总览");
    expect(wrapper.get("[data-filter-overview-card='ai']").text()).toContain("AI 新讯怎么排");
    expect(wrapper.get("[data-filter-overview-card='hot']").text()).toContain("AI 热点怎么排");
    expect(wrapper.get("[data-settings-section='filter-glossary']").text()).toContain("这些词到底是什么意思");
    expect(wrapper.get("[data-settings-section='filter-glossary']").text()).toContain("OpenAI");
    expect(wrapper.get("[data-settings-section='filter-glossary']").text()).toContain("36氪快讯");
    expect(wrapper.get("[data-settings-section='filter-glossary']").text()).toContain("launch");
    expect(wrapper.get("[data-settings-section='filter-ai']").text()).toContain("只看最近 24 小时");
    expect(wrapper.get("[data-settings-section='filter-hot']").text()).toContain("更看重新内容");
    expect(wrapper.get("[data-settings-section='filter-ai']").text()).toContain("模型、Agent、产品更新、大模型、智能体");
    expect(wrapper.get("[data-settings-section='filter-hot']").text()).toContain("这里的新内容，就是发布时间更近的内容");
    expect(wrapper.get("[data-filter-weight-editor='ai']").text()).toContain("当前总分 1.00");
    expect(wrapper.get("[data-filter-weight-editor='hot']").text()).toContain("当前总分 1.00");
    expect(wrapper.get("[data-filter-weight-editor='ai']").text()).toContain("直接输入分值");
    expect(wrapper.get("[data-save-content-filter='ai']").text()).toContain("保存 AI 新讯设置");
    expect(wrapper.get("[data-save-content-filter='hot']").text()).toContain("保存 AI 热点设置");
    expect(wrapper.get("[data-view-rules-section='feedback-pool']").text()).toContain("Agent 工作流总结");
    expect(wrapper.get("[data-feedback-row]").text()).toContain("这类内容应该更靠前。");
    expect(wrapper.get("[data-action='copy-feedback-pool']").text()).toContain("复制全部反馈");
    expect(wrapper.get("[data-action='clear-feedback-pool']").text()).toContain("清空全部反馈");
    expect(wrapper.get("[data-view-rules-section='provider-settings']").text()).toContain("暂未使用");
    expect(wrapper.get("[data-view-rules-provider-alert]").classes()).toContain("editorial-inline-alert");
    expect(wrapper.get("[data-view-rules-provider-status-note]").text()).toContain("当前只保留配置入口");
    expect(wrapper.find("[data-view-rules-section='nl-rules']").exists()).toBe(false);
    expect(wrapper.find("[data-settings-section='strategy-drafts']").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("正式自然语言策略");
    expect(wrapper.text()).not.toContain("草稿池");
  });

  it("saves ai and hot content filter toggles independently", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce(createWorkbench());
    vi.mocked(settingsApi.saveContentFilterRule)
      .mockResolvedValueOnce({ ok: true, ruleKey: "ai" })
      .mockResolvedValueOnce({ ok: true, ruleKey: "hot" });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();
    await wrapper.get("[data-save-content-filter='ai']").trigger("click");
    await flushPromises();

    expect(settingsApi.saveContentFilterRule).toHaveBeenCalledWith({
      ruleKey: "ai",
      toggles: {
        enableTimeWindow: true,
        enableSourceViewBonus: true,
        enableAiKeywordWeight: true,
        enableHeatKeywordWeight: false,
        enableFreshnessWeight: true,
        enableScoreRanking: true
      },
      weights: {
        freshnessWeight: 0.1,
        sourceWeight: 0.1,
        completenessWeight: 0.15,
        aiWeight: 0.5,
        heatWeight: 0.15
      }
    });

    await wrapper.get("[data-save-content-filter='hot']").trigger("click");
    await flushPromises();

    expect(settingsApi.saveContentFilterRule).toHaveBeenCalledWith({
      ruleKey: "hot",
      toggles: {
        enableTimeWindow: false,
        enableSourceViewBonus: true,
        enableAiKeywordWeight: false,
        enableHeatKeywordWeight: true,
        enableFreshnessWeight: true,
        enableScoreRanking: true
      },
      weights: {
        freshnessWeight: 0.35,
        sourceWeight: 0.1,
        completenessWeight: 0.1,
        aiWeight: 0.05,
        heatWeight: 0.4
      }
    });
  });

  it("only toggles filters when the switch itself is clicked", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValue(createWorkbench());
    vi.mocked(settingsApi.saveContentFilterRule)
      .mockResolvedValue({ ok: true, ruleKey: "ai" });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    await wrapper.get("[data-filter-toggle-card='ai:timeWindow']").trigger("click");
    await flushPromises();
    await wrapper.get("[data-save-content-filter='ai']").trigger("click");
    await flushPromises();

    expect(settingsApi.saveContentFilterRule).toHaveBeenNthCalledWith(1, {
      ruleKey: "ai",
      toggles: {
        enableTimeWindow: true,
        enableSourceViewBonus: true,
        enableAiKeywordWeight: true,
        enableHeatKeywordWeight: false,
        enableFreshnessWeight: true,
        enableScoreRanking: true
      },
      weights: {
        freshnessWeight: 0.1,
        sourceWeight: 0.1,
        completenessWeight: 0.15,
        aiWeight: 0.5,
        heatWeight: 0.15
      }
    });

    await wrapper.get("[data-filter-toggle-switch='ai:timeWindow']").trigger("click");
    await flushPromises();
    await wrapper.get("[data-save-content-filter='ai']").trigger("click");
    await flushPromises();

    expect(settingsApi.saveContentFilterRule).toHaveBeenNthCalledWith(2, {
      ruleKey: "ai",
      toggles: {
        enableTimeWindow: false,
        enableSourceViewBonus: true,
        enableAiKeywordWeight: true,
        enableHeatKeywordWeight: false,
        enableFreshnessWeight: true,
        enableScoreRanking: true
      },
      weights: {
        freshnessWeight: 0.1,
        sourceWeight: 0.1,
        completenessWeight: 0.15,
        aiWeight: 0.5,
        heatWeight: 0.15
      }
    });
  });

  it("lets users edit weights and shows the updated total before saving", async () => {
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValueOnce(createWorkbench());
    vi.mocked(settingsApi.saveContentFilterRule).mockResolvedValue({ ok: true, ruleKey: "ai" });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    const aiInput = wrapper.get("[data-weight-input='ai:aiWeight']");
    expect((aiInput.element as HTMLInputElement).value).toBe("0.50");
    await aiInput.setValue("0.60");
    await aiInput.trigger("change");
    await flushPromises();

    expect(wrapper.get("[data-filter-weight-editor='ai']").text()).toContain("当前总分 1.10");
    expect(wrapper.get("[data-filter-weight-editor='ai']").text()).toContain("当前分值 0.60，约占总分 55%");

    await wrapper.get("[data-save-content-filter='ai']").trigger("click");
    await flushPromises();

    expect(settingsApi.saveContentFilterRule).toHaveBeenCalledWith({
      ruleKey: "ai",
      toggles: {
        enableTimeWindow: true,
        enableSourceViewBonus: true,
        enableAiKeywordWeight: true,
        enableHeatKeywordWeight: false,
        enableFreshnessWeight: true,
        enableScoreRanking: true
      },
      weights: {
        freshnessWeight: 0.1,
        sourceWeight: 0.1,
        completenessWeight: 0.15,
        aiWeight: 0.6,
        heatWeight: 0.15
      }
    });
  });

  it("copies all feedback entries from the feedback pool", async () => {
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createWorkbench());

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();
    await wrapper.get("[data-action='copy-feedback-pool']").trigger("click");

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("反馈词：这类内容应该更靠前。")
    );
    expect(message.success).toHaveBeenCalledWith("已复制全部反馈词。");
  });

  it("deletes a single feedback item and reloads the page model", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce(createEmptyWorkbench());
    vi.mocked(settingsApi.deleteFeedbackEntry).mockResolvedValue({
      ok: true,
      feedbackId: 201
    });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();
    await wrapper.get("[data-feedback-delete='201']").trigger("click");
    await flushPromises();

    expect(settingsApi.deleteFeedbackEntry).toHaveBeenCalledWith(201);
    expect(settingsApi.readSettingsViewRules).toHaveBeenCalledTimes(2);
    expect(message.success).toHaveBeenCalledWith("该条反馈词已删除。");
    expect(wrapper.get("[data-empty-state='feedback-pool']").text()).toContain("反馈池为空");
  });

  it("clears the feedback pool and refreshes the workbench", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce(createEmptyWorkbench());
    vi.mocked(settingsApi.clearFeedbackPool).mockResolvedValue({
      ok: true,
      cleared: 1
    });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();
    await wrapper.get("[data-action='clear-feedback-pool']").trigger("click");
    await flushPromises();

    expect(settingsApi.clearFeedbackPool).toHaveBeenCalledTimes(1);
    expect(message.success).toHaveBeenCalledWith("反馈池已清空。");
    expect(wrapper.get("[data-empty-state='feedback-pool']").text()).toContain("内容页提交的新反馈词会显示在这里");
  });

  it("saves provider settings and clears the api key input", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce(createWorkbench());
    vi.mocked(settingsApi.saveProviderSettings).mockResolvedValue({
      ok: true,
      providerKind: "deepseek"
    });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();
    await wrapper.get("[data-provider-api-key-input]").setValue("test-api-key");
    await wrapper.get("[data-view-rules-provider-form]").trigger("submit");
    await flushPromises();

    expect(settingsApi.saveProviderSettings).toHaveBeenCalledWith({
      providerKind: "deepseek",
      apiKey: "test-api-key"
    });
    expect((wrapper.get("[data-provider-api-key-input]").element as HTMLInputElement).value).toBe("");
    expect(message.success).toHaveBeenCalledWith("DeepSeek 配置已保存。当前版本先只保留配置，不参与筛选策略。");
  });

  it("toggles provider activation and deletes provider entries", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce({
        ...createWorkbench(),
        providerSettings: [
          {
            providerKind: "deepseek",
            apiKeyLast4: "1234",
            isEnabled: false,
            updatedAt: "2026-03-31T09:00:00.000Z"
          }
        ]
      });
    vi.mocked(settingsApi.updateProviderSettingsActivation).mockResolvedValue({
      ok: true,
      providerKind: "minimax",
      isEnabled: true
    });
    vi.mocked(settingsApi.deleteProviderSettings).mockResolvedValue({ ok: true });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();
    await wrapper.get("[data-provider-activation='minimax']").trigger("click");
    await flushPromises();

    expect(settingsApi.updateProviderSettingsActivation).toHaveBeenCalledWith({
      providerKind: "minimax",
      enable: true
    });
    expect(message.success).toHaveBeenCalledWith(
      "MiniMax 已启用。当前版本仍只会保留这份配置，不会参与反馈池处理。"
    );

    await wrapper.get("[data-provider-delete='minimax']").trigger("click");
    await flushPromises();

    expect(settingsApi.deleteProviderSettings).toHaveBeenCalledWith("minimax");
    expect(message.success).toHaveBeenCalledWith("MiniMax 配置已删除。");
  });

  it("shows empty states for both feedback pool and provider settings", async () => {
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createEmptyWorkbench());

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    expect(wrapper.get("[data-empty-state='feedback-pool']").text()).toContain("反馈池为空");
    expect(wrapper.get("[data-empty-state='provider-settings']").text()).toContain("还没有保存任何厂商配置");
  });
});
