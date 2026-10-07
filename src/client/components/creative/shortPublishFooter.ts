const SHORT_PUBLISH_FOOTER = "跪求点赞、关注，谢谢你。";

/** 为短内容发布正文补一个独立结尾段；长文、空稿及仅标题/封面占位不变，不写入存储或调用接口。 */
export function appendShortPublishFooter(markdown: string, direction: string | undefined): string {
  if (direction !== "short_content") return markdown;
  const trimmed = markdown.trimEnd();
  const lines = trimmed.split(/\r?\n/);
  if (lines.at(-1)?.trim() === SHORT_PUBLISH_FOOTER) lines.pop();
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
