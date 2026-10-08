export const SHORT_PUBLISH_FOOTER = "跪求点赞、关注。";
const LEGACY_SHORT_PUBLISH_FOOTER = "跪求点赞、关注，谢谢你。";

/** 为短稿补新结尾，兼容移除末尾旧文案及重复结尾；长文、空稿和仅标题/封面占位不变，无网络或存储副作用。 */
export function appendShortPublishFooter(markdown: string, direction: string | undefined): string {
  if (direction !== "short_content") return markdown;
  const trimmed = markdown.trimEnd();
  const lines = trimmed.split(/\r?\n/);
  while ([SHORT_PUBLISH_FOOTER, LEGACY_SHORT_PUBLISH_FOOTER, ""].includes(lines.at(-1)?.trim() ?? "") && lines.length > 0) lines.pop();
  const content = lines.join("\n").trimEnd();
  // 与手动发布门禁保持相同空稿边界，结尾文案不能替代真实正文。
  const body = content
    .replace(/^!\[封面图[^\]]*\]\([^)]+\)\s*$/gm, "")
    .replace(/^\s*#\s+.+(?:\r?\n|$)/m, "")
    .replace(/^\s*\[IMAGE\d+\]\s*$/gm, "")
    .trim();
  if (!body) return markdown;
  return `${content}\n\n${SHORT_PUBLISH_FOOTER}`;
}

/** 将末尾互动段排成大字宣言海报，供实时及主题预览共用；只装饰DOM，不改原文或存储。 */
export function styleShortPublishFooter(doc: Document): void {
  const footer = doc.body.lastElementChild;
  if (footer?.tagName !== "P" || footer.textContent?.trim() !== SHORT_PUBLISH_FOOTER) return;
  const card = doc.createElement("section");
  card.setAttribute("data-short-publish-footer", "");
  card.setAttribute("style", "margin: 32px 0 12px; padding: 12px 8px 18px; border: none; background-color: transparent; text-align: center;");
  // 草稿接口对 section 末尾的 p 处理不稳定，改用嵌套 section 承载卡片，避免结尾整段丢失。
  const panel = doc.createElement("section");
  panel.setAttribute("data-footer-panel", "");
  const font = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  panel.setAttribute("style", `display: inline-block; box-sizing: border-box; width: 270px; max-width: 100%; margin: 0; padding: 18px 18px 22px; border: none; border-radius: 0; background-color: #172039; color: #ffffff; box-shadow: 6px 6px 0 #ff5b79; font-family: ${font}; font-size: 26px; font-weight: 800; line-height: 1.6; text-align: left; white-space: normal;`);
  // 每段显式给定字体和颜色，避免公众号兼容处理用正文主题覆盖它们。
  // 标点独立成段，避免兼容处理将其并入重点词；普通换行代替定位或弹性布局。
  // 标题带的切角是可降级的渐变，渐变和阴影被微信移除时，实色与大字仍成立。
  const parts = [
    { key: "request", text: "跪求", style: `margin: 0 0 16px; padding: 3px 16px 5px; background-color: #ff5b79; background-image: linear-gradient(135deg, #ffccd6 8px, #ff5b79 8px); color: #172039; font-family: ${font}; font-size: 36px; font-weight: 900; line-height: 1.35; letter-spacing: 5px; box-shadow: 3px 3px 0 #ffffff;` },
    { key: "like", text: "点赞", style: `padding-bottom: 2px; border-bottom: 4px solid #ff5b79; color: #ffffff; font-family: ${font}; font-size: 26px; font-weight: 800; line-height: 1.5; letter-spacing: 2px;` },
    { key: "separator", text: "、", style: `color: #ffffff; font-family: ${font}; font-size: 26px; font-weight: 800; line-height: 1.5;` },
    { key: "follow", text: "关注", style: `padding-bottom: 2px; border-bottom: 4px solid #ff5b79; color: #ff9db1; font-family: ${font}; font-size: 26px; font-weight: 800; line-height: 1.5; letter-spacing: 2px;` },
    { key: "stop", text: "。", style: `color: #ffffff; font-family: ${font}; font-size: 26px; font-weight: 800; line-height: 1.5;` },
  ];
  for (const part of parts) {
    const span = doc.createElement("span");
    span.setAttribute("data-footer-part", part.key);
    span.setAttribute("style", `display: inline-block; white-space: nowrap; ${part.style}`);
    span.textContent = part.text;
    panel.appendChild(span);
    if (part.key === "request") panel.appendChild(doc.createElement("br"));
  }
  footer.replaceWith(card);
  card.appendChild(panel);
}
