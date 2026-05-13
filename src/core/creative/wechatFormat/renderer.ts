// Markdown → 带内联样式的 HTML 渲染
// 使用 markdown-it 解析，applyTheme 注入主题样式

import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import { JSDOM } from "jsdom";
import { themes, type WechatThemeId } from "./themes.js";

// markdown-it 实例：支持 HTML、链接识别、代码高亮
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(str: string, lang: string): string {
    let codeContent: string;
    if (lang && hljs.getLanguage(lang)) {
      try {
        codeContent = hljs.highlight(str, { language: lang }).value;
      } catch {
        codeContent = md.utils.escapeHtml(str);
      }
    } else {
      codeContent = md.utils.escapeHtml(str);
    }
    // 代码块顶部的 macOS 风格小圆点
    const dots =
      '<div style="margin-bottom: 12px; white-space: nowrap;">' +
      '<span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #ff5f56; margin-right: 6px;"></span>' +
      '<span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #ffbd2e; margin-right: 6px;"></span>' +
      '<span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #27c93f;"></span>' +
      "</div>";
    return `<pre>${dots}<code class="hljs">${codeContent}</code></pre>`;
  },
});

// Markdown 预处理：修复合并加粗标记等问题
function preprocessMarkdown(content: string): string {
  // 标准化 hr 分隔线
  content = content.replace(/^[ ]{0,3}(\*[ ]*\*[ ]*\*[\* ]*)[ \t]*$/gm, "***");
  content = content.replace(/^[ ]{0,3}(-[ ]*-[ ]*-[- ]*)[ \t]*$/gm, "---");
  content = content.replace(/^[ ]{0,3}(_[ ]*_[ ]*_[_ ]*)[ \t]*$/gm, "___");
  // 移除空的加粗标记
  content = content.replace(/\*\*[ \t]+\*\*/g, " ");
  content = content.replace(/\*{4,}/g, "");
  // 在加粗开头遇到标点/符号时插入零宽空格，防止微信换行断开
  content = content.replace(
    /([^\s])\*\*([+\-＋－%％~～!！?？,，.。:：;；、\\/|@#￥$^&*_=（）()【】\[\]《》〈〉「」『』""\"'`…·][^\n*]*?)\*\*/g,
    "$1**​$2**"
  );
  return content;
}

// hljs 语法高亮 token 的内联样式映射
const hljsInlineStyles: Record<string, string> = {
  "hljs-comment": "color: #6a737d; font-style: italic;",
  "hljs-keyword": "color: #d73a49; font-weight: 600;",
  "hljs-string": "color: #032f62;",
  "hljs-title": "color: #6f42c1; font-weight: 600;",
  "hljs-built_in": "color: #e36209;",
  "hljs-literal": "color: #005cc5;",
  "hljs-number": "color: #005cc5;",
  "hljs-attr": "color: #005cc5;",
  "hljs-selector-tag": "color: #22863a;",
  "hljs-name": "color: #6f42c1;",
  "hljs-tag": "color: #22863a;",
  "hljs-type": "color: #d73a49;",
  "hljs-variable": "color: #e36209;",
  "hljs-meta": "color: #735c0f;",
};

// 标题内嵌元素的颜色继承覆盖
const headingInlineOverrides: Record<string, string> = {
  strong: "font-weight: 700; color: inherit !important; background-color: transparent !important;",
  em: "font-style: italic; color: inherit !important; background-color: transparent !important;",
  a: "color: inherit !important; text-decoration: none !important; border-bottom: 1px solid currentColor !important; background-color: transparent !important;",
  code: "color: inherit !important; background-color: transparent !important; border: none !important; padding: 0 !important;",
};

// 将主题样式注入到 HTML 各元素上
function applyTheme(html: string, themeId: WechatThemeId): string {
  const theme = themes[themeId];
  if (!theme) throw new Error(`Unknown theme: ${themeId}`);
  const style = theme.styles;

  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const doc = dom.window.document;

  // 遍历主题样式键，给对应元素注入内联样式
  for (const selector of Object.keys(style)) {
    if (selector === "pre code") continue;
    const elements = doc.querySelectorAll(selector);
    elements.forEach((el) => {
      const element = el as Element;
      // 跳过 <pre> 内的 <code>（code 样式只用于行内代码）
      if (selector === "code" && element.parentElement?.tagName === "PRE") return;
      const currentStyle = element.getAttribute("style") || "";
      element.setAttribute("style", currentStyle + "; " + style[selector]);
    });
  }

  // 代码高亮：给 hljs span 加内联样式
  const codeTokens = doc.querySelectorAll(".hljs span");
  codeTokens.forEach((span) => {
    let inlineStyle = "";
    span.classList.forEach((cls) => {
      if (hljsInlineStyles[cls]) inlineStyle += hljsInlineStyles[cls] + " ";
    });
    if (inlineStyle) span.setAttribute("style", inlineStyle.trim());
  });

  // 标题内嵌元素（strong/em/a/code）继承标题颜色
  for (const tag of ["h1", "h2", "h3", "h4"]) {
    doc.querySelectorAll(tag).forEach((heading) => {
      for (const inlineTag of Object.keys(headingInlineOverrides)) {
        heading.querySelectorAll(inlineTag).forEach((el: Element) => {
          const current = el.getAttribute("style") || "";
          el.setAttribute("style", current + "; " + headingInlineOverrides[inlineTag]);
        });
      }
    });
  }

  // 用主题的 container 样式包裹整个内容
  const container = doc.createElement("div");
  container.setAttribute("style", style.container);
  container.innerHTML = doc.body.innerHTML;

  return container.outerHTML;
}

// 完整渲染管线：Markdown → 预处理 → HTML → 主题样式注入
export function renderMarkdownToWechatHtml(
  markdown: string,
  themeId: WechatThemeId
): string {
  const preprocessed = preprocessMarkdown(markdown);
  const rawHtml = md.render(preprocessed);
  return applyTheme(rawHtml, themeId);
}
