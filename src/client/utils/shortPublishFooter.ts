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

/** 将末尾互动段排成手写落款与双联字章，供实时及主题预览共用；只装饰DOM，不改原文或存储。 */
export function styleShortPublishFooter(doc: Document): void {
  const footer = doc.body.lastElementChild;
  if (footer?.tagName !== "P" || footer.textContent?.trim() !== SHORT_PUBLISH_FOOTER) return;
  const card = doc.createElement("section");
  card.setAttribute("data-short-publish-footer", "");
  card.setAttribute("style", "margin: 32px 0 12px; padding: 18px 0; border: none; background-color: transparent; text-align: center;");
  const font = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  footer.setAttribute("style", `display: inline-block; box-sizing: border-box; max-width: 100%; margin: 0; padding: 16px 12px 20px; border: none; border-radius: 3px; background-color: #edf3ff; background-image: linear-gradient(135deg, #ffffff 0%, #edf3ff 100%); color: #17325b; font-family: ${font}; font-size: 14px; font-weight: 400; line-height: 1.8; text-align: center; white-space: normal;`);
  footer.textContent = "";
  // 每段显式给定字体和颜色，避免公众号兼容处理用正文主题覆盖它们。
  // 标点也独立成段，防止微信把顿号和句号移进相邻字章；不用弹性布局、定位或外部字体。
  const parts = [
    { key: "request", text: "跪求", style: "margin-right: 8px; color: #52698d; font-family: 'Kaiti SC', STKaiti, KaiTi, serif; font-size: 14px; font-weight: 400; line-height: 1.8; letter-spacing: 2px; vertical-align: 2px;" },
    { key: "like", text: "点赞", style: `padding: 2px 10px 3px; border: 1px solid #bac9e2; border-radius: 4px; background-color: #ffffff; box-shadow: inset 0 -2px 0 #edf3ff, 0 3px 0 #bac9e2; color: #17325b; font-family: ${font}; font-size: 24px; font-weight: 800; line-height: 1.5; letter-spacing: 2px; vertical-align: 2px;` },
    { key: "separator", text: "、", style: `padding: 0 4px; color: #52698d; font-family: ${font}; font-size: 14px; font-weight: 400; line-height: 1.8; vertical-align: -2px;` },
    { key: "follow", text: "关注", style: `padding: 2px 10px 3px; border: 1px solid #2845b9; border-radius: 4px; background-color: #3459e6; box-shadow: inset 0 1px 0 #8098f2, 0 4px 0 #2845b9; color: #ffffff; font-family: ${font}; font-size: 24px; font-weight: 800; line-height: 1.5; letter-spacing: 2px; vertical-align: -2px;` },
    { key: "stop", text: "。", style: `color: #17325b; font-family: ${font}; font-size: 14px; font-weight: 400; line-height: 1.8; vertical-align: -2px;` },
  ];
  for (const part of parts) {
    const span = doc.createElement("span");
    span.setAttribute("data-footer-part", part.key);
    span.setAttribute("style", `display: inline-block; white-space: nowrap; ${part.style}`);
    span.textContent = part.text;
    footer.appendChild(span);
  }
  footer.replaceWith(card);
  card.appendChild(footer);
}
