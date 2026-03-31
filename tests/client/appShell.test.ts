import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Antd from "ant-design-vue";

import { APP_ROUTE_BASE, CLIENT_ASSET_BASE } from "../../src/client/appBases";
import App from "../../src/client/App.vue";
import { createAppRouter } from "../../src/client/router";

describe("client app shell", () => {
  it("renders the system shell and the view-rules route", async () => {
    const router = createAppRouter();

    await router.push("/settings/view-rules");
    await router.isReady();

    const wrapper = mount(App, {
      global: {
        plugins: [Antd, router]
      }
    });

    expect(wrapper.text()).toContain("HotNow 系统页");
    expect(wrapper.text()).toContain("筛选策略工作台");
    expect(wrapper.get("[data-shell-nav='view-rules']").text()).toContain("筛选策略");
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
