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
  vi.clearAllMocks();
});

describe("ArticlePushFloatWidget", () => {
  it("缩小悬浮进度窗并在窄屏内留出边距", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/client/components/creative/ArticlePushFloatWidget.vue"),
      "utf8",
    );

    expect(source).toMatch(/\.push-float\s*\{[^}]*width: 208px;[^}]*max-width: calc\(100vw - 48px\);/);
    expect(source).toMatch(/padding: 14px 12px;/);
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

  it("详情页点击推送时不再弹出内容未改动确认", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/client/components/creative/ArticleDetailDrawer.vue"),
      "utf8",
    );

    expect(source).not.toContain('title: "内容未改动"');
    expect(source).not.toContain('okText: "确认发布"');
  });
});
