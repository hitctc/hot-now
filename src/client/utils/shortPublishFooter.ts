export const SHORT_PUBLISH_FOOTER = "跪求点赞、关注。";
const LEGACY_SHORT_PUBLISH_FOOTER = "跪求点赞、关注，谢谢你。";

/** 为短稿补新结尾，兼容移除末尾旧文案及重复结尾；长文、空稿和仅标题/封面占位不变，无网络或存储副作用。 */
export function appendShortPublishFooter(markdown: string, direction: string | undefined): string {
  if (direction !== "short_content") return markdown;
  const trimmed = markdown.trimEnd();
  // 旧稿可能把尾注拆成硬换行或独立段落；先统一去重，再补回唯一标准文案。
  const content = trimmed.replace(/(?:跪求\s*点赞、关注(?:，谢谢你)?。\s*)+$/u, "").trimEnd();
  // 与手动发布门禁保持相同空稿边界，结尾文案不能替代真实正文。
  const body = content
    .replace(/^!\[封面图[^\]]*\]\([^)]+\)\s*$/gm, "")
    .replace(/^\s*#\s+.+(?:\r?\n|$)/m, "")
    .replace(/^\s*\[IMAGE\d+\]\s*$/gm, "")
    .trim();
  if (!body) return markdown;
  return `${content}\n\n${SHORT_PUBLISH_FOOTER}`;
}

/** 将末尾互动文案整理为单段可编辑文字，仅保留居中、强调色和加粗；只改预览 DOM，不改原文或存储。 */
export function styleShortPublishFooter(doc: Document): void {
  const expected = SHORT_PUBLISH_FOOTER.replace(/\s/g, "");
  const paragraphs: HTMLParagraphElement[] = [];
  let combined = "";
  let cursor = doc.body.lastElementChild;
  while (cursor?.tagName === "P" && paragraphs.length < 4) {
    const text = (cursor.textContent ?? "").replace(/\s/g, "");
    const candidate = `${text}${combined}`;
    if (!expected.endsWith(candidate)) break;
    paragraphs.unshift(cursor as HTMLParagraphElement);
    combined = candidate;
    if (combined === expected) break;
    cursor = cursor.previousElementSibling;
  }
  if (combined !== expected) return;
  const footer = doc.createElement("p");
  footer.setAttribute("data-short-publish-footer", "");
  footer.setAttribute("style", "margin: 16px 0; color: #b34c57; font-weight: 700; text-align: center;");
  footer.textContent = SHORT_PUBLISH_FOOTER;
  paragraphs[0].replaceWith(footer);
  paragraphs.slice(1).forEach(paragraph => paragraph.remove());
}
