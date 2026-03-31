import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import Antd from "ant-design-vue";

import { APP_ROUTE_BASE, CLIENT_ASSET_BASE } from "../../src/client/appBases";
import App from "../../src/client/App.vue";
import { createAppRouter, shellPageMetas } from "../../src/client/router";

vi.mock("../../src/client/services/settingsApi", () => ({
  readSettingsProfile: vi.fn().mockResolvedValue({
    username: "admin",
    displayName: "系统管理员",
    role: "admin",
    email: "admin@example.com",
    loggedIn: true
  }),
  readSettingsViewRules: vi.fn(),
  readSettingsSources: vi.fn()
}));

describe("client app shell", () => {
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

    expect(wrapper.text()).toContain("系统页前端底座");
    expect(wrapper.text()).toContain("当前登录用户页");
    expect(wrapper.text()).toContain("当前会展示登录用户摘要和会话上下文");
    expect(wrapper.find("[data-shell-page-title]").text()).toBe("当前登录用户页");
    expect(wrapper.find("[data-shell-page-description]").text()).toContain("登录用户摘要");
    expect(wrapper.find("[data-shell-theme-toggle]").exists()).toBe(true);

    for (const page of shellPageMetas) {
      const navLink = wrapper.get(`[data-shell-nav='${page.key}']`);
      expect(navLink.text()).toContain(page.navLabel);
    }
  });

  it("keeps the /client/ asset base separate from the /settings/ route base", async () => {
    const router = createAppRouter();

    await router.push("/settings/profile");
    await router.isReady();

    expect(CLIENT_ASSET_BASE).toBe("/client/");
    expect(APP_ROUTE_BASE).toBe("/");
    expect(router.currentRoute.value.fullPath).toBe("/settings/profile");
    expect(router.resolve("/settings/profile").href).toBe("/settings/profile");
    expect(router.getRoutes().some((route) => route.path === "/client/settings/profile")).toBe(false);
  });
});
