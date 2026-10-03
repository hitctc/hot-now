import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContentFeedPageController } from "../../src/client/components/content/useContentFeedPageController";
import type { ContentFeedPageConfig } from "../../src/client/components/content/contentFeedPageShared";
import type { ContentPageModel } from "../../src/client/services/contentApi";

vi.mock("vue-router", () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ replace: vi.fn() }) }));

/** 用最小合成页面响应观察当前结果，不访问网络或业务数据库。 */
function model(id: number): ContentPageModel {
  return { cards: [{ id, title: `card-${id}` }], pagination: { page: 1, pageSize: 50, totalResults: 1, totalPages: 1 } } as ContentPageModel;
}

/** 挂载真实页面控制器；受控请求只替换外部读取边界。 */
function host() {
  const pending: Array<{ resolve: (value: ContentPageModel) => void; reject: (error: Error) => void }> = [];
  const readPage = () => new Promise<ContentPageModel>((resolve, reject) => pending.push({ resolve, reject }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const wrapper = mount(defineComponent({
    setup: () => useContentFeedPageController({ readPage, config: { pageKey: "ai-new", loadErrorMessage: "failed" } as ContentFeedPageConfig }),
    template: "<div />",
  }));
  return { wrapper, pending };
}

afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

describe("content feed request identity", () => {
  it("keeps the last selected sort result when the initial response arrives late", async () => {
    const { wrapper, pending } = host();
    const current = wrapper.vm.handleSortModeChange("content_score");
    await flushPromises();
    pending[1]!.resolve(model(2));
    await current;
    pending[0]!.resolve(model(1));
    await flushPromises();
    expect(wrapper.vm.pageModel?.cards.map(card => card.id)).toEqual([2]);
    expect(wrapper.vm.isLoading).toBe(false);
    wrapper.unmount();
  });

  it("does not let an old failure clear the current loading state or show an error", async () => {
    const { wrapper, pending } = host();
    const current = wrapper.vm.handleSortModeChange("content_score");
    await flushPromises();
    pending[0]!.reject(new Error("old failure"));
    await flushPromises();
    expect(wrapper.vm.hasLoadError).toBe(false);
    expect(wrapper.vm.isRefreshing).toBe(true);
    pending[1]!.resolve(model(2));
    await current;
    expect(wrapper.vm.isRefreshing).toBe(false);
    expect(wrapper.vm.isLoading).toBe(false);
    wrapper.unmount();
  });

  it("does not populate state after unmount", async () => {
    const { wrapper, pending } = host();
    const state = wrapper.vm;
    wrapper.unmount();
    pending[0]!.resolve(model(1));
    await flushPromises();
    expect(state.pageModel).toBeNull();
  });
});
