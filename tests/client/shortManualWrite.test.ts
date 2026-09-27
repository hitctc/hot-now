import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

import ShortSourceItemsPage from "../../src/client/pages/creative/ShortSourceItemsPage.vue";
import SourceItemsFilterBar from "../../src/client/components/creative/source-items/SourceItemsFilterBar.vue";
import * as creativeApi from "../../src/client/services/creativeApi.js";

afterEach(() => vi.restoreAllMocks());

describe("短内容素材自定义写作", () => {
  it("提交短内容方向和短写形态，不再发送长文写作模式", async () => {
    vi.spyOn(creativeApi, "readCreativeSourceItems").mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 30 } as never);
    const submit = vi.spyOn(creativeApi, "submitManualWrite").mockResolvedValue({ ok: true, sourceItemId: 15 });
    const wrapper = mount(ShortSourceItemsPage, {
      global: {
        stubs: {
          SourceItemsFilterBar: true,
          SourceItemsTable: true,
          ArticleDetailDrawer: true,
          "a-modal": {
            props: ["open"],
            emits: ["ok"],
            template: '<div v-if="open"><slot /><button data-testid="submit-short" @click="$emit(\'ok\')">提交</button></div>',
          },
          "a-radio-group": { template: "<div><slot /></div>" },
          "a-radio": true,
          "a-radio-button": true,
          "a-input": true,
          "a-textarea": {
            emits: ["update:value"],
            template: '<textarea data-testid="short-input" @input="$emit(\'update:value\', $event.target.value)" />',
          },
        },
      },
    });
    await flushPromises();
    wrapper.findComponent(SourceItemsFilterBar).vm.$emit("manual-write");
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="short-input"]').setValue("用户输入的短内容原文");
    await wrapper.get('[data-testid="submit-short"]').trigger("click");
    await flushPromises();

    expect(submit).toHaveBeenCalledWith({
      title: undefined,
      content: "用户输入的短内容原文",
      contentType: "viewpoint",
      direction: "short_content",
      form: "auto",
      thesis: undefined,
    });
    wrapper.unmount();
  });
});
