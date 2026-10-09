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
    readSettingsProfile: vi.fn(),
    readSettingsApiAccessTokens: vi.fn(),
    createSettingsApiAccessToken: vi.fn(),
    revokeSettingsApiAccessToken: vi.fn()
  };
});

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(settingsApi.readSettingsApiAccessTokens).mockResolvedValue([]);
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

    expect(wrapper.find("[data-settings-intro='profile']").exists()).toBe(true);
    expect(wrapper.get("[data-profile-section='overview']").findAll("article")).toHaveLength(3);
    expect(wrapper.get("[data-profile-section='summary']").text()).toContain("系统管理员");
    expect(wrapper.get("[data-profile-field='display-name']").text()).toBe("系统管理员");
    expect(wrapper.get("[data-profile-field='email']").text()).toBe("admin@example.com");
    expect(wrapper.get("[data-profile-field='username']").text()).toBe("admin");
    expect(wrapper.get("[data-profile-field='session-status']").text()).toContain("已登录");
  });

  it("shows a newly issued token only after the create action", async () => {
    vi.mocked(settingsApi.readSettingsProfile).mockResolvedValue({
      username: "admin",
      displayName: "系统管理员",
      role: "admin",
      email: "admin@example.com",
      loggedIn: true
    });
    const plainToken = "hn_live_test-token-that-is-shown-once";
    vi.mocked(settingsApi.createSettingsApiAccessToken).mockResolvedValue({
      token: {
        id: 8,
        name: "MacBook",
        tokenPrefix: "hn_live_test",
        createdAt: "2026-10-09T08:00:00.000Z",
        expiresAt: "2027-10-09T08:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
        token: plainToken
      }
    });

    const wrapper = mountWithApp(ProfilePage);
    await flushPromises();
    expect(wrapper.text()).not.toContain(plainToken);

    await wrapper.get("[data-api-token-create]").trigger("click");
    await flushPromises();

    expect(settingsApi.createSettingsApiAccessToken).toHaveBeenCalledWith("MacBook");
    expect(wrapper.get("[data-api-token-issued]").text()).toContain(plainToken);
    expect(wrapper.get("[data-api-token-issued]").text()).toContain("security add-generic-password");
  });

  it("renders the shared editorial empty state when the profile payload is empty", async () => {
    vi.mocked(settingsApi.readSettingsProfile).mockResolvedValue(null);

    const wrapper = mountWithApp(ProfilePage);

    await flushPromises();

    const emptyState = wrapper.get("[data-profile-empty-state]");

    expect(emptyState.text()).toContain("当前没有可读取的用户信息");
    expect(emptyState.text()).toContain("可以稍后刷新页面，或重新登录后再试。");
    expect(emptyState.classes()).toContain("rounded-editorial-lg");
    expect(emptyState.classes()).toContain("editorial-glass-panel");
  });
});
