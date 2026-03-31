import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Antd from "ant-design-vue";

import { APP_ROUTE_BASE, CLIENT_ASSET_BASE } from "../../src/client/appBases";
import App from "../../src/client/App.vue";
import { createAppRouter } from "../../src/client/router";

vi.mock("../../src/client/services/settingsApi", () => ({
  readSettingsProfile: vi.fn().mockResolvedValue({
    username: "admin",
    displayName: "系统管理员",
    role: "admin",
    email: "admin@example.com",
    loggedIn: true
  }),
  readSettingsViewRules: vi.fn(),
  readSettingsSources: vi.fn(),
  saveViewRuleConfig: vi.fn(),
  saveProviderSettings: vi.fn(),
  deleteProviderSettings: vi.fn(),
  saveNlRules: vi.fn(),
  createDraftFromFeedback: vi.fn(),
  deleteFeedbackEntry: vi.fn(),
  clearFeedbackPool: vi.fn(),
  saveStrategyDraft: vi.fn(),
  deleteStrategyDraft: vi.fn(),
  toggleSource: vi.fn(),
  triggerManualCollect: vi.fn(),
  triggerManualSendLatestEmail: vi.fn()
}));

describe("client app shell", () => {
  beforeEach(() => {
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
    vi.unstubAllGlobals();
  });

  it("renders the unified shell, current route title, navigation links and theme control", async () => {
    const router = createAppRouter();

    await router.push("/settings/profile");
    await router.isReady();

    const wrapper = mount(App, {
      global: {
        plugins: [Antd, router]
      }
    });

    await flushPromises();

    expect(wrapper.text()).toContain("HotNow Editorial Desk");
    expect(wrapper.text()).toContain("AI-first 工作台壳层");
    expect(wrapper.text()).toContain("当前登录用户页");
    expect(wrapper.text()).toContain("当前会展示登录用户摘要和会话上下文");
    expect(wrapper.find("[data-shell-page-title]").text()).toBe("当前登录用户页");
    expect(wrapper.find("[data-shell-page-description]").text()).toContain("登录用户摘要");
    expect(wrapper.find("[data-shell-theme-toggle]").exists()).toBe(true);

    const navLinks = wrapper.findAll(".unified-shell__nav-link");

    expect(navLinks.map((node) => node.attributes("href"))).toEqual([
      "/ai-new",
      "/ai-hot",
      "/settings/view-rules",
      "/settings/sources",
      "/settings/profile"
    ]);

    expect(
      navLinks.map((node) => node.find(".unified-shell__nav-label").text().trim())
    ).toEqual([
      "AI 新讯",
      "AI 热点",
      "筛选策略",
      "数据收集",
      "当前用户"
    ]);
  });

  it("keeps the /client/ asset base separate from the /settings/ route base while leaving content routes on the server", async () => {
    const router = createAppRouter();

    await router.push("/settings/profile");
    await router.isReady();

    expect(CLIENT_ASSET_BASE).toBe("/client/");
    expect(APP_ROUTE_BASE).toBe("/");
    expect(router.currentRoute.value.fullPath).toBe("/settings/profile");
    expect(router.resolve("/settings/profile").href).toBe("/settings/profile");
    expect(router.getRoutes().some((route) => route.path === "/client/settings/profile")).toBe(false);
    expect(router.getRoutes().some((route) => route.path === "/")).toBe(true);
    expect(router.getRoutes().some((route) => route.path === "/ai-new")).toBe(false);
    expect(router.getRoutes().some((route) => route.path === "/ai-hot")).toBe(false);
    expect(router.getRoutes().some((route) => route.path === "/articles")).toBe(false);
  });
});
