import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { Modal } from "ant-design-vue";
import { describe, expect, it } from "vitest";

describe("成品详情的无动画弹窗配置", () => {
  it("真实组件打开即可关闭、关闭即可重开，不等待动画计时器且不残留可见遮罩", async () => {
    const open = ref(true);
    const wrapper = mount(defineComponent({
      /** 只模拟父页开关，使用真实Modal及焦点/遮罩生命周期，不替换过渡实现。 */
      setup() {
        return () => h(Modal, {
          open: open.value,
          destroyOnClose: true,
          transitionName: "",
          maskTransitionName: "",
          onCancel: () => { open.value = false; },
        }, { default: () => h("button", { "data-detail-body": "" }, "详情正文") });
      },
    }), { attachTo: document.body, global: { stubs: { transition: false, "transition-group": false } } });
    try {
      await nextTick();
      for (let round = 0; round < 3; round++) {
        const dialog = document.querySelector<HTMLElement>(".ant-modal-wrap")!;
        expect(dialog.style.display).not.toBe("none");
        expect(document.querySelector('[class*="ant-zoom"], [class*="ant-fade"]')).toBeNull();
        document.querySelector<HTMLButtonElement>(".ant-modal-close")!.click();
        await nextTick();
        expect(open.value).toBe(false);
        expect(document.querySelector<HTMLElement>(".ant-modal-wrap")?.style.display ?? "none").toBe("none");
        expect(document.querySelector<HTMLElement>(".ant-modal-mask")?.style.display ?? "none").toBe("none");
        open.value = true;
        await nextTick();
        const reopened = document.querySelector<HTMLElement>(".ant-modal-wrap");
        expect(reopened).not.toBeNull();
        expect(reopened!.style.display).not.toBe("none");
        expect(document.querySelector("[data-detail-body]")).not.toBeNull();
      }
    } finally { wrapper.unmount(); }
  });
});
