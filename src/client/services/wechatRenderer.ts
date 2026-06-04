// 客户端微信主题渲染：Markdown → 带内联样式的 HTML
// 移植自 src/core/creative/wechatFormat/，用浏览器 DOM API 替代 JSDOM
// 服务端的 makeWechatCompatible（微信兼容处理）不移植，仅推送/复制时走服务端

import MarkdownIt from "markdown-it";

// ── 主题定义 ──

export type WechatThemeId = "classic" | "bauhaus" | "sunset-film" | "receipt";

type ThemeStyles = Record<string, string>;

interface WechatTheme {
  id: WechatThemeId;
  name: string;
  styles: ThemeStyles;
}

const baseFont = `-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif`;

const themes: Record<WechatThemeId, WechatTheme> = {
  classic: {
    id: "classic",
    name: "默认",
    styles: {
      container: `max-width: 677px; margin: 0 auto; padding: 5px 20px; word-break: break-word; font-family: "Times New Roman", "Songti SC", "SimSun", serif; color: #000; background-color: transparent;`,
      h1: "margin: 40px 0 30px; font-size: 22px; font-weight: bold; color: #000; text-align: center; line-height: 1.4; display: block;",
      h2: "margin: 30px 0 15px; font-size: 18px; font-weight: bold; color: #000; text-align: left; border-bottom: 2px solid #000; padding-bottom: 8px;",
      h3: "margin: 20px 0 10px; font-size: 16px; font-weight: bold; color: #800000;",
      h4: "margin: 15px 0 5px; font-size: 16px; font-weight: bold; font-style: italic; color: #333;",
      p: "margin: 16px 0; font-size: 16px; line-height: 1.7; color: #1a1a1a; text-align: justify; overflow-wrap: break-word;",
      strong: "font-weight: bold; color: #000;",
      em: "font-style: italic; color: #000;",
      a: "color: #000080; text-decoration: underline;",
      blockquote: "margin: 20px 0; padding: 16px 20px; background: #fafafa; border: 1px solid #ddd; border-left: 4px solid #666;",
      blockquote_p: "margin: 0; font-size: 15px; line-height: 1.6; color: #555;",
      ul: "margin: 16px 0; padding-left: 20px; list-style-type: disc;",
      ol: "margin: 16px 0; padding-left: 20px; list-style-type: decimal;",
      li: "margin: 5px 0; color: #333; line-height: 1.6; font-weight: 500;",
      img: "display: block; margin: 30px auto; width: 100%; border: 1px solid #ddd;",
      hr: "margin: 10px 0; border: none; border-top: 1px solid #000;",
      code: "color: #000; background: #f4f4f4; border: 1px solid #eee; padding: 1px 4px; margin: 0 2px; border-radius: 2px; font-size: 14px; font-family: 'Courier New', Courier, monospace;",
      pre: "background: #f9f9f9; border: 1px solid #ccc; padding: 12px; font-family: 'Courier New', monospace; font-size: 13px; overflow-x: auto;",
      table: "width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; border-top: 2px solid #000; border-bottom: 2px solid #000;",
      th: "border-bottom: 1px solid #000; padding: 10px 5px; font-weight: bold; text-align: center; background: #fff;",
      td: "padding: 10px 5px; border: none; text-align: center; color: #333;",
      mark: "background: #fff3cd; color: #000; padding: 0 2px;",
      del: "text-decoration: line-through; color: #666; opacity: 0.7;",
    },
  },
  bauhaus: {
    id: "bauhaus",
    name: "包豪斯",
    styles: {
      container: `max-width: 100%; margin: 0 auto; padding: 0 6px; border-top: 8px solid #D32F2F; border-bottom: 8px solid #1976D2; word-break: break-word; font-family: ${baseFont};`,
      h1: "margin: 20px 0 10px; font-size: 26px; font-weight: 900; color: #fff; background: #D32F2F; padding: 15px 25px; display: inline-block; box-shadow: 6px 6px 0 #111; border: 2px solid #111;",
      h2: "margin: 20px 0 10px; font-size: 20px; font-weight: bold; color: #111; border-left: 10px solid #1976D2; padding-left: 20px;",
      h3: "margin: 16px 0 8px; font-size: 18px; font-weight: bold; color: #111; border-bottom: 5px solid #FBC02D; display: inline-block; padding-bottom: 2px;",
      h4: "margin: 20px 0 10px; font-size: 16px; font-weight: bold; color: #1976D2; background: #eee; padding: 4px 8px;",
      p: "margin: 8px 0; font-size: 16px; line-height: 1.8; color: #333; text-align: justify; overflow-wrap: break-word;",
      strong: "font-weight: 900; color: #D32F2F;",
      em: "font-style: italic; color: #1976D2;",
      a: "color: #576b95; text-decoration: none; border-bottom: 1px solid #576b95; overflow-wrap: break-word;",
      blockquote: "margin: 16px 0; padding: 20px; background: #f9f9f9; border: 2px solid #111; box-shadow: 5px 5px 0 #D32F2F;",
      blockquote_p: "margin: 0; font-size: 16px; line-height: 1.7; color: #333;",
      ul: "margin: 10px 0; padding-left: 20px; list-style-type: square; color: #D32F2F;",
      ol: "margin: 10px 0; padding-left: 20px; list-style-type: decimal; color: #D32F2F; font-weight: bold;",
      li: "margin: 5px 0; color: #333; font-weight: normal; line-height: 1.8;",
      img: "display: block; margin: 16px auto; width: 100%; border: 3px solid #111; box-shadow: 6px 6px 0 #1976D2;",
      hr: "margin: 30px 0; border: none; border-top: 4px solid #000;",
      code: "background: #FBC02D; color: #000; padding: 2px 6px; margin: 0 4px; font-size: 14px; font-weight: bold;",
      pre: "background: #111; color: #f5f5f5; padding: 20px; font-family: monospace; font-size: 14px;",
      table: "width: 100%; margin: 16px 0; border-collapse: collapse; border: 2px solid #111;",
      th: "background: #1976D2; color: #fff; border: 1px solid #111; padding: 10px; font-weight: bold;",
      td: "border: 1px solid #111; padding: 10px; color: #333;",
      mark: "background: #FBC02D; color: #000; padding: 2px 6px; font-weight: bold;",
      del: "text-decoration: line-through; text-decoration-thickness: 2px; text-decoration-color: #D32F2F; color: #666;",
    },
  },
  "sunset-film": {
    id: "sunset-film",
    name: "落日胶片",
    styles: {
      container: `max-width: 100%; margin: 0 auto; padding: 0 0; word-break: break-word; font-family: "Songti SC", SimSun, STSong, Georgia, serif;`,
      h1: "margin: 20px 0 10px; font-size: 26px; font-weight: 900; color: #B33D25; text-align: center; border-top: 4px double #B33D25; border-bottom: 1px solid #B33D25; padding: 20px 0; letter-spacing: 3px; display: block;",
      h2: "margin: 20px 0 10px; font-size: 19px; font-weight: bold; color: #FFFBF0; background: #B33D25; padding: 8px 16px; display: inline-block; border-radius: 2px; box-shadow: 4px 4px 0px rgba(179, 61, 37, 0.2);",
      h3: "margin: 16px 0 8px; font-size: 18px; font-weight: bold; color: #8D5B4C; display: inline-block; padding-left: 10px; border-left: 4px solid #D98C45;",
      h4: "margin: 20px 0 10px; font-size: 16px; font-weight: bold; color: #B33D25; border-bottom: 2px solid #F2C94C; display: inline-block; padding-bottom: 2px;",
      p: "margin: 8px 0; font-size: 16px; line-height: 1.9; color: #5D4037; text-align: justify; letter-spacing: 0.8px; overflow-wrap: break-word;",
      strong: "font-weight: 900; color: #B33D25;",
      em: "font-style: italic; color: #D98C45;",
      a: "color: #576b95; text-decoration: none; border-bottom: 1px solid #576b95; overflow-wrap: break-word;",
      blockquote: "margin: 16px 0; padding: 24px; background: #F7EED6; border-left: 3px solid #8D5B4C; border-radius: 2px;",
      blockquote_p: "margin: 0; font-size: 15px; line-height: 1.8; color: #6D4C41; font-style: italic;",
      ul: "margin: 10px 0; padding-left: 20px; list-style-type: square; color: #D98C45;",
      ol: "margin: 10px 0; padding-left: 20px; list-style-type: decimal; color: #B33D25; font-weight: bold;",
      li: "margin: 5px 0; color: #5D4037; font-weight: normal; line-height: 1.8;",
      img: "display: block; margin: 16px auto; width: 95%; border: 8px solid #fff; box-shadow: 0 10px 25px rgba(93, 64, 55, 0.15); background: #fff;",
      hr: "margin: 30px auto; border: none; border-top: 2px dashed #D98C45;",
      code: "background: #EFE6D5; color: #5D4037; padding: 2px 6px; margin: 0 4px; border-radius: 3px; font-size: 14px;",
      pre: "background: #4A3B32; color: #E6CBB5; padding: 20px; font-family: Courier New, Courier, monospace; font-size: 13px; border: 4px solid #F7EED6; border-radius: 4px;",
      table: "width: 100%; margin: 16px 0; border-collapse: collapse; font-size: 14px; border: 2px solid #8D5B4C;",
      th: "background: #EFE6D5; color: #4A3B32; font-weight: bold; border: 1px solid #8D5B4C; padding: 12px 10px; text-align: center;",
      td: "border: 1px solid #8D5B4C; padding: 12px 10px; color: #5D4037; background: #FFFBF0;",
      mark: "background: rgba(242, 201, 76, 0.3); color: #B33D25; padding: 2px 4px; border-radius: 2px;",
      del: "text-decoration: line-through; color: #8D5B4C;",
    },
  },
  receipt: {
    id: "receipt",
    name: "购物小票",
    styles: {
      container: `max-width: 100%; margin: 0 auto; padding: 0 0; word-break: break-word; font-family: Courier New, SimSun, Songti SC, monospace; border-top: 5px dashed #111; border-bottom: 5px dashed #111;`,
      h1: "margin: 20px 0 10px; font-size: 26px; font-weight: 900; color: #000; text-align: center; border-top: 2px dashed #000; border-bottom: 2px dashed #000; padding: 15px 0; letter-spacing: 2px; display: block;",
      h2: "margin: 20px 0 10px; font-size: 18px; font-weight: bold; color: #fff; background: #000; padding: 8px; text-align: center; display: block;",
      h3: "margin: 16px 0 8px; font-size: 16px; font-weight: bold; color: #000; border-bottom: 2px solid #000; display: inline-block; padding-bottom: 2px;",
      h4: "margin: 20px 0 10px; font-size: 16px; font-weight: bold; color: #000; text-decoration: underline;",
      p: "margin: 8px 0; font-size: 15px; line-height: 1.6; color: #222; text-align: justify; overflow-wrap: break-word;",
      strong: "font-weight: 900; background: #ddd; padding: 0 4px;",
      em: "font-style: italic; color: #000;",
      a: "color: #576b95; text-decoration: none; border-bottom: 1px solid #576b95; overflow-wrap: break-word;",
      blockquote: "margin: 16px 0; padding: 15px; border: 1px dotted #000; background: #f8f8f8;",
      blockquote_p: "margin: 0; font-family: monospace; font-size: 14px; line-height: 1.6; color: #444;",
      ul: "margin: 10px 0; padding-left: 10px; list-style-type: none;",
      ol: "margin: 10px 0; padding-left: 25px; list-style-type: decimal; font-weight: bold;",
      li: "margin: 5px 0; color: #222; font-weight: normal; line-height: 1.6; border-bottom: 1px dotted #ccc; padding-bottom: 4px;",
      img: "display: block; margin: 16px auto; width: 100%; border: 2px dashed #000; padding: 8px; background: #fff;",
      hr: "margin: 30px 0; border: none; border-top: 2px dashed #000;",
      code: "background: #000; color: #fff; font-family: monospace; padding: 2px 6px; margin: 0 4px; font-size: 14px;",
      pre: "background: #f4f4f4; color: #000; padding: 15px; font-family: Courier New, monospace; font-size: 13px; border: 2px dashed #000;",
      table: "width: 100%; margin: 16px 0; border-collapse: collapse; font-size: 14px; font-family: monospace;",
      th: "border-bottom: 2px dashed #000; padding: 8px 5px; text-align: right; font-weight: 900;",
      td: "border-bottom: 1px dotted #000; padding: 8px 5px; text-align: right; color: #000;",
      mark: "background: #ddd; color: #000; padding: 0 4px;",
      del: "text-decoration: line-through; color: #666;",
    },
  },
};

