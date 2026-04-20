import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { describe, expect, it } from "vitest";

import ContentSearchControl from "../../src/client/components/content/ContentSearchControl.vue";

describe("ContentSearchControl", () => {
  it("submits the trimmed keyword when clicking the search button", async () => {
    const wrapper = mount(ContentSearchControl, {
      props: {
        keyword: ""
      },
      global: {
        plugins: [Antd]
      }
    });

    await wrapper.get("[data-content-search-input]").setValue("  agent  ");
    await flushPromises();
    await wrapper.get("[data-content-search-submit]").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("search")?.at(-1)).toEqual(["agent"]);
  });

  it("submits the trimmed keyword when pressing Enter", async () => {
    const wrapper = mount(ContentSearchControl, {
      props: {
        keyword: ""
      },
      global: {
        plugins: [Antd]
      }
    });

    await wrapper.get("[data-content-search-input]").setValue("  workflow  ");
    await flushPromises();
    await wrapper.get("[data-content-search-input]").trigger("keydown.enter");
    await flushPromises();

    expect(wrapper.emitted("search")?.at(-1)).toEqual(["workflow"]);
  });

  it("clears keyword and emits clear when clicking the clear icon", async () => {
    const wrapper = mount(ContentSearchControl, {
      props: {
        keyword: ""
      },
      global: {
        plugins: [Antd]
      }
    });

    await wrapper.get("[data-content-search-input]").setValue("agent");
    await flushPromises();
    expect(wrapper.find("[data-content-search-clear]").exists()).toBe(true);

    await wrapper.get("[data-content-search-clear]").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("clear")).toHaveLength(1);
    expect((wrapper.get("[data-content-search-input]").element as HTMLInputElement).value).toBe("");
    expect(wrapper.find("[data-content-search-clear]").exists()).toBe(false);
  });

  it("keeps the compact mode usable for embedded toolbars", async () => {
    const wrapper = mount(ContentSearchControl, {
      props: {
        keyword: "  agent  ",
        compact: true
      },
      global: {
        plugins: [Antd]
      }
    });

    expect(wrapper.get("[data-content-search-control]").classes()).toContain("w-full");
    expect(wrapper.get("[data-content-search-control]").classes()).toContain("bg-editorial-panel/70");

    await wrapper.get("[data-content-search-submit]").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("search")?.at(-1)).toEqual(["agent"]);
  });
});
