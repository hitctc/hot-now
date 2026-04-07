import { flushPromises, type VueWrapper } from "@vue/test-utils";
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
    saveProviderSettings: vi.fn(),
    updateProviderSettingsActivation: vi.fn(),
    deleteProviderSettings: vi.fn(),
    saveNlRules: vi.fn(),
    cancelNlEvaluation: vi.fn(),
    createDraftFromFeedback: vi.fn(),
    deleteFeedbackEntry: vi.fn(),
    clearFeedbackPool: vi.fn(),
    saveStrategyDraft: vi.fn(),
    deleteStrategyDraft: vi.fn()
  };
});

function createWorkbench() {
  return {
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
      message: "已配置可用厂商"
    },
    nlRules: [
      { scope: "base", enabled: true, ruleText: "保留 workflow 深度总结。", createdAt: "", updatedAt: "" },
      { scope: "ai_new", enabled: true, ruleText: "优先展示 agent 相关内容。", createdAt: "", updatedAt: "" },
      { scope: "ai_hot", enabled: true, ruleText: "", createdAt: "", updatedAt: "" }
    ],
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
        suggestedScope: "ai_new",
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
    isEvaluationRunning: false,
    isEvaluationStopRequested: false
  } satisfies settingsApi.SettingsViewRulesResponse;
}

function createWorkbenchWithEnabledProvider(providerKind: "deepseek" | "minimax") {
  const workbench = createWorkbench();

  return {
    ...workbench,
    providerSettings: workbench.providerSettings.map((settings) => ({
      ...settings,
      isEnabled: settings.providerKind === providerKind
    })),
    latestEvaluationRun: {
      ...workbench.latestEvaluationRun,
      providerKind
    }
  } satisfies settingsApi.SettingsViewRulesResponse;
}

function createEmptyWorkbench() {
  return {
    ...createWorkbench(),
    feedbackPool: [],
    strategyDrafts: []
  } satisfies settingsApi.SettingsViewRulesResponse;
}

function createRunningWorkbench() {
  return {
    ...createWorkbench(),
    latestEvaluationRun: {
      id: 1,
      runType: "full-recompute",
      status: "running",
      providerKind: "deepseek",
      startedAt: "2026-03-31T09:10:00.000Z",
      finishedAt: null,
      itemCount: 120,
      successCount: 30,
      failureCount: 10,
      notes: null,
      createdAt: "2026-03-31T09:10:00.000Z"
    },
    isEvaluationRunning: true,
    isEvaluationStopRequested: false
  } satisfies settingsApi.SettingsViewRulesResponse;
}

function createStoppingWorkbench() {
  return {
    ...createWorkbench(),
    latestEvaluationRun: {
      id: 1,
      runType: "full-recompute",
      status: "running",
      providerKind: "deepseek",
      startedAt: "2026-03-31T09:10:00.000Z",
      finishedAt: null,
      itemCount: 120,
      successCount: 45,
      failureCount: 10,
      notes: null,
      createdAt: "2026-03-31T09:10:00.000Z"
    },
    isEvaluationRunning: true,
    isEvaluationStopRequested: true
  } satisfies settingsApi.SettingsViewRulesResponse;
}

