import { flushPromises, mount } from "@vue/test-utils";
import { nextTick, type Component } from "vue";
import { describe, expect, it, vi } from "vitest";
import LazyArticleDetailDrawer from "../../src/client/components/creative/LazyArticleDetailDrawer.vue";
import LazySourceItemDetailModal from "../../src/client/components/creative/LazySourceItemDetailModal.vue";
import DetailModuleLoading from "../../src/client/components/creative/DetailModuleLoading.vue";

// 保持首次模块下载未完成，稳定捕获仅在刷新后第一次打开时出现的中间画面。
vi.mock("../../src/client/components/creative/ArticleDetailDrawer.vue", () => new Promise(() => {}));
vi.mock("../../src/client/components/creative/SourceItemDetailModal.vue", () => new Promise(() => {}));

describe("详情组件首次下载期间的弹窗外壳", () => {
  it.each<{ name: string; component: Component; props: Record<string, unknown>; event: string; closed: Record<string, unknown>; wrapClass: string; zIndex: string }>([
    { name: "文章", component: LazyArticleDetailDrawer, props: { open: true, article: null }, event: "update:open", closed: { open: false }, wrapClass: "article-detail-modal", zIndex: "1000" },
    { name: "素材", component: LazySourceItemDetailModal, props: { visible: true, sourceItemId: 42 }, event: "update:visible", closed: { visible: false }, wrapClass: "source-item-detail-modal", zIndex: "1950" },
  ])("$name下载等待时使用正式弹窗外壳，并可立即关闭", async ({ component, props, event, closed, wrapClass, zIndex }) => {
    const wrapper = mount(component, {
      props,
      attachTo: document.body,
      global: { stubs: { transition: false, "transition-group": false } },
    });
    try {
      await flushPromises();
      const dialog = document.querySelector<HTMLElement>(`.${wrapClass}`);
      expect(dialog, "下载期间不应只显示一层透明背景和裸露文字").not.toBeNull();
      expect(dialog!.style.zIndex).toBe(zIndex);
      expect(dialog!.querySelector(".ant-modal-content")).not.toBeNull();
      expect(dialog!.querySelector('[role="status"]')?.textContent).toContain("正在加载");
      expect(document.querySelector('[class*="ant-zoom"], [class*="ant-fade"]')).toBeNull();
      dialog!.querySelector<HTMLButtonElement>(".ant-modal-close")!.click();
      await nextTick();
      expect(wrapper.emitted(event)).toEqual([[false]]);
      await wrapper.setProps(closed);
      await flushPromises();
      expect(document.querySelector<HTMLElement>(`.${wrapClass}`)?.style.display ?? "none").toBe("none");
      expect(document.querySelector<HTMLElement>(".ant-modal-mask")?.style.display ?? "none").toBe("none");
      await wrapper.setProps(props);
      await flushPromises();
      expect(document.querySelector(`.${wrapClass} [role="status"]`)).not.toBeNull();
    } finally { wrapper.unmount(); }
  });

  it("下载失败在同一外壳中提示，不自动重试且仍可关闭", async () => {
    const wrapper = mount(DetailModuleLoading, { props: { open: true, kind: "article", error: true }, attachTo: document.body });
    try {
      await flushPromises();
      const dialog = document.querySelector(".article-detail-modal")!;
      expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("加载失败");
      expect(wrapper.emitted("retry")).toBeUndefined();
      dialog.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
      expect(wrapper.emitted("retry")).toEqual([[]]);
      dialog.querySelector<HTMLButtonElement>(".ant-modal-close")!.click();
      expect(wrapper.emitted("close")).toEqual([[]]);
    } finally { wrapper.unmount(); }
  });
});
