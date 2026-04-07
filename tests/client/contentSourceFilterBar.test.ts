import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { describe, expect, it } from "vitest";

import ContentSourceFilterBar from "../../src/client/components/content/ContentSourceFilterBar.vue";

function normalizeButtonText(value: string): string {
  return value.replace(/\s+/g, "");
}

describe("ContentSourceFilterBar", () => {
  it("uses a single toggle button for select-all and clear-all", async () => {
    const wrapper = mount(ContentSourceFilterBar, {
      props: {
        options: [
          { kind: "openai", name: "OpenAI", currentPageVisibleCount: 3 },
          { kind: "ithome", name: "IT之家", currentPageVisibleCount: 1 }
        ],
        selectedSourceKinds: ["openai"],
        visibleResultCount: 3
      },
      global: {
        plugins: [Antd]
      }
    });

    await wrapper.get("[data-source-kind='ithome']").setValue(true);
    await flushPromises();

    expect(wrapper.emitted("change")?.at(-1)).toEqual([["openai", "ithome"]]);
    expect(wrapper.text()).toContain("来源筛选");
    expect(wrapper.text()).toContain("已选 1 / 2 · 共 3 条");

    const toggleAllButton = wrapper.get("[data-content-filter-action='toggle-all']");

    expect(normalizeButtonText(toggleAllButton.text())).toBe("全选");

    await toggleAllButton.trigger("click");
    await flushPromises();

    expect(wrapper.emitted("change")?.at(-1)).toEqual([["openai", "ithome"]]);

    await wrapper.setProps({
      selectedSourceKinds: ["openai", "ithome"]
    });
    await flushPromises();

    expect(normalizeButtonText(wrapper.get("[data-content-filter-action='toggle-all']").text())).toBe("全不选");

    await wrapper.get("[data-content-filter-action='toggle-all']").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("change")?.at(-1)).toEqual([[]]);
    expect(wrapper.text()).toContain("已选 2 / 2 · 共 3 条");
    expect(wrapper.get("[data-content-source-filter]").classes()).toEqual(
      expect.arrayContaining(["rounded-editorial-md", "border", "border-editorial-border", "bg-editorial-panel"])
    );
    expect(wrapper.get("[data-source-option='openai']").classes()).toEqual(
      expect.arrayContaining([
        "select-none",
        "bg-editorial-link-active",
        "text-editorial-text-main",
        "rounded-editorial-sm"
      ])
    );
  });

  it("keeps the compact embedded layout usable without changing the toggle behavior", async () => {
    const wrapper = mount(ContentSourceFilterBar, {
      props: {
        options: [
          { kind: "openai", name: "OpenAI", currentPageVisibleCount: 3 },
          { kind: "ithome", name: "IT之家", currentPageVisibleCount: 1 }
        ],
        selectedSourceKinds: ["openai"],
        visibleResultCount: 3,
        compact: true
      },
      global: {
        plugins: [Antd]
      }
    });

    expect(wrapper.get("[data-content-source-filter]").classes()).not.toContain("bg-editorial-panel");
    expect(wrapper.get("[data-content-source-filter]").classes()).not.toContain("border");
    expect(wrapper.text()).toContain("来源筛选");
    expect(wrapper.text()).toContain("已选 1 / 2 · 共 3 条");

    await wrapper.get("[data-content-filter-action='toggle-all']").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("change")?.at(-1)).toEqual([["openai", "ithome"]]);
  });
});
