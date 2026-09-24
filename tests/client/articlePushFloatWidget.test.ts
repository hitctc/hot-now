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
  it("缩小悬浮进度窗并在窄屏内留出边距", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/client/components/creative/ArticlePushFloatWidget.vue"),
      "utf8",
    );

    expect(source).toMatch(/\.push-float\s*\{[^}]*width: 184px;[^}]*max-width: calc\(100vw - 48px\);/);
    expect(source).toMatch(/padding: 10px;/);
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