function createInterruptedWorkbench() {
  return {
    ...createWorkbench(),
    latestEvaluationRun: {
      id: 1,
      runType: "full-recompute",
      status: "running",
      providerKind: "deepseek",
      startedAt: "2026-03-31T09:10:00.000Z",
      finishedAt: null,
      itemCount: 120,
      successCount: 0,
      failureCount: 0,
      notes: null,
      createdAt: "2026-03-31T09:10:00.000Z"
    },
    isEvaluationRunning: false,
    isEvaluationStopRequested: false
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the provider, nl-rules, feedback and draft sections from the api workbench", async () => {
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createWorkbench());

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    expect(settingsApi.readSettingsViewRules).toHaveBeenCalledTimes(1);
    expect(wrapper.find("[data-settings-intro='view-rules']").exists()).toBe(false);
    expect(wrapper.get("[data-settings-section='overview']").text()).toContain("策略门");
    expect(wrapper.get("[data-settings-section='overview']").text()).toContain("反馈池");
    expect(wrapper.get("[data-settings-section='overview']").text()).toContain("草稿池");
    expect(wrapper.get("[data-view-rules-section='provider-settings']").text()).toContain("DeepSeek");
    expect(wrapper.get("[data-view-rules-provider-alert]").classes()).toContain("editorial-inline-alert");
    expect(wrapper.get("[data-view-rules-section='provider-settings']").text()).toContain("已启用厂商");
    expect(wrapper.get("[data-view-rules-provider-status-note]").text()).toContain("每个厂商会分别保存 API key");
    expect(wrapper.get("[data-view-rules-selected-provider-status]").text()).toContain("DeepSeek 当前已配置并启用");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("正式自然语言策略");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("基础入池门");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("AI 热点入池门");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("AI 新讯入池门");
    expect(wrapper.get("[data-view-rules-window-alert]").classes()).toContain("editorial-inline-alert");
    expect(wrapper.get("[data-view-rules-run-status]").classes()).toContain("editorial-status-tag");
    expect(wrapper.get("[data-view-rules-run-status]").classes()).toContain("editorial-status-tag--idle");
    expect(wrapper.get("[data-view-rules-run-detail]").classes()).toContain("editorial-inline-alert--success");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("AI 新讯固定按最近 24 小时窗口构建结果集");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("AI 热点继续按热点形成逻辑筛选");
    expect(wrapper.find("[data-settings-section='feedback-pool']").exists()).toBe(true);
    expect(wrapper.get("[data-view-rules-section='feedback-pool']").text()).toContain("Agent 工作流总结");
    expect(wrapper.get("[data-feedback-row]").text()).toContain("Agent 工作流总结");
    expect(wrapper.get("[data-feedback-row]").text()).toContain("OpenAI");
    expect(wrapper.get("[data-feedback-row]").text()).toContain("这类内容应该更靠前。");
    expect(wrapper.get("[data-action='copy-feedback-pool']").text()).toContain("复制全部反馈");
    expect(wrapper.get("[data-action='clear-feedback-pool']").text()).toContain("清空全部反馈");
    expect(wrapper.find("[data-settings-section='strategy-drafts']").exists()).toBe(true);
    expect(wrapper.get("[data-draft-row]").text()).toContain("草稿 #301");
    expect(
      (wrapper.get("[data-draft-form='301'] textarea").element as HTMLTextAreaElement).value
    ).toBe("优先展示包含 agent workflow 的深度总结。");
  });

  it("saves nl rules and reloads the workbench", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce(createRunningWorkbench());
    vi.mocked(settingsApi.saveNlRules).mockResolvedValue({
      ok: true,
      run: {
        status: "running"
      }
    });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    await wrapper.get("[data-nl-rule-scope='base']").setValue("新的基础规则");
    await wrapper.get("[data-view-rules-form='nl-rules']").trigger("submit");
    await flushPromises();

    expect(settingsApi.saveNlRules).toHaveBeenCalledWith({
      base: { enabled: true, ruleText: "新的基础规则" },
      ai_new: { enabled: true, ruleText: "优先展示 agent 相关内容。" },
      ai_hot: { enabled: true, ruleText: "" }
    });
    expect(settingsApi.readSettingsViewRules).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("正式规则已保存，重算已转入后台运行");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("重算进行中");
  });

  it("shows an intuitive progress summary while recompute is still running", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T09:30:00.000Z"));
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createRunningWorkbench());

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("重算进行中");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("已处理 40 / 120 条");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("预计还需约 40 分钟");
  });

  it("sends a cancellation request and refreshes the workbench while recompute is running", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createRunningWorkbench())
      .mockResolvedValueOnce(createStoppingWorkbench());
    vi.mocked(settingsApi.cancelNlEvaluation).mockResolvedValue({
      ok: true,
      accepted: true,
      status: "cancelling"
    });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    await wrapper.get("[data-action='cancel-nl-evaluation']").trigger("click");
    await flushPromises();

    expect(settingsApi.cancelNlEvaluation).toHaveBeenCalledTimes(1);
    expect(settingsApi.readSettingsViewRules).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("已发送中断请求，当前正在处理的这一条完成后会停止重算。");
    expect(wrapper.get("[data-view-rules-run-status]").text()).toContain("正在停止");
  });

  it("treats a stale running record as an interrupted recompute instead of a live task", async () => {
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createInterruptedWorkbench());

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain("上次重算中断");
    expect(wrapper.get("[data-view-rules-section='nl-rules']").text()).toContain(
      "当前没有活跃任务，可重新保存正式规则触发一次新的重算"
    );
  });

  it("applies a draft into the matching nl-rule editor without saving immediately", async () => {
    const successSpy = vi.spyOn(message, "success").mockImplementation(() => createMockMessageHandle());
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createWorkbench());

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    await wrapper.get("[data-action='apply-draft'][data-draft-id='301']").trigger("click");

    expect((wrapper.get("[data-nl-rule-scope='ai_new']").element as HTMLTextAreaElement).value).toContain(
      "优先展示包含 agent workflow 的深度总结。"
    );
    expect(settingsApi.saveNlRules).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("草稿已写入正式策略编辑器");
    expect(successSpy).toHaveBeenCalledWith("草稿已写入正式策略编辑器，记得保存正式规则。");
  });

  it("updates the selected provider status immediately after switching the provider", async () => {
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createWorkbench());

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    (
      wrapper.getComponent("[data-provider-kind-select]") as VueWrapper<{ $emit: (event: string, value: string) => void }>
    ).vm.$emit("update:value", "minimax");
    await flushPromises();

    expect(wrapper.get("[data-view-rules-selected-provider-status]").text()).toContain(
      "MiniMax 当前已保存，但还未启用。"
    );
  });

  it("defaults the provider selector to the enabled provider after loading the workbench", async () => {
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createWorkbenchWithEnabledProvider("minimax"));

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    expect(wrapper.get("[data-view-rules-selected-provider-status]").text()).toContain(
      "MiniMax 当前已配置并启用。"
    );
  });

  it("enables the selected saved provider without resubmitting the api key", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce({
        ...createWorkbench(),
        providerSettings: [
          {
            providerKind: "deepseek",
            apiKeyLast4: "1234",
            isEnabled: false,
            updatedAt: "2026-03-31T09:00:00.000Z"
          },
          {
            providerKind: "minimax",
            apiKeyLast4: "5678",
            isEnabled: true,
            updatedAt: "2026-03-31T08:40:00.000Z"
          }
        ]
      });
    vi.mocked(settingsApi.updateProviderSettingsActivation).mockResolvedValue({
      ok: true,
      providerKind: "minimax",
      isEnabled: true
    });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    (
      wrapper.getComponent("[data-provider-kind-select]") as VueWrapper<{ $emit: (event: string, value: string) => void }>
    ).vm.$emit("update:value", "minimax");
    await flushPromises();

    await wrapper.get("[data-action='enable-provider-settings']").trigger("click");
    await flushPromises();

    expect(settingsApi.updateProviderSettingsActivation).toHaveBeenCalledWith({
      providerKind: "minimax",
      enable: true
    });
    expect(wrapper.get("[data-view-rules-selected-provider-status]").text()).toContain("MiniMax 当前已配置并启用");
  });

  it("renders the shared editorial empty states for feedback and draft pools", async () => {
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createEmptyWorkbench());

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    const feedbackEmptyState = wrapper.get("[data-empty-state='feedback-pool']");
    const draftEmptyState = wrapper.get("[data-empty-state='strategy-drafts']");

    expect(feedbackEmptyState.text()).toContain("反馈池为空");
    expect(feedbackEmptyState.text()).toContain("内容页的新反馈会显示在这里。");
    expect(feedbackEmptyState.classes()).toContain("rounded-editorial-lg");
    expect(feedbackEmptyState.classes()).toContain("bg-editorial-panel");

    expect(draftEmptyState.text()).toContain("草稿池为空");
    expect(draftEmptyState.text()).toContain("可以先把反馈转成草稿。");
    expect(draftEmptyState.classes()).toContain("rounded-editorial-lg");
    expect(draftEmptyState.classes()).toContain("bg-editorial-panel");
  });

  it("requires popconfirm before deleting the current provider settings", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce(createWorkbench());
    vi.mocked(settingsApi.deleteProviderSettings).mockResolvedValue({ ok: true });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    await wrapper.get("[data-action='delete-provider-settings']").trigger("click");
    expect(settingsApi.deleteProviderSettings).not.toHaveBeenCalled();

    const providerDeleteConfirm = wrapper
      .findAllComponents({ name: "APopconfirm" })
      .find((component) => component.text().includes("删除当前厂商配置"));

    expect(providerDeleteConfirm).toBeTruthy();

    providerDeleteConfirm!.vm.$emit("confirm");
    await flushPromises();

    expect(settingsApi.deleteProviderSettings).toHaveBeenCalledWith("deepseek");
  });

  it("requires popconfirm before deleting a feedback entry", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce(createWorkbench());
    vi.mocked(settingsApi.deleteFeedbackEntry).mockResolvedValue({
      ok: true,
      feedbackId: 201
    });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    await wrapper.get("[data-action='delete-feedback-201']").trigger("click");
    expect(settingsApi.deleteFeedbackEntry).not.toHaveBeenCalled();

    const feedbackDeleteConfirm = wrapper
      .findAllComponents({ name: "APopconfirm" })
      .find((component) => component.find('[data-action="delete-feedback-201"]').exists());

    expect(feedbackDeleteConfirm).toBeTruthy();

    feedbackDeleteConfirm!.vm.$emit("confirm");
    await flushPromises();

    expect(settingsApi.deleteFeedbackEntry).toHaveBeenCalledWith(201);
  });

  it("requires popconfirm before clearing the feedback pool", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce(createEmptyWorkbench());
    vi.mocked(settingsApi.clearFeedbackPool).mockResolvedValue({ ok: true, cleared: 1 });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    await wrapper.get("[data-action='clear-feedback-pool']").trigger("click");
    expect(settingsApi.clearFeedbackPool).not.toHaveBeenCalled();

    const clearFeedbackConfirm = wrapper
      .findAllComponents({ name: "APopconfirm" })
      .find((component) => component.find('[data-action="clear-feedback-pool"]').exists());

    expect(clearFeedbackConfirm).toBeTruthy();

    clearFeedbackConfirm!.vm.$emit("confirm");
    await flushPromises();

    expect(settingsApi.clearFeedbackPool).toHaveBeenCalledTimes(1);
  });

  it("requires popconfirm before deleting a draft", async () => {
    vi.mocked(settingsApi.readSettingsViewRules)
      .mockResolvedValueOnce(createWorkbench())
      .mockResolvedValueOnce(createEmptyWorkbench());
    vi.mocked(settingsApi.deleteStrategyDraft).mockResolvedValue({
      ok: true,
      draftId: 301
    });

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    await wrapper.get("[data-action='delete-draft-301']").trigger("click");
    expect(settingsApi.deleteStrategyDraft).not.toHaveBeenCalled();

    const draftDeleteConfirm = wrapper
      .findAllComponents({ name: "APopconfirm" })
      .find((component) => component.find('[data-action="delete-draft-301"]').exists());

    expect(draftDeleteConfirm).toBeTruthy();

    draftDeleteConfirm!.vm.$emit("confirm");
    await flushPromises();

    expect(settingsApi.deleteStrategyDraft).toHaveBeenCalledWith(301);
  });
});
