import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import OperationCapabilityBadge from "../../src/client/components/creative/OperationCapabilityBadge.vue";

describe("生成操作能力标记", () => {
  for (const capability of ["model", "local"] as const) {
    it(`${capability} 使用简短标记，并说明是否消耗额度`, () => {
      const wrapper = mount(OperationCapabilityBadge, { props: { capability }, global: { stubs: { "a-tooltip": { props: ["title", "trigger"], template: '<span :data-tip="title"><slot /></span>' } } } });
      expect(wrapper.text()).toBe(capability === "model" ? "模型" : "本地");
      expect(wrapper.attributes("data-tip")).toBe(capability === "model" ? "消耗模型额度" : "不调用模型");
      expect(wrapper.find(`[data-operation-capability="${capability}"]`).exists()).toBe(true);
      wrapper.unmount();
    });
  }

  it("代码制图标记本地，标题导语标签与模型图片标记模型，常规保存不标记", () => {
    const read = (file: string) => readFileSync(resolve(process.cwd(), "src/client/components/creative", file), "utf8");
    expect(read("article-detail/CodeImageCardsSection.vue")).toContain('<OperationCapabilityBadge capability="local" />');
    expect(read("article-detail/ArticlePlanningSections.vue").match(/<OperationCapabilityBadge capability="model"/g)).toHaveLength(3);
    expect(read("article-detail/ArticleImageWorkflowSections.vue").match(/<OperationCapabilityBadge capability="model"/g)).toHaveLength(4);
    expect(read("article-detail/ArticleDetailFooter.vue")).not.toContain("OperationCapabilityBadge");
  });
});
