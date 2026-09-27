import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import ArticleDetailFooter from "../../src/client/components/creative/article-detail/ArticleDetailFooter.vue";
import type { CreativeFinishedArticle } from "../../src/client/services/creativeApi.js";

const styles = readFileSync(resolve(process.cwd(), "src/client/components/creative/article-detail/articleDetailDrawer.css"), "utf8");
const drawerSource = readFileSync(resolve(process.cwd(), "src/client/components/creative/ArticleDetailDrawer.vue"), "utf8");
const mobileStyles = styles.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}\n\n\.article-detail-footer/)?.[1] ?? "";

describe("成品文章详情弹窗移动端布局", () => {
  it("移动端底部关闭按钮只在窄屏显示，并走现有关闭处理", () => {
    expect(styles).toMatch(/\.article-detail-footer \.article-detail-footer__mobile-close\s*\{[^}]*display: none;/);
    expect(mobileStyles).toMatch(/\.article-detail-footer \.article-detail-footer__mobile-close\s*\{[^}]*display: inline-flex;/);
    expect(drawerSource).toContain('@close="handleClose"');
  });

  it("移动端关闭按钮文字在按钮内部水平和垂直居中", () => {
    expect(mobileStyles).toMatch(/\.article-detail-footer \.article-detail-footer__mobile-close\s*\{[^}]*align-items: center;[^}]*justify-content: center;/);
  });

  it("只在移动端隐藏复制格式和废弃，桌面端保留两个操作", () => {
    expect(mobileStyles).toMatch(/\.article-detail-footer \.article-detail-footer__desktop-only\s*\{[^}]*display: none;/);
    expect(styles.slice(0, styles.indexOf("@media (max-width: 768px)"))).not.toMatch(/\.article-detail-footer \.article-detail-footer__desktop-only\s*\{[^}]*display: none;/);

    const wrapper = mount(ArticleDetailFooter, {
      props: {
        article: { id: 1, status: "manual_draft", originType: "manual" } as CreativeFinishedArticle,
        saving: false, wechatCopying: false, canPush: false, missingConditions: [],
      },
      global: {
        stubs: {
          "a-button": { template: "<button v-bind=\"$attrs\"><slot /></button>" },
          "a-tooltip": { template: "<span><slot /></span>" },
        },
      },
    });
    const buttons = wrapper.findAll("button");
    for (const label of ["复制格式", "废弃"]) {
      const button = buttons.find((candidate) => candidate.text() === label);
      expect(button?.classes()).toContain("article-detail-footer__desktop-only");
    }
    expect(buttons.find((candidate) => candidate.text() === "保存")?.classes()).not.toContain("article-detail-footer__desktop-only");
    wrapper.unmount();
  });

  it("关闭按钮位于保存左侧，点击不触发保存", async () => {
    const wrapper = mount(ArticleDetailFooter, {
      props: {
        article: { id: 1, status: "manual_draft", originType: "manual" } as CreativeFinishedArticle,
        saving: false, wechatCopying: false, canPush: false, missingConditions: [],
      },
      global: {
        stubs: {
          "a-button": { template: "<button><slot /></button>" },
          "a-tooltip": { template: "<span><slot /></span>" },
        },
      },
    });
    const buttons = wrapper.findAll("button");
    expect(buttons.slice(0, 2).map((button) => button.text())).toEqual(["关闭", "保存"]);
    await buttons[0]?.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("save")).toBeUndefined();
    await wrapper.setProps({ hideSave: true });
    expect(wrapper.find(".article-detail-footer__mobile-close").exists()).toBe(false);
    wrapper.unmount();
  });

  it("居中容器顶部对齐，弹窗和内容占满视口且正文仍可滚动", () => {
    expect(mobileStyles).toMatch(/\.article-detail-modal\.ant-modal-centered\s*\{[^}]*align-items: flex-start !important;/);
    expect(mobileStyles).toMatch(/\.article-detail-modal \.ant-modal\s*\{[^}]*width: 100% !important;[^}]*height: 100dvh;/);
    expect(mobileStyles).toMatch(/\.article-detail-modal \.ant-modal \.ant-modal-content\s*\{[^}]*height: 100dvh;[^}]*max-height: 100dvh;/);
    expect(styles).toMatch(/\.article-detail-modal \.ant-modal-body\s*\{[^}]*flex: 1;[^}]*overflow-y: auto;/);
  });
});
