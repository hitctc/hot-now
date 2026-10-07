import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ArticleDetailFooter from "../../src/client/components/creative/article-detail/ArticleDetailFooter.vue";
import type { CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";

/** 隔离视觉控件，验证共用底栏次数文案、禁用门禁及原推送事件。 */
function mountFooter(pushCount: number, canPush = true) {
  return mount(ArticleDetailFooter, {
    props: {
      article: { id: 1, status: "ready_for_publish", pushCount } as CreativeFinishedArticle,
      saving: false, wechatCopying: false, canPush, missingConditions: ["缺少封面"],
    },
    global: { stubs: {
      "a-button": { template: '<button v-bind="$attrs"><slot /></button>' },
      "a-tooltip": { template: "<span><slot /></span>" },
    } },
  });
}

describe("详情推送次数", () => {
  it.each([0, 1, 2])("可推送按钮显示服务端已有%s次，点击不自行增加", async (count) => {
    const wrapper = mountFooter(count);
    try {
      const button = wrapper.findAll("button").find(candidate => candidate.text().startsWith("推送草稿箱"))!;
      const label = count > 0 ? `推送草稿箱（${count}次）` : "推送草稿箱";
      expect(button.text()).toBe(label);
      await button.trigger("click");
      expect(wrapper.emitted("push")).toEqual([[]]);
      expect(button.text()).toBe(label);
      await wrapper.setProps({ article: { ...wrapper.props("article"), pushCount: count + 1 } });
      expect(button.text()).toBe(`推送草稿箱（${count + 1}次）`);
    } finally { wrapper.unmount(); }
  });

  it("禁用时仍显示次数，但不能触发推送；只读不展示底栏", async () => {
    const wrapper = mountFooter(2, false);
    try {
      const button = wrapper.findAll("button").find(candidate => candidate.text() === "推送草稿箱（2次）")!;
      expect(button.attributes("disabled")).toBeDefined();
      await button.trigger("click");
      expect(wrapper.emitted("push")).toBeUndefined();
      await wrapper.setProps({ readonly: true });
      expect(wrapper.find("button").exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });
});
