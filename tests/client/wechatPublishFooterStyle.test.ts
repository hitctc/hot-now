import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ArticleMarkdownEditor from "../../src/client/components/creative/ArticleMarkdownEditor.vue";
import { renderWechatThemePreview, type WechatThemeId } from "../../src/client/services/wechatRenderer.js";
import { appendShortPublishFooter } from "../../src/client/utils/shortPublishFooter.js";
import { makeWechatCompatible } from "../../src/core/creative/wechatFormat/wechatCompat.js";

const themeIds: WechatThemeId[] = ["classic", "bauhaus", "sunset-film", "receipt", "black-gold"];

describe("简洁发布结尾样式", () => {
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
  it.each([
    "正文\n\n跪求\n点赞、关注。",
    "正文\n\n跪求\n\n点赞、关注。",
  ])("尾注被拆行或拆段后，公众号兼容处理仍保留一个普通段落：%s", async markdown => {
    const html = await makeWechatCompatible(renderWechatThemePreview(markdown, "bauhaus"), { skipImageBase64: true });
    const doc = new DOMParser().parseFromString(html, "text/html");
    const footer = doc.querySelector("p[data-short-publish-footer]");
    expect(doc.querySelectorAll("[data-short-publish-footer]")).toHaveLength(1);
    expect(footer?.textContent).toBe("跪求点赞、关注。");
    expect(footer?.querySelector("section, div, table")).toBeNull();
    expect(doc.body.textContent?.replace(/\s/g, "")).toBe("正文跪求点赞、关注。");
  });

  it.each(themeIds)("%s主题使用同一套普通段落样式，文字仍与正文区分", theme => {
    const markdown = appendShortPublishFooter("# 标题\n\n正文\n\n跪求点赞、关注，谢谢你。", "short_content");
    const html = renderWechatThemePreview(markdown, theme);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const footer = doc.querySelector<HTMLParagraphElement>("p[data-short-publish-footer]")!;
    const request = footer.querySelector<HTMLElement>('[data-footer-part="request"]')!;
    const body = footer.querySelector<HTMLElement>('[data-footer-part="body"]')!;
    expect(footer.textContent).toBe("跪求点赞、关注。");
    expect(footer.style.textAlign).toBe("center");
    expect(footer.style.fontSize).toBe("18px");
    expect(footer.style.fontWeight).toBe("700");
    expect(footer.style.borderTop).toContain("solid");
    expect(footer.style.borderBottom).toContain("solid");
    expect(request.textContent).toBe("跪求");
    expect(request.style.color).toBe(body.style.color);
    expect(body.textContent).toBe("点赞、关注。");
    expect(footer.outerHTML).not.toMatch(/linear-gradient|box-shadow|data-footer-panel|谢谢你/);
  });

  it.each(themeIds)("%s公众号兼容处理后仍是简单段落且强调色保留", async theme => {
    const html = renderWechatThemePreview("正文\n\n跪求点赞、关注。", theme);
    const compatible = await makeWechatCompatible(html, { skipImageBase64: true });
    const before = new DOMParser().parseFromString(html, "text/html").querySelector("p[data-short-publish-footer]")!;
    const footer = new DOMParser().parseFromString(compatible, "text/html").querySelector("p[data-short-publish-footer]")!;
    expect(footer.textContent).toBe("跪求点赞、关注。");
    expect(footer.querySelector("section, div, table")).toBeNull();
    expect(footer.getAttribute("style")).toContain("border-top");
    expect(footer.querySelector('[data-footer-part="request"]')!.getAttribute("style")).toContain("color: #b34c57; font-weight: 800;");
    expect(footer.querySelector('[data-footer-part="body"]')!.getAttribute("style")).toContain("color: #b34c57;");
    expect(before.querySelector('[data-footer-part="request"]')!.getAttribute("style")).toContain("color: #b34c57; font-weight: 800;");
    expect(before.querySelector('[data-footer-part="body"]')!.getAttribute("style")).toContain("color: #b34c57;");
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
