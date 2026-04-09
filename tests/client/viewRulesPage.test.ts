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
    saveProviderSettings: vi.fn(),
    updateProviderSettingsActivation: vi.fn(),
    deleteProviderSettings: vi.fn(),
    deleteFeedbackEntry: vi.fn(),
    clearFeedbackPool: vi.fn()
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

  it("renders feedback pool and llm settings while removing nl-rules and draft workbench sections", async () => {
    vi.mocked(settingsApi.readSettingsViewRules).mockResolvedValue(createWorkbench());

    const wrapper = mountWithApp(ViewRulesPage);

    await flushPromises();

    expect(settingsApi.readSettingsViewRules).toHaveBeenCalledTimes(1);
    expect(wrapper.get("[data-settings-section='overview']").text()).toContain("反馈池");
    expect(wrapper.get("[data-settings-section='overview']").text()).toContain("LLM 设置");
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
