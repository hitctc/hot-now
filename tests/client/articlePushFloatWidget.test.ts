import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import ArticlePushFloatWidget from "../../src/client/components/creative/ArticlePushFloatWidget.vue";
import {
  readCreativeFinishedArticle,
  streamPushArticleToDraft,
  type CreativeFinishedArticle,
} from "../../src/client/services/creativeApi.js";

vi.mock("../../src/client/services/creativeApi.js", () => ({
  readCreativeFinishedArticle: vi.fn(),
  streamPushArticleToDraft: vi.fn(),
}));

import { renderWechatThemePreview } from "../../src/client/services/wechatRenderer.js";

vi.mock("../../src/client/services/wechatRenderer.js", () => ({
  renderWechatThemePreview: vi.fn(() => "<p>发布正文</p>"),
}));

const article = {
  id: 101,
  contentMarkdown: "AI 草稿",
  humanMarkdown: "发布正文",
  titles: ["测试文章"],
} as unknown as CreativeFinishedArticle;

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ArticlePushFloatWidget", () => {
  it("强制稿在现有浮窗确认一次后才推送，普通稿流程不增加确认", async () => {
    const forced = { ...article, status: "needs_review", manualReviewReason: "人工强制重写 · 待人工审核", manualReviewReasons: ["原任务 original：事实复核失败", "本次质检未通过"] };
    vi.mocked(readCreativeFinishedArticle).mockResolvedValue(forced);
    vi.mocked(streamPushArticleToDraft).mockResolvedValue({ ok: true });
    const wrapper = shallowMount(ArticlePushFloatWidget, {
      props: { visible: true, article: forced, themeId: "bauhaus", themeLabel: "包豪斯", defaultAccountName: "默认公众号" },
      global: { stubs: { AButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' } } },
    });
    try {
      await (wrapper.vm as unknown as { startPush: () => Promise<void> }).startPush();
      expect(streamPushArticleToDraft).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain("原任务 original：事实复核失败");
      expect(wrapper.text()).toContain("本次质检未通过");
      const confirm = wrapper.findAll("button").find((button) => button.text() === "确认风险并推送")!;
      await confirm.trigger("click");
      await flushPromises();
      expect(streamPushArticleToDraft).toHaveBeenCalledExactlyOnceWith(article.id, "bauhaus", "<p>发布正文</p>", expect.any(Function), true);
      expect(forced.manualReviewReason).toBe("人工强制重写 · 待人工审核");
      expect(wrapper.find("[data-forced-push-confirm]").exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it("悬浮进度窗贴齐视口右下角且在窄屏内不溢出", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/client/components/creative/ArticlePushFloatWidget.vue"),
      "utf8",
    );

    expect(source).toMatch(/\.push-float\s*\{[^}]*bottom: 0;[^}]*right: 0;[^}]*width: 184px;[^}]*max-width: 100vw;/);
    expect(source).toMatch(/border-radius: 10px 0 0 0;/);
    expect(source).toMatch(/max-height: 100vh;/);
    expect(source).toMatch(/padding: 10px;/);
    const queue = readFileSync(resolve(process.cwd(), "src/client/components/creative/WriteQueueStatus.vue"), "utf8");
    const floatingQueueStyles = queue.match(/\.write-queue-float\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(floatingQueueStyles).toContain("bottom: 0;");
    expect(floatingQueueStyles).not.toContain("top:");
    expect(queue).toMatch(/\.write-queue-float--embedded\.write-queue-float--collapsed\s*\{[^}]*top: 50%;/);
    expect(Number(source.match(/z-index: (\d+);/)![1])).toBeGreaterThan(Number(queue.match(/z-index: (\d+);/)![1]));
  });

  it("不显示二次确认，并可由首次点击直接启动推送", async () => {
    vi.mocked(readCreativeFinishedArticle).mockResolvedValue(article);
    vi.mocked(streamPushArticleToDraft).mockResolvedValue({ ok: true, mediaId: "draft-1" });

    const wrapper = shallowMount(ArticlePushFloatWidget, {
      props: {
        visible: true,
        article,
        themeId: "bauhaus",
        themeLabel: "包豪斯",
        defaultAccountName: "默认公众号",
      },
      global: {
        stubs: { AButton: true },
      },
    });

    expect(wrapper.text()).not.toContain("确认推送");

    await (wrapper.vm as unknown as { startPush: () => Promise<void> }).startPush();
    await flushPromises();

    expect(streamPushArticleToDraft).toHaveBeenCalledWith(
      article.id,
      "bauhaus",
      "<p>发布正文</p>",
      expect.any(Function),
    );
    expect(wrapper.emitted("success")).toHaveLength(1);
    wrapper.unmount();
  });

  it.each(["发布正文", "发布正文\n\n跪求点赞、关注，谢谢你。", "发布正文\n\n跪求点赞、关注。"])("列表入口短稿推送补结尾且已有结尾不重复：%s", async (body) => {
    const short = { ...article, direction: "short_content", humanMarkdown: body };
    vi.mocked(readCreativeFinishedArticle).mockResolvedValue(short);
    vi.mocked(streamPushArticleToDraft).mockResolvedValue({ ok: true });
    const wrapper = shallowMount(ArticlePushFloatWidget, {
      props: { visible: true, article: short, themeId: "bauhaus", themeLabel: "包豪斯", defaultAccountName: "默认公众号" },
      global: { stubs: { AButton: true } },
    });
    try {
      await (wrapper.vm as unknown as { startPush: () => Promise<void> }).startPush();
      expect(renderWechatThemePreview).toHaveBeenCalledWith("发布正文\n\n跪求点赞、关注。", "bauhaus");
      expect(short.contentMarkdown).toBe("AI 草稿");
    } finally { wrapper.unmount(); }
  });

  it("成功后收起步骤并显示5秒倒计时，到点自动关闭", async () => {
    vi.useFakeTimers();
    vi.mocked(readCreativeFinishedArticle).mockResolvedValue(article);
    vi.mocked(streamPushArticleToDraft).mockResolvedValue({ ok: true, mediaId: "draft-1" });
    const wrapper = shallowMount(ArticlePushFloatWidget, {
      props: { visible: true, article, themeId: "bauhaus", themeLabel: "包豪斯", defaultAccountName: "默认公众号" },
      global: { stubs: { AButton: true } },
    });

    await (wrapper.vm as unknown as { startPush: () => Promise<void> }).startPush();
    await flushPromises();
    expect(wrapper.find(".push-float-steps").exists()).toBe(false);
    expect(wrapper.text()).toContain("5s 后自动关闭");
    vi.advanceTimersByTime(4000);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("1s 后自动关闭");
    expect(wrapper.emitted("update:visible")).toBeUndefined();
    vi.advanceTimersByTime(1000);
    expect(wrapper.emitted("update:visible")?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it("取消倒计时后保持成功提示，仍可手动关闭", async () => {
    vi.useFakeTimers();
    vi.mocked(readCreativeFinishedArticle).mockResolvedValue(article);
    vi.mocked(streamPushArticleToDraft).mockResolvedValue({ ok: true, mediaId: "draft-1" });
    const wrapper = shallowMount(ArticlePushFloatWidget, {
      props: { visible: true, article, themeId: "bauhaus", themeLabel: "包豪斯", defaultAccountName: "默认公众号" },
      global: { stubs: { AButton: true } },
    });

    await (wrapper.vm as unknown as { startPush: () => Promise<void> }).startPush();
    expect(wrapper.find(".push-float-cancel-auto-close").text()).toBe("取消自动关闭");
    await wrapper.find(".push-float-cancel-auto-close").trigger("click");
    vi.advanceTimersByTime(6000);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("update:visible")).toBeUndefined();
    expect(wrapper.text()).not.toContain("后自动关闭");
    await wrapper.find(".push-float-close").trigger("click");
    expect(wrapper.emitted("update:visible")?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it("成功倒计时期间手动关闭会清理定时器，不会再次触发关闭", async () => {
    vi.useFakeTimers();
    vi.mocked(readCreativeFinishedArticle).mockResolvedValue(article);
    vi.mocked(streamPushArticleToDraft).mockResolvedValue({ ok: true, mediaId: "draft-1" });
    const wrapper = shallowMount(ArticlePushFloatWidget, {
      props: { visible: true, article, themeId: "bauhaus", themeLabel: "包豪斯", defaultAccountName: "默认公众号" },
      global: { stubs: { AButton: true } },
    });

    await (wrapper.vm as unknown as { startPush: () => Promise<void> }).startPush();
    await wrapper.find(".push-float-close").trigger("click");
    vi.advanceTimersByTime(6000);
    expect(wrapper.emitted("update:visible")).toEqual([[false]]);
    wrapper.unmount();
  });

  it("失败不启动倒计时，关闭重开不会继承上一次成功的计时器", async () => {
    vi.useFakeTimers();
    vi.mocked(readCreativeFinishedArticle).mockResolvedValue(article);
    vi.mocked(streamPushArticleToDraft)
      .mockResolvedValueOnce({ ok: true, mediaId: "draft-1" })
      .mockResolvedValueOnce({ ok: false, errorCode: "test-error", errorMessage: "推送失败" });
    const wrapper = shallowMount(ArticlePushFloatWidget, {
      props: { visible: true, article, themeId: "bauhaus", themeLabel: "包豪斯", defaultAccountName: "默认公众号" },
      global: { stubs: { AButton: true } },
    });

    await (wrapper.vm as unknown as { startPush: () => Promise<void> }).startPush();
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    await (wrapper.vm as unknown as { startPush: () => Promise<void> }).startPush();
    await flushPromises();
    expect(wrapper.find(".push-float-steps").exists()).toBe(true);
    expect(wrapper.text()).toContain("推送失败");
    expect(wrapper.text()).not.toContain("后自动关闭");
    vi.advanceTimersByTime(6000);
    expect(wrapper.emitted("update:visible")).toBeUndefined();
    wrapper.unmount();
  });

  it("详情页点击推送时不再弹出内容未改动确认", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/client/components/creative/ArticleDetailDrawer.vue"),
      "utf8",
    );

    expect(source).not.toContain('title: "内容未改动"');
    expect(source).not.toContain('okText: "确认发布"');
  });
});
