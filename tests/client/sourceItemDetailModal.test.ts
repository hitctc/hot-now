import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import SourceItemDetailModal from "../../src/client/components/creative/SourceItemDetailModal.vue";
import * as api from "../../src/client/services/creativeApi.js";

afterEach(() => vi.restoreAllMocks());

it("短素材详情明确选题分并显示完整停止原因，不展示爆文分", async () => {
  vi.spyOn(api, "readCreativeSourceItem").mockResolvedValue({ id: 1, title: "素材", direction: "short_content", score: 62, trendScore: 99, writingStatus: "skipped", writingStopReason: "选题分62＜75；缺少关键事实" } as api.CreativeSourceItem);
  const wrapper = mount(SourceItemDetailModal, { props: { visible: false, sourceItemId: 1 }, global: { stubs: {
    "a-modal": { template: "<div><slot /></div>" }, "a-spin": { template: "<div><slot /></div>" }, "a-descriptions": { template: "<div><slot /></div>" }, "a-descriptions-item": { props: ["label"], template: "<div>{{label}}<slot /></div>" }, "a-tag": true,
  } } });
  try {
    await wrapper.setProps({ visible: true });
    await flushPromises();
    expect(wrapper.text()).toContain("短内容选题分");
    expect(wrapper.text()).toContain("缺少关键事实");
    expect(wrapper.text()).not.toContain("爆文分");
  } finally { wrapper.unmount(); }
});

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
