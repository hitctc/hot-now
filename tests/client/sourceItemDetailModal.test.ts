import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import SourceItemDetailModal from "../../src/client/components/creative/SourceItemDetailModal.vue";
import * as api from "../../src/client/services/creativeApi.js";

afterEach(() => vi.restoreAllMocks());

it("弹窗打开期间切换素材编号，迟到的旧响应不会覆盖新素材", async () => {
  let finishFirst!: (value: api.CreativeSourceItem) => void;
  vi.spyOn(api, "readCreativeSourceItem")
    .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
    .mockResolvedValueOnce({ id: 102, title: "第二条素材" } as api.CreativeSourceItem);
  const wrapper = mount(SourceItemDetailModal, {
    props: { visible: false, sourceItemId: 101 },
    global: { stubs: {
      "a-modal": { template: "<div><slot /></div>" }, "a-spin": { template: "<div><slot /></div>" },
      "a-descriptions": true, "a-descriptions-item": true, "a-tag": true,
    } },
  });
  try {
    await wrapper.setProps({ visible: true });
    await wrapper.setProps({ sourceItemId: 102 });
    await flushPromises();
    expect(wrapper.text()).toContain("第二条素材");
    finishFirst({ id: 101, title: "第一条素材" } as api.CreativeSourceItem);
    await flushPromises();
    expect(wrapper.text()).not.toContain("第一条素材");
    expect(api.readCreativeSourceItem).toHaveBeenNthCalledWith(2, 102);
  } finally { wrapper.unmount(); }
});
