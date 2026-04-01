import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { describe, expect, it } from "vitest";

import ContentSourceFilterBar from "../../src/client/components/content/ContentSourceFilterBar.vue";

describe("ContentSourceFilterBar", () => {
  it("emits source selection changes from the filter actions", async () => {
    const wrapper = mount(ContentSourceFilterBar, {
      props: {
        options: [
          { kind: "openai", name: "OpenAI" },
          { kind: "ithome", name: "IT之家" }
        ],
        selectedSourceKinds: ["openai"]
      },
      global: {
        plugins: [Antd]
      }
    });

    await wrapper.get("[data-source-kind='ithome']").setValue(true);
    await flushPromises();

    expect(wrapper.emitted("change")?.at(-1)).toEqual([["openai", "ithome"]]);

    await wrapper.get("[data-content-filter-action='select-all']").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("change")?.at(-1)).toEqual([["openai", "ithome"]]);

    await wrapper.get("[data-content-filter-action='clear-all']").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("change")?.at(-1)).toEqual([[]]);
    expect(wrapper.get("[data-content-source-filter]").classes()).toContain("content-source-filter-card");
  });
});
