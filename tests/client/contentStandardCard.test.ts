import { flushPromises, mount } from "@vue/test-utils";
import Antd, { message } from "ant-design-vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ContentStandardCard from "../../src/client/components/content/ContentStandardCard.vue";
import type { ContentCard } from "../../src/client/services/contentApi";
import { HttpError } from "../../src/client/services/http";
import * as contentApi from "../../src/client/services/contentApi";

function createMockMessageHandle(): ReturnType<typeof message.success> {
  return (() => undefined) as ReturnType<typeof message.success>;
}

vi.mock("../../src/client/services/contentApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/contentApi")>(
    "../../src/client/services/contentApi"
  );

  return {
    ...actual,
    saveFeedbackPoolEntry: vi.fn()
  };
});

const baseCard: ContentCard = {
  id: 202,
  title: "Agent Monitor Update",
  summary: "A compact summary.",
  sourceName: "36氪",
  sourceKind: "36kr",
  canonicalUrl: "https://example.com/agent-monitor",
  publishedAt: "2026-04-07T10:00:00.000Z",
  contentScore: 84,
  scoreBadges: ["24h 内", "媒体源"]
};

describe("ContentStandardCard", () => {
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
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps short summaries expanded without rendering a toggle", async () => {
    const wrapper = mount(ContentStandardCard, {
      props: {
        card: baseCard,
        displayIndex: 12
      },
      global: {
        plugins: [Antd]
      },
      attachTo: document.body
    });

    await flushPromises();

    expect(wrapper.get("[data-content-standard-summary]").text()).toContain("A compact summary.");
    expect(wrapper.get("[data-content-standard-summary]").attributes("data-content-summary-expanded")).toBe("false");
    expect(wrapper.get("[data-content-standard-summary]").attributes("class")).toContain("[-webkit-line-clamp:5]");
    expect(wrapper.get("[data-content-display-index]").text()).toBe("12");
    expect(wrapper.find("[data-content-row-shell]").exists()).toBe(true);
    expect(wrapper.find("[data-content-row-sidecar]").exists()).toBe(true);
    expect(wrapper.find("[data-content-summary-toggle]").exists()).toBe(false);
    expect(wrapper.find("[data-content-action='favorite']").exists()).toBe(false);
    expect(wrapper.find("[data-content-action='reaction']").exists()).toBe(false);
    expect(wrapper.get("[data-content-action='feedback-panel-toggle']").text()).toContain("补充反馈");
    expect(wrapper.find("[data-content-feedback-modal]").exists()).toBe(false);
  });

  it("shows expand and collapse controls for long standard summaries", async () => {
    const wrapper = mount(ContentStandardCard, {
      props: {
        card: {
          ...baseCard,
          summary: "Long standard summary ".repeat(24)
        }
      },
      global: {
        plugins: [Antd]
      },
      attachTo: document.body
    });

    await flushPromises();

    expect(wrapper.get("[data-content-row]").classes()).toContain("group");
    expect(wrapper.get("[data-content-summary-toggle]").text()).toBe("展开");
    expect(wrapper.get("[data-content-standard-summary]").attributes("class")).toContain("[-webkit-line-clamp:5]");

    await wrapper.get("[data-content-summary-toggle]").trigger("click");
    await flushPromises();

    expect(wrapper.get("[data-content-summary-toggle]").text()).toBe("收起");
    expect(wrapper.get("[data-content-standard-summary]").attributes("data-content-summary-expanded")).toBe("true");
    expect(wrapper.get("[data-content-standard-summary]").attributes("class")).not.toContain("[-webkit-line-clamp:5]");
  });

  it("shows a login-required message when feedback save is rejected with 401", async () => {
    const warningSpy = vi.spyOn(message, "warning").mockImplementation(() => createMockMessageHandle());
    vi.mocked(contentApi.saveFeedbackPoolEntry).mockRejectedValue(
      new HttpError("Request failed for /actions/content/202/feedback-pool", 401, { ok: false, reason: "unauthorized" })
    );

    const wrapper = mount(ContentStandardCard, {
      props: {
        card: baseCard
      },
      global: {
        plugins: [Antd]
      },
      attachTo: document.body
    });

    await wrapper.get("[data-content-action='feedback-panel-toggle']").trigger("click");
    await flushPromises();

    expect(document.body.textContent).toContain("反馈说明");
    const feedbackSubmitButton = document.body.querySelector("[data-feedback-panel] button");
    expect(feedbackSubmitButton).not.toBeNull();
    (feedbackSubmitButton as HTMLButtonElement).click();
    await flushPromises();

    expect(wrapper.text()).toContain("请先登录后再保存反馈词。");
    expect(warningSpy).toHaveBeenCalledWith("请先登录后再保存反馈词。");
  });

  it("shows a global success message after feedback save succeeds", async () => {
    const successSpy = vi.spyOn(message, "success").mockImplementation(() => createMockMessageHandle());
    vi.mocked(contentApi.saveFeedbackPoolEntry).mockResolvedValue({ ok: true, contentItemId: 202, entryId: 3 });

    const wrapper = mount(ContentStandardCard, {
      props: {
        card: baseCard
      },
      global: {
        plugins: [Antd]
      },
      attachTo: document.body
    });

    await wrapper.get("[data-content-action='feedback-panel-toggle']").trigger("click");
    await flushPromises();

    expect(document.body.querySelector("[data-feedback-panel]")).not.toBeNull();
    const feedbackSubmitButton = document.body.querySelector("[data-feedback-panel] button");
    expect(feedbackSubmitButton).not.toBeNull();
    (feedbackSubmitButton as HTMLButtonElement).click();
    await flushPromises();

    expect(successSpy).toHaveBeenCalledWith("反馈词已保存到反馈池");
    expect(wrapper.text()).toContain("反馈词已保存到反馈池");
    expect(document.body.querySelector("[data-feedback-panel]")).toBeNull();
  });
});
