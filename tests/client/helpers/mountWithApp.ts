import { mount, type MountingOptions } from "@vue/test-utils";
import Antd, { ConfigProvider } from "ant-design-vue";
import { defineComponent, h, type Component } from "vue";

import { createEditorialProviderTheme } from "../../../src/client/theme/editorialTheme";

// 客户端页面测试统一包一层 ConfigProvider，避免每个测试各自补 AntD 上下文导致 prefixCls 注入不稳定。
export function mountWithApp(component: Component, options: MountingOptions<unknown> = {}) {
  const { global, props, slots, ...restOptions } = options;
  const RootHost = defineComponent({
    name: "MountWithAppHost",
    setup() {
      return () =>
        h(
          ConfigProvider,
          { theme: createEditorialProviderTheme("dark") },
          {
            default: () => h(component as never, props ?? {}, slots ?? {})
          }
        );
    }
  });

  return mount(RootHost, {
    attachTo: document.body,
    ...restOptions,
    global: {
      ...global,
      plugins: [Antd, ...(global?.plugins ?? [])],
      renderStubDefaultSlot: true,
      stubs: {
        transition: false,
        teleport: true,
        ...(global?.stubs ?? {})
      }
    }
  });
}
