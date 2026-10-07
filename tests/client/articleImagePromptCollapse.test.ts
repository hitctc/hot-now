import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ArticleShortImagePromptSection from "../../src/client/components/creative/article-detail/ArticleShortImagePromptSection.vue";
import EditablePromptRow from "../../src/client/components/creative/EditablePromptRow.vue";

/** 挂载真实提示词编辑器，只替换组件库外壳，检查折叠不会丢掉编辑草稿。 */
function mountPrompts(direction = "short_content", readonly = false) {
  return mount(ArticleShortImagePromptSection, { attachTo: document.body, props: { direction, readonly, prompts: ["原提示词"] }, global: { stubs: {
    "a-button": { template: "<button><slot /></button>" },
    "a-textarea": { props: ["value"], emits: ["update:value"], template: '<textarea :value="value" @input="$emit(\'update:value\', $event.target.value)" />' },
  } } });
}

afterEach(() => localStorage.clear());

describe("配图提示词折叠", () => {
  it.each(["article", "short_content"])("%s 默认展开并在重开后记住折叠与展开", async (direction) => {
    let wrapper = mountPrompts(direction);
    expect(wrapper.get('[data-image-prompts-content]').isVisible()).toBe(true);
    await wrapper.get('[data-image-prompts-collapse]').trigger("click");
    expect(wrapper.get('[data-image-prompts-content]').isVisible()).toBe(false);
    wrapper.unmount();
    wrapper = mountPrompts(direction);
    expect(wrapper.get('[data-image-prompts-collapse]').text()).toBe("展开");
    await wrapper.get('[data-image-prompts-collapse]').trigger("click");
    wrapper.unmount();
    wrapper = mountPrompts(direction);
    expect(wrapper.get('[data-image-prompts-content]').isVisible()).toBe(true);
    wrapper.unmount();
  });

  it("长短内容独立记忆，只读也可折叠，无提示词不显示空区块", async () => {
    const wrapper = mountPrompts("short_content", true);
    try {
      await wrapper.get('[data-image-prompts-collapse]').trigger("click");
      await wrapper.setProps({ direction: "article" });
      expect(wrapper.get('[data-image-prompts-content]').isVisible()).toBe(true);
      await wrapper.setProps({ direction: "short_content" });
      expect(wrapper.get('[data-image-prompts-content]').isVisible()).toBe(false);
      expect(wrapper.text()).not.toContain("编辑");
      await wrapper.setProps({ prompts: [] });
      expect(wrapper.find("section").exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it("折叠不销毁未保存草稿，展开后仍能保存，原复制和脏状态事件保持", async () => {
    const wrapper = mountPrompts();
    try {
      await wrapper.findAll("button").find(button => button.text() === "复制")!.trigger("click");
      expect(wrapper.emitted("copy")).toEqual([["原提示词"]]);
      await wrapper.findAll("button").find(button => button.text() === "编辑")!.trigger("click");
      await wrapper.get("textarea").setValue("未保存的新提示词");
      await wrapper.get('[data-image-prompts-collapse]').trigger("click");
      await wrapper.get('[data-image-prompts-collapse]').trigger("click");
      expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("未保存的新提示词");
      expect(wrapper.findComponent(EditablePromptRow).exists()).toBe(true);
      await wrapper.findAll("button").find(button => button.text() === "保存")!.trigger("click");
      expect(wrapper.emitted("save")).toEqual([[0, "未保存的新提示词"]]);
      expect(wrapper.emitted("dirty-change")).toContainEqual(["short-0", true]);
    } finally { wrapper.unmount(); }
  });
});
