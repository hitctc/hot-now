import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Antd from "ant-design-vue";

import { APP_ROUTE_BASE, CLIENT_ASSET_BASE } from "../../src/client/appBases";
import App from "../../src/client/App.vue";
import { createAppRouter } from "../../src/client/router";

const settingsApiMocks = vi.hoisted(() => ({
  readSettingsProfile: vi.fn(),
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

vi.mock("../../src/client/services/settingsApi", () => settingsApiMocks);

describe("client app shell", () => {
  beforeEach(() => {
    settingsApiMocks.readSettingsProfile.mockResolvedValue({
      username: "admin",
      displayName: "系统管理员",
      role: "admin",
      email: "admin@example.com",
      loggedIn: true
    });
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
    expect(wrapper.get("[data-shell-root]").classes()).toEqual(
      expect.arrayContaining(["min-h-screen", "text-editorial-text-main"])
    );
    expect(wrapper.get("[data-mobile-shell-nav]").classes()).toEqual(
      expect.arrayContaining(["sticky", "top-0", "z-30", "hidden", "max-[900px]:block"])
    );
    expect(wrapper.get("[data-shell-page-summary]").classes()).toEqual(
      expect.arrayContaining(["rounded-editorial-xl"])
    );
    expect(wrapper.find("[data-shell-page-title]").text()).toBe("当前登录用户页");
    expect(wrapper.find("[data-shell-page-description]").text()).toContain("登录用户摘要");
    expect(wrapper.find("[data-shell-theme-toggle]").exists()).toBe(true);

    const navLinks = wrapper.findAll("[data-shell-nav-link]");
    const activeNavLink = wrapper.get('[data-shell-nav-link="/settings/profile"]');
    const sidebar = wrapper.get("aside");

    expect(navLinks.map((node) => node.attributes("href"))).toEqual([
      "/ai-new",
      "/ai-hot",
      "/settings/sources",
      "/settings/view-rules",
      "/settings/profile"
    ]);

    expect(
      navLinks.map((node) => node.find("span.text-sm").text().trim())
    ).toEqual([
      "AI 新讯",
      "AI 热点",
      "数据收集",
      "筛选策略",
      "当前用户"
    ]);

    expect(sidebar.classes()).toEqual(
      expect.arrayContaining(["min-[901px]:flex", "min-[901px]:w-[248px]", "min-[1081px]:w-[280px]"])
    );

    expect(activeNavLink.classes()).toEqual(
      expect.arrayContaining([
        "select-none",
        "border-editorial-border-strong",
        "bg-editorial-link-active",
        "text-editorial-text-sidebar",
        "ring-1",
        "ring-editorial-ring",
        "before:bg-editorial-accent",
        "before:content-['']",
        "shadow-editorial-accent"
      ])
    );
    expect(activeNavLink.find("span.text-xs").classes()).toEqual(
      expect.arrayContaining(["text-editorial-text-body"])
    );
  });

  it("keeps shell navigation highlights in the editorial paper style instead of a solid accent block", async () => {
    const router = createAppRouter();

    await router.push("/ai-hot");
    await router.isReady();

    const wrapper = mount(App, {
      global: {
        plugins: [Antd, router]
      }
    });

    await flushPromises();

    const activeNavLink = wrapper.get('[data-shell-nav-link="/ai-hot"]');

    expect(activeNavLink.classes()).toEqual(
      expect.arrayContaining([
        "select-none",
        "bg-editorial-link-active",
        "border-editorial-border-strong",
        "text-editorial-text-sidebar",
        "ring-1",
        "ring-editorial-ring",
        "shadow-editorial-accent"
      ])
    );
    expect(activeNavLink.classes()).not.toEqual(expect.arrayContaining(["text-editorial-text-on-accent"]));
  });

  it("keeps the /client/ asset base separate from the /settings/ route base while mounting AI content routes in the same app", async () => {
    const router = createAppRouter();

    await router.push("/settings/profile");
    await router.isReady();

    expect(CLIENT_ASSET_BASE).toBe("/client/");
    expect(APP_ROUTE_BASE).toBe("/");
    expect(router.currentRoute.value.fullPath).toBe("/settings/profile");
    expect(router.resolve("/settings/profile").href).toBe("/settings/profile");
    expect(router.getRoutes().some((route) => route.path === "/client/settings/profile")).toBe(false);
    expect(router.getRoutes().some((route) => route.path === "/")).toBe(true);
    expect(router.getRoutes().some((route) => route.path === "/ai-new")).toBe(true);
    expect(router.getRoutes().some((route) => route.path === "/ai-hot")).toBe(true);
    expect(router.getRoutes().some((route) => route.path === "/articles")).toBe(false);
  });

  it("renders the mobile AI-first tabs and closes the system drawer after navigation", async () => {
    const router = createAppRouter();

    await router.push("/settings/profile");
    await router.isReady();

    const wrapper = mount(App, {
      global: {
        plugins: [Antd, router]
      }
    });

    await flushPromises();

    expect(wrapper.find("[data-mobile-shell-nav]").exists()).toBe(true);
    expect(
      wrapper.findAll("[data-mobile-content-tab]").map((node) => node.text().trim())
    ).toEqual(["AI 新讯", "AI 热点"]);
    expect(wrapper.get("[data-mobile-system-toggle]").classes()).toEqual(expect.arrayContaining(["select-none"]));
    expect(wrapper.get('[data-mobile-content-tab="/ai-new"]').classes()).toEqual(expect.arrayContaining(["select-none"]));

    await wrapper.get("[data-mobile-system-toggle]").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-mobile-system-drawer]").exists()).toBe(true);

    await wrapper.get('[data-mobile-drawer-link="/settings/view-rules"]').trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe("/settings/view-rules");
    expect(wrapper.find("[data-mobile-system-drawer]").exists()).toBe(false);
  });

  it("shows a login entry when the current visitor is anonymous", async () => {
    settingsApiMocks.readSettingsProfile.mockResolvedValueOnce(null);

    const router = createAppRouter();

    await router.push("/ai-new");
    await router.isReady();

    const wrapper = mount(App, {
      global: {
        plugins: [Antd, router]
      }
    });

    await flushPromises();

    expect(wrapper.get("[data-shell-login-link]").attributes("href")).toBe("/login");

    await wrapper.get("[data-mobile-system-toggle]").trigger("click");
    await flushPromises();

    expect(wrapper.get("[data-mobile-login-link]").attributes("href")).toBe("/login");
  });
});
