// 微信公众号兼容处理
// 修复微信编辑器不支持 flex、字体继承丢失、标点断行等问题
// 完全从前端渲染的 HTML 中提取容器样式，不依赖后端主题定义

import { JSDOM } from "jsdom";

export type WechatThemeId = "classic" | "bauhaus" | "sunset-film" | "receipt" | "black-gold";

// 外链图片转 Base64（微信会拦截外链图片）
async function convertImageToBase64(imgUrl: string): Promise<string> {
  if (imgUrl.startsWith("data:")) return imgUrl;
  try {
    const response = await fetch(imgUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return imgUrl;
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return imgUrl;
  }
}

// 微信兼容性处理主函数
// skipImageBase64: 推送流程需跳过 base64 转换，保留原始 URL 以便上传到微信 CDN 后替换
export async function makeWechatCompatible(html: string, options?: { skipImageBase64?: boolean }): Promise<string> {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const doc = dom.window.document;

  // 1. 从 HTML 中提取已有的容器 div 样式，转为 section
  const existingDiv = doc.querySelector("body > div");
  let containerStyle = existingDiv?.getAttribute("style") || "";

  const section = doc.createElement("section");
  if (containerStyle) section.setAttribute("style", containerStyle);

  if (existingDiv) {
    Array.from(existingDiv.childNodes).forEach((child) => section.appendChild(child));
    existingDiv.replaceWith(section);
  } else {
    const rootNodes = Array.from(doc.body.childNodes);
    rootNodes.forEach((node) => section.appendChild(node));
    doc.body.innerHTML = "";
    doc.body.appendChild(section);
  }

  // 2. flex → table：微信不支持 display: flex
  const allElements = doc.querySelectorAll("*");
  allElements.forEach((el: Element) => {
    const style = el.getAttribute("style") || "";
    if (!style.includes("display: flex") && !style.includes("display:flex")) return;
    if (el.closest("pre, code")) return;

    const children = Array.from(el.children) as Element[];
    const hasImages = children.every(
      (c: Element) => c.tagName === "IMG" || c.querySelector("img") !== null
    );

    if (hasImages && children.length >= 2) {
      const table = doc.createElement("table");
      table.setAttribute(
        "style",
        "width: 100%; border-collapse: collapse; margin: 16px 0; border: none !important;"
      );
      const tr = doc.createElement("tr");
      tr.setAttribute(
        "style",
        "border: none !important; background: transparent !important;"
      );
      children.forEach((child: Element) => {
        const td = doc.createElement("td");
        td.setAttribute(
          "style",
          "padding: 0 4px; vertical-align: top; border: none !important; background: transparent !important;"
        );
        const img = child.tagName === "IMG" ? child : child.querySelector("img");
        if (img) {
          const imgStyle = (img.getAttribute("style") || "").replace(
            /width:\s*[^;]+;?/g,
            ""
          );
          img.setAttribute(
            "style",
            imgStyle + " width: 100% !important; display: block; margin: 0 auto;"
          );
        }
        td.appendChild(child);
        tr.appendChild(td);
      });
      table.appendChild(tr);
      el.parentNode?.replaceChild(table, el);
    } else {
      el.setAttribute(
        "style",
        style.replace(/display:\s*flex;?/g, "display: block;")
      );
    }
  });

  // 3. 列表扁平化：微信对嵌套 li 内的 <p> 渲染有问题，替换为 <span>
  const listItems = doc.querySelectorAll("li");
  listItems.forEach((li: Element) => {
    const hasBlock = Array.from(li.children).some((c: Element) =>
      ["P", "DIV", "UL", "OL", "BLOCKQUOTE"].includes(c.tagName)
    );
    if (!hasBlock) return;
    li.querySelectorAll("p").forEach((p: Element) => {
      const span = doc.createElement("span");
      span.innerHTML = p.innerHTML;
      const pStyle = p.getAttribute("style");
      if (pStyle) span.setAttribute("style", pStyle);
      p.parentNode?.replaceChild(span, p);
    });
  });

  // 4. 字体继承强制：从容器样式中提取，给每个文本节点显式设置
  const fontMatch = containerStyle.match(/font-family:\s*([^;]+);/);
  const sizeMatch = containerStyle.match(/font-size:\s*([^;]+);/);
  const colorMatch = containerStyle.match(/(?<!-background-)color:\s*([^;]+);/);
  const lineHeightMatch = containerStyle.match(/line-height:\s*([^;]+);/);

  const textNodes = section.querySelectorAll(
    "p, li, h1, h2, h3, h4, h5, h6, blockquote, span"
  );
  textNodes.forEach((node: Element) => {
    if (node.tagName === "SPAN" && node.closest("pre, code")) return;
    let currentStyle = node.getAttribute("style") || "";
    if (fontMatch && !currentStyle.includes("font-family:"))
      currentStyle += ` font-family: ${fontMatch[1]};`;
    if (lineHeightMatch && !currentStyle.includes("line-height:"))
      currentStyle += ` line-height: ${lineHeightMatch[1]};`;
    if (
      sizeMatch &&
      !currentStyle.includes("font-size:") &&
      ["P", "LI", "BLOCKQUOTE", "SPAN"].includes(node.tagName)
    )
      currentStyle += ` font-size: ${sizeMatch[1]};`;
    if (colorMatch && !currentStyle.includes("color:"))
      currentStyle += ` color: ${colorMatch[1]};`;
    node.setAttribute("style", currentStyle.trim());
  });

  // 5. CJK 标点跟随：防止加粗/斜体后的标点被微信换行断开
  const inlineNodes = section.querySelectorAll("strong, b, em, span, a, code");
  inlineNodes.forEach((node: Element) => {
    const next = node.nextSibling;
    if (!next || next.nodeType !== 3) return;
    const text = next.textContent || "";
    const match = text.match(/^\s*([：；，。！？、:])(.*)$/s);
    if (!match) return;
    const punct = match[1];
    const rest = match[2] || "";
    node.appendChild(doc.createTextNode(punct));
    if (rest) next.textContent = rest;
    else next.parentNode?.removeChild(next);
  });

  // 6. 清理链接样式：移除 text-decoration:none 和 border-bottom
  // 微信编辑器需要链接有下划线（text-decoration: underline）才能正确渲染为可点击链接
  // border-bottom 在微信内联元素上不被支持，会被静默移除
  const links = section.querySelectorAll("a");
  links.forEach((a: Element) => {
    a.removeAttribute("target");
    a.removeAttribute("rel");
    const text = a.textContent || "";
    // 长链接（URL 等超长文本）：用 <pre><code> 滚动容器包裹
    // 微信对 <code> 的 overflow-x 支持最可靠（<section> 会被吞），复刻博主验证过的结构
    // 短链接保持折行，避免把普通描述性链接也撑出滚动条
    if (text.length > 40) {
      a.setAttribute("style", "color: #576b95; white-space: nowrap; word-break: keep-all;");
      const code = doc.createElement("code");
      code.setAttribute(
        "style",
        "display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; word-break: keep-all; padding: 12px; background: #fafafa; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; font-family: Operator Mono, Consolas, Monaco, Menlo, monospace; margin: 10px 0;"
      );
      const pre = doc.createElement("pre");
      pre.setAttribute("style", "margin: 0; padding: 0; background: transparent;");
      a.parentNode?.insertBefore(pre, a);
      code.appendChild(a);
      pre.appendChild(code);
    } else {
      a.setAttribute("style", "color: #576b95; overflow-wrap: break-word; word-break: break-all;");
    }
  });

  // 7. 外链图片转 Base64（仅"复制到剪贴板"流程需要，推送流程跳过以保留原始 URL）
  if (!options?.skipImageBase64) {
    const imgs = Array.from(section.querySelectorAll("img"));
    await Promise.all(
      imgs.map(async (imgEl) => {
        const img = imgEl as Element;
        const src = img.getAttribute("src");
        if (src && !src.startsWith("data:")) {
          const base64 = await convertImageToBase64(src);
          img.setAttribute("src", base64);
        }
      })
    );
  }

  // 最终字符串级别的 CJK 标点零宽连接符
  let outputHtml = section.outerHTML;
  outputHtml = outputHtml.replace(
    /(<\/(?:strong|b|em|span|a|code)>)\s*([：；，。！？、])/g,
    "$1⁠$2"
  );

  return outputHtml;
}
