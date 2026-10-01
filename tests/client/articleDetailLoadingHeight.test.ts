import { flushPromises, shallowMount } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import ArticleDetailDrawer from "../../src/client/components/creative/ArticleDetailDrawer.vue";
import * as viewportModule from "../../src/client/components/creative/article-detail/useArticleEditorViewport.js";
import type { CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";

const article = {
  id: 42,
  status: "ready_for_publish",
  originType: "article",
  direction: "article",
  titles: '["测试标题"]',
  contentMarkdown: "AI 正文",
  humanMarkdown: "人工正文",
  imagesJson: null,
  coverImage: [],
  stepTrace: [],
} as unknown as CreativeFinishedArticle;

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

/** 加载弹窗先打开、正文后到达时仍要完成高度测量，否则编辑器停留在默认高度。 */
it("加载态先打开、正文后到达时重新测量正文高度", async () => {
  const original = viewportModule.useArticleEditorViewport;
  let viewport!: ReturnType<typeof original>;
  vi.spyOn(viewportModule, "useArticleEditorViewport").mockImplementation(() => (viewport = original()));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const wrapper = shallowMount(ArticleDetailDrawer, {
    props: { open: false, loading: false, article: null, readonly: true },
    global: {
      stubs: {
        // 只有正文区需要真实渲染，其余子组件用桩隔离，避免夹具缺字段造成无关崩溃。
        "a-modal": {
          template: '<div class="ant-modal-body" style="padding:24px"><slot name="title" /><slot /><slot name="footer" /></div>',
          mounted() { Object.defineProperty(this.$el, "clientHeight", { value: 1000 }); },
        },
        "a-spin": true,
      },
    },
  });
  try {
    await wrapper.setProps({ open: true, loading: true });
    await flushPromises();
    await wrapper.setProps({ loading: false, article });
    await flushPromises();
    // 正文到达后应完成测量，而不是停在 composable 的 400px 默认值。
    expect(viewport.dynamicEditorHeight.value).toBe(912);
  } finally { wrapper.unmount(); }
});
