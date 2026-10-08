import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { describe, expect, it } from "vitest";

import SourceItemsFilterBar from "../../src/client/components/creative/source-items/SourceItemsFilterBar.vue";

const baseProps = {
  mode: "article" as const,
  writingStatusFilter: undefined,
  writingStatusOptions: [{ label: "全部", value: "" }],
  accountFitFilter: undefined,
  accountFitOptions: [{ label: "全部适配度", value: "" }],
  sourceNameFilter: "",
  writableOnly: false,
  minTrendScore: null,
  searchText: "",
  searchHistory: [],
  isLoading: false,
  hasActiveFilters: true,
};

describe("SourceItemsFilterBar", () => {
  it("短素材不展示爆文分筛选，长素材仍保留", () => {
    const wrapper = mount(SourceItemsFilterBar, { props: { ...baseProps, mode: "short_content" }, global: { plugins: [Antd] } });
    expect(wrapper.text()).not.toContain("爆文分");
    wrapper.unmount();
    const long = mount(SourceItemsFilterBar, { props: baseProps, global: { plugins: [Antd] } });
    expect(long.text()).toContain("爆文分");
    long.unmount();
  });
  it("provides refresh and clear-filter actions for stale list state", async () => {
    const wrapper = mount(SourceItemsFilterBar, {
      props: baseProps,
      global: { plugins: [Antd] },
    });

    await wrapper.get("[data-source-items-filter-action='refresh']").trigger("click");
    await wrapper.get("[data-source-items-filter-action='clear-filters']").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("refresh")).toHaveLength(1);
    expect(wrapper.emitted("clear-filters")).toHaveLength(1);
  });

  it("uses the default button height consistently for all filter actions", () => {
    const wrapper = mount(SourceItemsFilterBar, {
      props: baseProps,
      global: { plugins: [Antd] },
    });
    const actions = wrapper.findAll("[data-source-items-filter-action]");

    expect(actions).toHaveLength(4);
    for (const action of actions) expect(action.classes()).not.toContain("ant-btn-sm");
    wrapper.unmount();
  });

  it("hides clear-filter action when no filters are active", () => {
    const wrapper = mount(SourceItemsFilterBar, {
      props: { ...baseProps, hasActiveFilters: false },
      global: { plugins: [Antd] },
    });

    expect(wrapper.find("[data-source-items-filter-action='clear-filters']").exists()).toBe(false);
  });
});
