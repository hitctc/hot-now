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
const httpMocks = vi.hoisted(() => ({
  requestJson: vi.fn()
}));

vi.mock("../../src/client/services/settingsApi", () => settingsApiMocks);
vi.mock("../../src/client/services/http", async () => {
  const actual = await vi.importActual<typeof import("../../src/client/services/http")>(
    "../../src/client/services/http"
  );

  return {
    ...actual,
    requestJson: httpMocks.requestJson
  };
});

describe("client app shell", () => {
  beforeEach(() => {
    settingsApiMocks.readSettingsProfile.mockResolvedValue({
      username: "admin",
      displayName: "系统管理员",
      role: "admin",
      email: "admin@example.com",
      loggedIn: true
    });
    httpMocks.requestJson.mockResolvedValue({ ok: true });
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

    expect(wrapper.text()).not.toContain("HotNow");
    expect(wrapper.text()).toContain("热讯");
    expect(wrapper.text()).toContain("当前用户");
    expect(wrapper.text()).toContain("当前登录账号、会话状态和联系信息。");
    expect(wrapper.get("[data-shell-root]").classes()).toEqual(
      expect.arrayContaining(["min-h-screen", "bg-editorial-page", "text-editorial-text-main"])
    );
    expect(wrapper.get("[data-mobile-shell-nav]").classes()).toEqual(
      expect.arrayContaining(["sticky", "top-0", "z-30", "hidden", "border-b", "max-[900px]:block"])
    );
    expect(wrapper.get("[data-page-header]").classes()).toEqual(
      expect.arrayContaining(["border-b", "border-editorial-border"])
    );
    expect(wrapper.find("[data-shell-page-summary]").exists()).toBe(false);
    expect(wrapper.find("[data-workspace-sidebar]").exists()).toBe(true);
    expect(wrapper.get("[data-workspace-brand]").text()).toContain("热讯");
    expect(wrapper.get("[data-workspace-brand-logo]").attributes("src")).toBe("/brand/hotnow-logo-sd.png");
    expect(wrapper.get("[data-workspace-brand-logo]").attributes("alt")).toBe("HotNow logo");
    expect(wrapper.find("[data-page-header-title]").text()).toBe("当前用户");
    expect(wrapper.find("[data-page-header-description]").text()).toContain("当前登录账号");
    expect(wrapper.find("[data-page-header-logo]").exists()).toBe(false);
    expect(wrapper.find("[data-shell-theme-toggle]").exists()).toBe(true);
    expect(wrapper.text()).toContain("当前：深色");

    const navLinks = wrapper.findAll("[data-shell-nav-link]");
    const activeNavLink = wrapper.get('[data-shell-nav-link="/settings/profile"]');
    const sidebar = wrapper.get("[data-workspace-sidebar]");

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
      expect.arrayContaining(["min-[901px]:flex", "min-[901px]:w-[244px]", "border-r"])
    );

    expect(activeNavLink.classes()).toEqual(
      expect.arrayContaining([
        "group",
        "select-none",
        "bg-editorial-link-active",
        "text-editorial-text-main",
        "rounded-editorial-sm"
      ])
    );
    expect(activeNavLink.find("span.text-xs").classes()).toEqual(
      expect.arrayContaining(["text-editorial-text-body"])
    );
  });

  it("keeps shell navigation highlights in a light workspace style instead of the old accented panel treatment", async () => {
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
        "text-editorial-text-main",
        "rounded-editorial-sm"
      ])
    );
    expect(activeNavLink.classes()).not.toEqual(expect.arrayContaining(["text-editorial-text-on-accent"]));
    expect(activeNavLink.classes()).not.toEqual(expect.arrayContaining(["shadow-editorial-accent"]));
    expect(activeNavLink.classes()).not.toEqual(expect.arrayContaining(["border-editorial-border-strong"]));
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

  it("registers shell pages as lazy route components so the client build can split them into separate chunks", async () => {
    const router = createAppRouter();
    const shellRoutePaths = ["/", "/ai-new", "/ai-hot", "/settings/view-rules", "/settings/sources", "/settings/profile"];

    for (const path of shellRoutePaths) {
      const route = router.getRoutes().find((item) => item.path === path);

      expect(route, `missing route for ${path}`).toBeDefined();
      expect(route?.components?.default, `route ${path} should use a lazy component factory`).toBeTypeOf("function");
    }
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
    expect(wrapper.get("[data-mobile-system-toggle]").classes()).toEqual(
      expect.arrayContaining(["select-none", "rounded-editorial-sm"])
    );
    expect(wrapper.get('[data-mobile-content-tab="/ai-new"]').classes()).toEqual(
      expect.arrayContaining(["select-none", "rounded-editorial-sm"])
    );

    await wrapper.get("[data-mobile-system-toggle]").trigger("click");
    await flushPromises();

    expect(wrapper.find("[data-mobile-system-drawer]").exists()).toBe(true);

    await wrapper.get('[data-mobile-drawer-link="/settings/view-rules"]').trigger("click");
    await vi.dynamicImportSettled();
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe("/settings/view-rules");
    expect(wrapper.find("[data-mobile-system-drawer]").exists()).toBe(false);
  });

  it("shows logout actions in both desktop and mobile account panels when the current visitor is authenticated", async () => {
    const router = createAppRouter();

    await router.push("/settings/profile");
    await router.isReady();

    const wrapper = mount(App, {
      global: {
        plugins: [Antd, router]
      }
    });

    await flushPromises();

    expect(wrapper.get("[data-shell-logout-form]").attributes("action")).toBe("/logout");
    expect(wrapper.get("[data-shell-logout-form]").attributes("method")).toBe("post");
    expect(wrapper.get("[data-shell-logout-button]").text()).toContain("退出登录");
    expect(wrapper.get("[data-shell-account-username]").text()).toBe("@admin");
    expect(wrapper.get("[data-shell-account-status]").text()).toContain("已登录");
    expect(wrapper.get("[data-shell-account-panel]").text()).not.toContain("系统管理员");
    expect(wrapper.get("[data-shell-account-panel]").text()).not.toContain("admin@example.com");
    expect(wrapper.get("[data-shell-account-actions]").text()).toContain("已登录");
    expect(wrapper.get("[data-shell-account-actions]").text()).toContain("退出登录");

    await wrapper.get("[data-mobile-system-toggle]").trigger("click");
    await flushPromises();

    expect(wrapper.get("[data-mobile-logout-form]").attributes("action")).toBe("/logout");
    expect(wrapper.get("[data-mobile-logout-form]").attributes("method")).toBe("post");
    expect(wrapper.get("[data-mobile-logout-button]").text()).toContain("退出登录");
    expect(wrapper.get("[data-mobile-account-username]").text()).toBe("@admin");
    expect(wrapper.get("[data-mobile-account-status]").text()).toContain("已登录");
    expect(wrapper.get("[data-mobile-account-panel]").text()).not.toContain("系统管理员");
    expect(wrapper.get("[data-mobile-account-actions]").text()).toContain("已登录");
    expect(wrapper.get("[data-mobile-account-actions]").text()).toContain("退出登录");
  });

  it("keeps logout inside the shell by returning system pages to / instead of jumping to /login", async () => {
    const router = createAppRouter();

    await router.push("/settings/profile");
    await router.isReady();

    const wrapper = mount(App, {
      global: {
        plugins: [Antd, router]
      }
    });

    await flushPromises();
    await wrapper.get("[data-shell-logout-form]").trigger("submit");
    await vi.dynamicImportSettled();
    await flushPromises();

    expect(httpMocks.requestJson).toHaveBeenCalledWith("/logout", { method: "POST" });
    expect(router.currentRoute.value.fullPath).toBe("/");
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
    expect(wrapper.get("[data-mobile-login-link]").attributes("href")).toBe("/login");
    expect(wrapper.find('nav[aria-label="系统菜单"]').exists()).toBe(false);
    expect(wrapper.find("[data-mobile-system-toggle]").exists()).toBe(false);
    expect(wrapper.find("[data-mobile-system-drawer]").exists()).toBe(false);
    expect(wrapper.get("[data-mobile-login-link]").text()).toContain("登录");
    expect(wrapper.get("[data-shell-account-panel]").text()).not.toContain("你现在看到的是公开内容");
  });
});
