import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfilePage from "../../src/client/pages/settings/ProfilePage.vue";
import * as settingsApi from "../../src/client/services/settingsApi";

vi.mock("../../src/client/services/settingsApi", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/settingsApi")>(
    "../../src/client/services/settingsApi"
  );

  return {
    ...actual,
    readSettingsProfile: vi.fn()
  };
});

describe("ProfilePage", () => {
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

  it("renders the current user summary from the api response", async () => {
    vi.mocked(settingsApi.readSettingsProfile).mockResolvedValue({
      username: "admin",
      displayName: "系统管理员",
      role: "admin",
      email: "admin@example.com",
      loggedIn: true
    });

    const wrapper = mount(ProfilePage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    expect(wrapper.get("[data-settings-intro='profile']").classes()).toContain("rounded-editorial-xl");
    expect(wrapper.get("[data-settings-intro='profile']").classes()).toContain("bg-editorial-panel");
    expect(wrapper.get("[data-settings-intro='profile']").classes()).toContain("shadow-editorial-page");
    expect(wrapper.get("[data-profile-section='summary']").classes()).toContain("rounded-editorial-xl");
    expect(wrapper.get("[data-profile-section='summary']").classes()).toContain("border");
    expect(wrapper.get("[data-profile-section='summary']").classes()).toContain(
      "border-editorial-border"
    );
    expect(wrapper.get("[data-profile-section='summary']").classes()).toContain("bg-editorial-panel");
    expect(wrapper.get("[data-profile-section='summary']").classes()).toContain("shadow-editorial-card");
    expect(wrapper.get("[data-profile-section='summary']").text()).toContain("系统管理员");
    expect(wrapper.text()).toContain("admin@example.com");
    expect(wrapper.text()).toContain("已登录");
  });

  it("renders the shared editorial empty state when the profile payload is empty", async () => {
    vi.mocked(settingsApi.readSettingsProfile).mockResolvedValue(null);

    const wrapper = mount(ProfilePage, {
      global: {
        plugins: [Antd]
      }
    });

    await flushPromises();

    const emptyState = wrapper.get("[data-profile-empty-state]");

    expect(emptyState.text()).toContain("当前没有可读取的用户信息");
    expect(emptyState.text()).toContain("可以稍后刷新页面，或重新登录后再试。");
    expect(emptyState.classes()).toContain("rounded-editorial-xl");
    expect(emptyState.classes()).toContain("bg-editorial-panel");
  });
});
