import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { describe, expect, it } from "vitest";

import ContentToolbarCard from "../../src/client/components/content/ContentToolbarCard.vue";

describe("ContentToolbarCard", () => {
  it("starts collapsed and keeps the source panel open after selection changes", async () => {
    const wrapper = mount(ContentToolbarCard, {
      props: {
        options: [
          { kind: "openai", name: "OpenAI", currentPageVisibleCount: 3 },
          { kind: "ithome", name: "IT之家", currentPageVisibleCount: 1 },
          { kind: "36kr", name: "36氪", currentPageVisibleCount: 2 }
        ],
        selectedSourceKinds: [],
        visibleResultCount: 7,
        sortMode: "published_at",
        keyword: ""
      },
      global: {
        plugins: [Antd]
      }
    });

    expect(wrapper.get("[data-content-toolbar-card]").classes()).toEqual(
      expect.arrayContaining([
        "editorial-spotlight-card",
        "rounded-editorial-lg",
        "sm:rounded-editorial-xl",
        "px-3",
        "py-2",
        "sm:px-5",
        "sm:py-5",
        "border",
        "border-editorial-border-strong"
      ])
    );
    expect(wrapper.findAll("[data-content-toolbar-main-row]").length).toBe(1);
    const mainRow = wrapper.get("[data-content-toolbar-main-row]");
    expect(wrapper.find("[data-content-toolbar-stage]").exists()).toBe(true);
    expect(wrapper.get("[data-content-toolbar-stage]").classes()).toEqual(expect.arrayContaining(["hidden", "sm:flex"]));
    expect(mainRow.find("[data-content-toolbar-summary]").exists()).toBe(true);
    expect(mainRow.find("[data-content-sort-control]").exists()).toBe(true);
    expect(mainRow.find("[data-content-search-control]").exists()).toBe(true);
    expect(wrapper.get("[data-content-toolbar-summary]").classes()).toEqual(
      expect.arrayContaining(["items-center", "py-2", "sm:flex-col", "sm:py-3"])
    );
    expect(wrapper.get("[data-content-toolbar-mobile-controls]").classes()).toEqual(
      expect.arrayContaining(["grid", "sm:hidden"])
    );
    expect(wrapper.get("[data-content-toolbar-summary]").text()).toContain("来源：未选择");
    expect(wrapper.get("[data-content-toolbar-summary]").attributes("aria-expanded")).toBe("false");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("展开来源");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").attributes("aria-expanded")).toBe("false");
    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("none");
    expect(wrapper.get("[data-content-sort-control]").classes()).toContain("bg-editorial-panel/70");
    expect(wrapper.get("[data-content-search-control]").classes()).toContain("w-full");

    await wrapper.get("[data-content-toolbar-summary]").trigger("click");
    await flushPromises();

    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("收起来源");
    expect(wrapper.get("[data-content-toolbar-summary]").attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").attributes("aria-expanded")).toBe("true");

    await wrapper.get("[data-content-toolbar-source-toggle]").trigger("click");
    await flushPromises();

    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("none");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("展开来源");
    expect(wrapper.get("[data-content-toolbar-summary]").attributes("aria-expanded")).toBe("false");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").attributes("aria-expanded")).toBe("false");

    await wrapper.get("[data-content-toolbar-summary]").trigger("click");
    await flushPromises();

    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("收起来源");

    await wrapper.get("[data-content-sort-mode='content_score']").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("changeSort")?.at(-1)).toEqual(["content_score"]);

    await wrapper.get("[data-content-search-input]").setValue("  agent  ");
    await flushPromises();
    await wrapper.get("[data-content-search-submit]").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("search")?.at(-1)).toEqual(["agent"]);

    await wrapper.get("[data-source-kind='openai']").setValue(true);
    await flushPromises();
    expect(wrapper.emitted("changeSource")?.at(-1)).toEqual([["openai"]]);
    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("");

    await wrapper.setProps({
      selectedSourceKinds: ["openai"]
    });
    await flushPromises();

    expect(wrapper.get("[data-content-toolbar-summary]").text()).toContain("来源：OpenAI");
    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("");

    await wrapper.setProps({
      selectedSourceKinds: ["openai", "ithome", "36kr"]
    });
    await flushPromises();

    expect(wrapper.get("[data-content-toolbar-summary]").text()).toContain("来源：OpenAI、IT之家 +1");
    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("收起来源");
  });
});
