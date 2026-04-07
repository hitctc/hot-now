import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfilePage from "../../src/client/pages/settings/ProfilePage.vue";
import * as settingsApi from "../../src/client/services/settingsApi";
import { mountWithApp } from "./helpers/mountWithApp";

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

    const wrapper = mountWithApp(ProfilePage);

    await flushPromises();

    expect(wrapper.get("[data-settings-intro='profile']").text()).toContain("Account Settings");
    expect(wrapper.get("[data-profile-section='overview']").findAll("article")).toHaveLength(3);
    expect(wrapper.get("[data-profile-section='summary']").text()).toContain("系统管理员");
    expect(wrapper.get("[data-profile-field='display-name']").text()).toBe("系统管理员");
    expect(wrapper.get("[data-profile-field='email']").text()).toBe("admin@example.com");
    expect(wrapper.get("[data-profile-field='username']").text()).toBe("admin");
    expect(wrapper.get("[data-profile-field='session-status']").text()).toContain("已登录");
  });

  it("renders the shared editorial empty state when the profile payload is empty", async () => {
    vi.mocked(settingsApi.readSettingsProfile).mockResolvedValue(null);

    const wrapper = mountWithApp(ProfilePage);

    await flushPromises();

    const emptyState = wrapper.get("[data-profile-empty-state]");

    expect(emptyState.text()).toContain("当前没有可读取的用户信息");
    expect(emptyState.text()).toContain("可以稍后刷新页面，或重新登录后再试。");
    expect(emptyState.classes()).toContain("rounded-editorial-lg");
    expect(emptyState.classes()).toContain("bg-editorial-panel");
  });
});