// ── Markdown 预处理 ──

function preprocessMarkdown(content: string): string {
  // 标准化 hr 分隔线
  content = content.replace(/^[ ]{0,3}(\*[ ]*\*[ ]*\*[\* ]*)[ \t]*$/gm, "***");
  content = content.replace(/^[ ]{0,3}(-[ ]*-[ ]*-[- ]*)[ \t]*$/gm, "---");
  content = content.replace(/^[ ]{0,3}(_[ ]*_[ ]*_[_ ]*)[ \t]*$/gm, "___");
  // 移除空的加粗标记
  content = content.replace(/\*\*[ \t]+\*\*/g, " ");
  content = content.replace(/\*{4,}/g, "");
  // 加粗开头遇到标点/符号时插入零宽空格，防止微信换行断开
  content = content.replace(
    /([^\s])\*\*([+\-＋－%％~～!！?？,，.。:：;；、\\/|@#￥$^&*_=（）()【】\[\]《》〈〉「」『』""\"'`…·][^\n*]*?)\*\*/g,
    "$1**​$2**"
  );
  return content;
}

// ── markdown-it 实例 ──

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
});

// 所有链接在新标签打开
md.core.ruler.push("external_links", (state) => {
  for (const token of state.tokens) {
    if (!token.children) continue;
    for (const child of token.children) {
      if (child.type === "link_open") {
        child.attrSet("target", "_blank");
        child.attrSet("rel", "noopener noreferrer");
      }
    }
  }
});

