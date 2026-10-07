import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ArticleMarkdownEditor from "../../src/client/components/creative/ArticleMarkdownEditor.vue";
import { renderWechatThemePreview, type WechatThemeId } from "../../src/client/services/wechatRenderer.js";
import { appendShortPublishFooter } from "../../src/client/utils/shortPublishFooter.js";
import { makeWechatCompatible } from "../../src/core/creative/wechatFormat/wechatCompat.js";

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
  it.each(themeIds)("%s主题下跪求是大字主标题，保留宣言海报的强对比和层次", theme => {
    const markdown = appendShortPublishFooter("# 标题\n\n正文\n\n跪求点赞、关注，谢谢你。", "short_content");
    const html = renderWechatThemePreview(markdown, theme);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const card = doc.querySelector<HTMLElement>("[data-short-publish-footer]")!;
    expect(card).not.toBeNull();
    expect(card.textContent).toBe("跪求点赞、关注。");
    expect(card.style.backgroundColor).toBe("transparent");
    // DOM替身会把 border:none 的单项属性读成空串，直接验证实际输出的完整声明。
    expect(card.getAttribute("style")).toMatch(/(?:^|;)\s*border: none;/);
    const text = card.querySelector("p")!;
    expect(text.style.backgroundColor).toBe("rgb(23, 32, 57)");
    expect(text.style.maxWidth).toBe("100%");
    expect(text.style.width).toBe("270px");
    expect(text.style.borderRadius).toBe("0");
    expect(text.style.boxShadow).toContain("6px 6px");
    const request = card.querySelector<HTMLElement>('[data-footer-part="request"]')!;
    expect(request.textContent).toBe("跪求");
    expect(request.style.fontFamily).not.toContain("Kaiti");
    expect(request.style.fontSize).toBe("36px");
    expect(request.style.fontWeight).toBe("900");
    expect(request.style.color).toBe("rgb(23, 32, 57)");
    expect(request.style.backgroundColor).toBe("rgb(255, 91, 121)");
    expect(request.nextElementSibling?.tagName).toBe("BR");
    const like = card.querySelector<HTMLElement>('[data-footer-part="like"]')!;
    const follow = card.querySelector<HTMLElement>('[data-footer-part="follow"]')!;
    expect(like.textContent).toBe("点赞");
    expect(like.style.color).toBe("rgb(255, 255, 255)");
    expect(follow.textContent).toBe("关注");
    expect(follow.style.color).toBe("rgb(255, 157, 177)");
    expect(like.style.fontWeight).toBe("800");
    expect(like.style.fontSize).toBe("26px");
    expect(follow.style.fontSize).toBe("26px");
    expect(like.style.borderBottomWidth).toBe("4px");
    expect(follow.style.borderBottomWidth).toBe("4px");
    expect(parseInt(request.style.fontSize)).toBeGreaterThan(parseInt(like.style.fontSize));
    expect(card.querySelector("a, button, img, svg")).toBeNull();
    expect(html).not.toContain("谢谢你");
  });

  it.each(themeIds)("%s公众号兼容处理保留大字标题、海报层次及标点，不依赖外部资源", async theme => {
    const html = renderWechatThemePreview("正文\n\n跪求点赞、关注。", theme);
    const compatible = await makeWechatCompatible(html, { skipImageBase64: true });
    const before = new DOMParser().parseFromString(html, "text/html").querySelector("[data-short-publish-footer]")!;
    const card = new DOMParser().parseFromString(compatible, "text/html").querySelector("[data-short-publish-footer]")!;
    expect(card.textContent).toBe("跪求点赞、关注。");
    for (const key of ["request", "like", "separator", "follow", "stop"]) {
      const selector = `[data-footer-part="${key}"]`;
      expect(card.querySelector(selector)!.getAttribute("style")).toBe(before.querySelector(selector)!.getAttribute("style"));
    }
    expect(card.querySelector('[data-footer-part="like"]')!.textContent).toBe("点赞");
    expect(card.querySelector('[data-footer-part="follow"]')!.textContent).toBe("关注");
    expect(compatible).not.toContain("data-source-line");
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
