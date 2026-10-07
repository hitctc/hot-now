import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFinishedArticlesQuery } from "../../src/client/components/creative/finished-articles/useFinishedArticlesQuery";
import { useFinishedArticleDetail } from "../../src/client/components/creative/finished-articles/useFinishedArticleDetail";
import { readCreativeFinishedArticles, readCreativeFinishedArticle, type CreativeFinishedArticle } from "../../src/client/services/creativeListApi";
import { message } from "ant-design-vue";
vi.mock("../../src/client/services/creativeListApi", () => ({ readCreativeFinishedArticles: vi.fn(), readCreativeFinishedArticle: vi.fn() }));

/** 挂载真实查询生命周期，只暴露测试持有的引用，不替换Vue调度或取消守卫。 */
function queryHarness(direction: "article" | "short_content") {
  let state!: ReturnType<typeof useFinishedArticlesQuery>;
  const wrapper = mount(defineComponent({ setup() { state = useFinishedArticlesQuery(direction); return () => null; } }));
  return { state, wrapper };
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.mocked(readCreativeFinishedArticles).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 30, dayCounts: [], sourceDayCounts: [] }); });

describe("finished page query ownership", () => {
  it("reads only the final same-tick filter snapshot and retains each direction's storage", async () => {
    const { state, wrapper } = queryHarness("short_content");
    await flushPromises();
    vi.mocked(readCreativeFinishedArticles).mockClear();
    state.currentPage.value = 8;
    state.statusFilter.value = "ready_for_publish";
    state.publishableOnly.value = true;
    state.showDeleted.value = true;
    await nextTick(); await flushPromises();
    expect(readCreativeFinishedArticles).toHaveBeenCalledTimes(1);
    expect(readCreativeFinishedArticles).toHaveBeenCalledWith(expect.objectContaining({ direction: "short_content", page: 1, pageSize: 30, status: "ready_for_publish", publishable: "1", includeDeleted: "1" }));
    expect(JSON.parse(localStorage.getItem("creative-short-finished-filters")!)).toEqual({ search: "", status: "ready_for_publish", publishableOnly: true, showDeleted: true });
    expect(localStorage.getItem("creative-finished-filters")).toBeNull();
    wrapper.unmount();
  });

  it("does not let an old response replace current list/day counts or clear its loading", async () => {
    let first!: (value: any) => void, second!: (value: any) => void;
    vi.mocked(readCreativeFinishedArticles).mockImplementationOnce(() => new Promise(resolve => { first = resolve; })).mockImplementationOnce(() => new Promise(resolve => { second = resolve; }));
    const { state, wrapper } = queryHarness("article");
    const current = state.loadItems();
    first({ items: [{ id: 1 }], total: 1, dayCounts: [], sourceDayCounts: [] });
    await flushPromises();
    expect(state.items.value).toEqual([]); expect(state.isLoading.value).toBe(true);
    second({ items: [{ id: 2 }], total: 2, dayCounts: [{ dayKey: "today", articleCount: 2 }], sourceDayCounts: [] });
    await current;
    expect(state.items.value[0]?.id).toBe(2); expect(state.dayCounts.value.today?.articleCount).toBe(2);
    expect(state.isLoading.value).toBe(false);
    wrapper.unmount();
  });

  it("late saved notification cannot cancel a pending detail click or leave permanent loading", async () => {
    let resolve!: (value: any) => void;
    vi.mocked(readCreativeFinishedArticle).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    let state!: ReturnType<typeof useFinishedArticleDetail>;
    const refresh = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(defineComponent({ setup() { state = useFinishedArticleDetail(refresh); return () => null; } }));
    try {
      const pending = state.openDetail({ id: 3 } as any);
      await state.onDetailSaved();
      resolve({ id: 3 }); await pending;
      expect(state.detailArticle.value?.id).toBe(3);
      expect(state.detailLoading.value).toBe(false);
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally { wrapper.unmount(); }
  });

  it.each(["close", "switch"])("push count ignores a late read after %s", async (action) => {
    let resolve!: (value: CreativeFinishedArticle) => void;
    vi.mocked(readCreativeFinishedArticle).mockResolvedValueOnce({ id: 1, pushCount: 0 } as CreativeFinishedArticle);
    let state!: ReturnType<typeof useFinishedArticleDetail>;
    const wrapper = mount(defineComponent({ setup() { state = useFinishedArticleDetail(vi.fn()); return () => null; } }));
    try {
      await state.openDetail({ id: 1 });
      const old = state.detailArticle.value!;
      vi.mocked(readCreativeFinishedArticle).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
      const pending = state.refreshPushCount(1);
      state.closeDetail();
      if (action === "switch") {
        vi.mocked(readCreativeFinishedArticle).mockResolvedValueOnce({ id: 2, pushCount: 4 } as CreativeFinishedArticle);
        await state.openDetail({ id: 2 });
      }
      resolve({ id: 1, pushCount: 1 } as CreativeFinishedArticle);
      await pending;
      expect(old.pushCount).toBe(0);
      expect(state.detailArticle.value?.pushCount ?? null).toBe(action === "switch" ? 4 : null);
    } finally { wrapper.unmount(); }
  });

  it("failed count refresh retains the last known count and warns without treating push as failed", async () => {
    const warn = vi.spyOn(message, "warning").mockImplementation(() => undefined as any);
    let state!: ReturnType<typeof useFinishedArticleDetail>;
    const wrapper = mount(defineComponent({ setup() { state = useFinishedArticleDetail(vi.fn()); return () => null; } }));
    try {
      vi.mocked(readCreativeFinishedArticle).mockResolvedValueOnce({ id: 1, pushCount: 2 } as CreativeFinishedArticle);
      await state.openDetail({ id: 1 });
      vi.mocked(readCreativeFinishedArticle).mockRejectedValueOnce(new Error("网络失败"));
      await state.refreshPushCount(1);
      expect(state.detailArticle.value?.pushCount).toBe(2);
      expect(warn).toHaveBeenCalledWith("推送已成功，但次数刷新失败，请重新打开详情查看");
    } finally { wrapper.unmount(); warn.mockRestore(); }
  });

  it("invalidates pending detail on close and on unload without replaying an action", async () => {
    let resolve!: (value: any) => void;
    vi.mocked(readCreativeFinishedArticle).mockImplementation(() => new Promise(done => { resolve = done; }));
    let state!: ReturnType<typeof useFinishedArticleDetail>;
    const wrapper = mount(defineComponent({ setup() { state = useFinishedArticleDetail(vi.fn().mockResolvedValue(undefined)); return () => null; } }));
    const pending = state.openDetail({ id: 1 } as any);
    expect(state.detailLoading.value).toBe(true);
    state.closeDetail(); resolve({ id: 1 }); await pending;
    expect(state.detailArticle.value).toBeNull(); expect(state.detailLoading.value).toBe(false);
    const next = state.openDetail({ id: 2 } as any); wrapper.unmount(); resolve({ id: 2 }); await next;
    expect(state.detailArticle.value).toBeNull();
    expect(readCreativeFinishedArticle).toHaveBeenCalledTimes(2);
  });
});
