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

/** 装饰文档末尾的独立互动段，供实时及主题预览共用；只修改传入DOM，不改变Markdown或存储。 */
export function styleShortPublishFooter(doc: Document): void {
  const footer = doc.body.lastElementChild;
  if (footer?.tagName !== "P" || footer.textContent?.trim() !== SHORT_PUBLISH_FOOTER) return;
  const card = doc.createElement("section");
  card.setAttribute("data-short-publish-footer", "");
  card.setAttribute("style", "margin: 24px 0 8px; padding: 14px 16px; border: 2px solid #7c3aed; border-left: 6px solid #f59e0b; border-radius: 12px; background-color: #f5f3ff; text-align: center; box-shadow: 3px 3px 0 #ddd6fe;");
  footer.textContent = SHORT_PUBLISH_FOOTER;
  footer.setAttribute("style", "margin: 0; padding: 0; color: #5b21b6; background-color: transparent; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 19px; font-weight: 800; line-height: 1.6; letter-spacing: 2px; text-align: center;");
  footer.replaceWith(card);
  card.appendChild(footer);
}
