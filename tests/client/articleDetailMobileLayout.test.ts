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
  it("只读正文限制阅读宽度和图片高度，不裁切或放大小图", () => {
    const panelSource = readFileSync(resolve(process.cwd(), "src/client/components/creative/article-detail/ArticleEditorPanel.vue"), "utf8");
    expect(panelSource).toMatch(/v-if="readonly"\s+class="article-readonly-preview/);
    expect(styles).toMatch(/\.article-readonly-preview\s*\{[^}]*width: 100%;[^}]*max-width: 414px;/);
    expect(styles).toMatch(/\.article-readonly-preview img\s*\{[^}]*width: auto !important;[^}]*height: auto !important;[^}]*max-width: 100% !important;[^}]*max-height: 70dvh !important;[^}]*object-fit: contain;/);
  });
  it("标题栏和操作栏通过背景与阴影区分，底栏不再保留分隔线", () => {
    expect(styles).toMatch(/\.article-detail-modal \.ant-modal-header\s*\{[^}]*background: #faf9fc;[^}]*box-shadow:/);
    expect(styles).toMatch(/\.article-detail-modal \.ant-modal-footer\s*\{[^}]*border-top: 0;[^}]*background: #faf9fc;[^}]*box-shadow:/);
    expect(drawerSource).toContain('v-if="props.loading"');
    expect(drawerSource).toContain('data-testid="article-detail-loading"');
  });

  it.each(["FinishedArticlesPage", "ShortFinishedArticlesPage"])("%s 在读取前打开加载反馈，关闭时清除加载并使请求失效", (page) => {
    const source = readFileSync(resolve(process.cwd(), `src/client/pages/creative/${page}.vue`), "utf8");
    const detailSource = readFileSync(resolve(process.cwd(), "src/client/components/creative/finished-articles/useFinishedArticleDetail.ts"), "utf8");
    // 实现已归入详情职责，页面仍必须实际接入它，加载顺序/关闭失效合同不变。
    expect(source).toContain("useFinishedArticleDetail(loadItems)");
    expect(detailSource).toMatch(/detailLoading.value = true;\s*try \{\s*const detail = await readCreativeFinishedArticle/);
    expect(source).toContain(':open="detailLoading || detailArticle !== null"');
    expect(source).toContain(':loading="detailLoading"');
    expect(detailSource).toContain("const requests = createLatestRequestGuard()");
    expect(detailSource).toMatch(/function closeDetail\(\): void \{\s*requests.invalidate\(\);\s*detailLoading.value = false;/);
  });

  it("电脑和移动端都显示底部关闭按钮，并走现有关闭处理", () => {
    const sharedStyles = styles.slice(0, styles.indexOf("@media (max-width: 768px)"));
    expect(sharedStyles).toMatch(/\.article-detail-footer \.article-detail-footer__close\s*\{[^}]*display: inline-flex;/);
    expect(styles).not.toMatch(/\.article-detail-footer \.article-detail-footer__close\s*\{[^}]*display: none;/);
    expect(drawerSource).toContain('@close="handleClose"');
  });

  it("详情弹窗右上角关闭按钮与文章队列关闭按钮同为44像素方形点击区", () => {
    const queueStyles = readFileSync(resolve(process.cwd(), "src/client/components/creative/WriteQueueStatus.vue"), "utf8");
    expect(styles).toMatch(/\.article-detail-modal \.ant-modal-close\s*\{[^}]*width: 44px;[^}]*height: 44px;/);
    expect(queueStyles).toMatch(/\.write-queue-control\s*\{[^}]*width: 44px;[^}]*height: 44px;/);
  });

  it("所有屏幕的关闭按钮文字在按钮内部水平和垂直居中", () => {
    const sharedStyles = styles.slice(0, styles.indexOf("@media (max-width: 768px)"));
    expect(sharedStyles).toMatch(/\.article-detail-footer \.article-detail-footer__close\s*\{[^}]*align-items: center;[^}]*justify-content: center;/);
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
    expect(wrapper.find(".article-detail-footer__close").exists()).toBe(true);
    await buttons[0]?.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("save")).toBeUndefined();
    await wrapper.setProps({ hideSave: true });
    expect(wrapper.find(".article-detail-footer__close").exists()).toBe(false);
    wrapper.unmount();
  });

  // 全屏规则必须位于媒体查询之外，才能同时覆盖电脑和手机。
  it("所有屏幕的弹窗占满视口且无外侧留白，正文仍可滚动", () => {
    const sharedStyles = styles.slice(0, styles.indexOf("@media (max-width: 768px)"));
    expect(drawerSource).toContain('width="100%"');
    expect(sharedStyles).toMatch(/\.article-detail-modal\.ant-modal-centered\s*\{[^}]*display: flex !important;[^}]*align-items: stretch !important;[^}]*padding: 0 !important;/);
    expect(sharedStyles).toMatch(/\.article-detail-modal \.ant-modal\s*\{[^}]*max-width: 100% !important;[^}]*width: 100% !important;[^}]*margin: 0 !important;[^}]*padding: 0 !important;[^}]*top: 0 !important;/);
    expect(styles).toMatch(/\.article-detail-modal \.ant-modal-body\s*\{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow-y: auto;/);
  });

  it("弹窗高度由固定容器拉伸，不用高度值也不靠 antd 居中占位符", () => {
    // 历史教训：用 100dvh 会在视口单位失效时上下露缝；改成百分比又会在包裹层高度
    // 不确定时退化成 auto，使正文区失去约束、整个弹窗都不能滚动。因此只用 flex 拉伸。
    const sharedStyles = styles.slice(0, styles.indexOf("@media (max-width: 768px)"));
    expect(sharedStyles).toMatch(/\.article-detail-modal\.ant-modal-centered::before\s*\{[^}]*display: none !important;/);
    for (const block of styles.match(/\.article-detail-modal \.ant-modal\s*\{[^}]*\}/g) ?? []) {
      expect(block).not.toMatch(/height:\s*(100dvh|100%|100vh)/);
    }
    // antd 在 .ant-modal 与内容块之间还有一层焦点包裹，flex 分配到不了内容块。
    expect(sharedStyles).toMatch(/\.article-detail-modal \.ant-modal \.ant-modal-content\s*\{[^}]*position: absolute;[^}]*inset: 0;[^}]*max-height: none;/);
    // 头尾固定且不留缝，中间是唯一滚动区。
    expect(sharedStyles).toMatch(/\.article-detail-modal \.ant-modal-header\s*\{[^}]*margin-bottom: 0 !important;/);
    expect(sharedStyles).toMatch(/\.article-detail-modal \.ant-modal-footer\s*\{[^}]*margin-top: 0 !important;/);
    expect(sharedStyles).toMatch(/\.article-detail-modal \.ant-modal-body\s*\{[^}]*overflow-x: hidden;/);
  });
});
