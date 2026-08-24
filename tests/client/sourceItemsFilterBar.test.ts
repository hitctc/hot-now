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

  it("hides clear-filter action when no filters are active", () => {
    const wrapper = mount(SourceItemsFilterBar, {
      props: { ...baseProps, hasActiveFilters: false },
      global: { plugins: [Antd] },
    });

    expect(wrapper.find("[data-source-items-filter-action='clear-filters']").exists()).toBe(false);
  });
});