// ── 主题样式注入 ──

function applyTheme(html: string, themeId: WechatThemeId): string {
  const theme = themes[themeId];
  if (!theme) throw new Error(`Unknown theme: ${themeId}`);
  const style = theme.styles;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<!DOCTYPE html><body>${html}</body>`, "text/html");

  // 给各元素注入内联样式
  for (const selector of Object.keys(style)) {
    if (selector === "blockquote_p" || selector === "pre code") continue;
    const elements = doc.querySelectorAll(selector);
    elements.forEach((el) => {
      if (selector === "code" && el.parentElement?.tagName === "PRE") return;
      const currentStyle = el.getAttribute("style") || "";
      el.setAttribute("style", currentStyle + "; " + style[selector]);
    });
  }

  // blockquote 内的 p 使用 blockquote_p 样式
  if (style.blockquote_p) {
    doc.querySelectorAll("blockquote").forEach((bq) => {
      bq.querySelectorAll("p").forEach((p) => {
        const currentStyle = p.getAttribute("style") || "";
        p.setAttribute("style", currentStyle + "; " + style.blockquote_p);
      });
    });
  }

  // 标题内嵌元素继承标题颜色
  const headingOverrides: Record<string, string> = {
    strong: "font-weight: 700; color: inherit !important; background-color: transparent !important;",
    em: "font-style: italic; color: inherit !important; background-color: transparent !important;",
    a: "color: inherit !important; text-decoration: none !important; border-bottom: 1px solid currentColor !important; background-color: transparent !important;",
    code: "color: inherit !important; background-color: transparent !important; border: none !important; padding: 0 !important;",
  };
  for (const tag of ["h1", "h2", "h3", "h4"]) {
    doc.querySelectorAll(tag).forEach((heading) => {
      for (const inlineTag of Object.keys(headingOverrides)) {
        heading.querySelectorAll(inlineTag).forEach((el) => {
          const current = el.getAttribute("style") || "";
          el.setAttribute("style", current + "; " + headingOverrides[inlineTag]);
        });
      }
    });
  }

  // 参考来源标题行、来源条目、编辑段落字号统一为 12px
  {
    const allParas = Array.from(doc.querySelectorAll("p"));
    let inRefSection = false;
    for (const p of allParas) {
      const text = p.textContent?.trimStart() || "";
      const isRefHeading = text.startsWith("参考来源");
      const isEditorLine = text.startsWith("编辑");
      if (isRefHeading) inRefSection = true;
      if (isRefHeading || isEditorLine || inRefSection) {
        const currentStyle = p.getAttribute("style") || "";
        const styled = currentStyle.replace(/font-size:\s*\d+px/, "font-size: 12px").replace(/color:\s*[^;]+;?/, "color: #999;");
        p.setAttribute("style", styled);
        // 段落内子元素（em、strong 等）也统一灰色
        p.querySelectorAll("em, strong, span").forEach((el) => {
          const s = el.getAttribute("style") || "";
          el.setAttribute("style", s.replace(/color:\s*[^;]+;?/, "color: #999;"));
        });
      }
      if (isEditorLine) break;
    }
  }

  // 参考来源来源条目：<a> 转为纯文本，整行用 <em> 包裹
  // "参考来源："是标题行，后续若干段落是来源条目，遇到"编辑"或非 <p> 内容则结束
  {
    const allParas = Array.from(doc.querySelectorAll("p"));
    let inRefSection = false;
    for (const p of allParas) {
      const text = p.textContent?.trimStart() || "";
      if (text.startsWith("参考来源")) { inRefSection = true; continue; }
      if (!inRefSection) continue;
      if (text.startsWith("编辑")) break;
      // 将段落内 <a> 还原为纯文本，再整体包在 <em> 中
      p.querySelectorAll("a").forEach((a) => {
        a.replaceWith(doc.createTextNode(a.textContent || ""));
      });
      const em = doc.createElement("em");
      em.textContent = p.textContent || "";
      p.innerHTML = "";
      p.appendChild(em);
      if (style.em) em.setAttribute("style", style.em + "; word-break: break-all;");
    }
  }

  // 用 container 样式包裹
  const container = doc.createElement("div");
  container.setAttribute("style", style.container);
  container.innerHTML = doc.body.innerHTML;

  return container.outerHTML;
}

// ── 公开接口 ──

export function renderWechatThemePreview(
  markdown: string,
  themeId: WechatThemeId
): string {
  const preprocessed = preprocessMarkdown(markdown);
  const rawHtml = md.render(preprocessed);
  return applyTheme(rawHtml, themeId);
}
