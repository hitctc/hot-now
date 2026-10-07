import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ArticleMarkdownEditor from "../../src/client/components/creative/ArticleMarkdownEditor.vue";
import { renderWechatThemePreview, type WechatThemeId } from "../../src/client/services/wechatRenderer.js";
import { appendShortPublishFooter } from "../../src/client/utils/shortPublishFooter.js";

const themeIds: WechatThemeId[] = ["classic", "bauhaus", "sunset-film", "receipt", "black-gold"];

describe("发布结尾独立样式", () => {
  it("实时预览与主题使用完全相同的结尾样式，关闭预览时跳过渲染", async () => {
    const modelValue = "正文\n\n跪求点赞、关注。";
    const wrapper = mount(ArticleMarkdownEditor, { props: { modelValue, syncScroll: false } });
    try {
      const doc = new DOMParser().parseFromString(renderWechatThemePreview(modelValue, "classic"), "text/html");
      expect(wrapper.get("[data-short-publish-footer]").element.outerHTML).toBe(doc.querySelector("[data-short-publish-footer]")!.outerHTML);
      await wrapper.setProps({ previewEnabled: false });
      expect(wrapper.find("[data-short-publish-footer]").exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });
  it.each(themeIds)("%s主题下新结尾保持相同颜色、边框及字重", theme => {
    const markdown = appendShortPublishFooter("# 标题\n\n正文\n\n跪求点赞、关注，谢谢你。", "short_content");
    const html = renderWechatThemePreview(markdown, theme);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const card = doc.querySelector<HTMLElement>("[data-short-publish-footer]")!;
    expect(card).not.toBeNull();
    expect(card.textContent).toBe("跪求点赞、关注。");
    expect(card.style.backgroundColor).toBe("rgb(245, 243, 255)");
    expect(card.style.borderLeftColor).toBe("rgb(245, 158, 11)");
    expect(card.style.borderRadius).toBe("12px");
    const text = card.querySelector("p")!;
    expect(text.style.color).toBe("rgb(91, 33, 182)");
    expect(text.style.fontWeight).toBe("800");
    expect(html).not.toContain("谢谢你");
  });

  it("五个主题的结尾内联样式完全一致，正文仍各用原主题", () => {
    const cards = themeIds.map(theme => {
      const html = renderWechatThemePreview("正文\n\n跪求点赞、关注。", theme);
      return new DOMParser().parseFromString(html, "text/html").querySelector("[data-short-publish-footer]")!.outerHTML;
    });
    expect(new Set(cards).size).toBe(1);
  });

  it("正文中提到同一句文案不被装饰，也不修改普通结尾", () => {
    const html = renderWechatThemePreview("跪求点赞、关注。\n\n这是正文结尾", "bauhaus");
    expect(html).not.toContain("data-short-publish-footer");
  });
});
