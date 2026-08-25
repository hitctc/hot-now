const INLINE_IMAGE_PATTERN = /!\[配图[^\]]*\]\(([^)]+)\)/g;
const COVER_IMAGE_PATTERN = /^!\[封面图[^\]]*\]\(([^)]+)\)/m;

function imageUrl(value: unknown): string {
  // 兼容数据库中既有的纯 URL 数组，以及带元数据的图片对象。
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "url" in value && typeof value.url === "string") {
    return value.url.trim();
  }
  return "";
}

function removeImageDescription(markdown: string, imageIndex: number): string {
  // 图片已落地后，描述占位符不能继续留在正文里，否则会被前端当成未完成配图。
  const pattern = new RegExp(`\\[IMAGE${imageIndex}_DESC(?::[^\\]]*)?\\]\\s*`, "g");
  return markdown.replace(pattern, "");
}

/** 替换 Markdown 中第 imageIndex 个正文图，保留其他图片槽位和正文顺序。 */
function replaceInlineImage(markdown: string, imageIndex: number, url: string): string {
  const placeholder = new RegExp(`\\[IMAGE${imageIndex}\\]`, "g");
  if (placeholder.test(markdown)) {
    return markdown.replace(placeholder, `![配图${imageIndex}](${url})`);
  }

  const matches = [...markdown.matchAll(INLINE_IMAGE_PATTERN)];
  const target = matches[imageIndex - 1];
  if (target?.index !== undefined) {
    return `${markdown.slice(0, target.index)}![配图${imageIndex}](${url})${markdown.slice(target.index + target[0].length)}`;
  }

  return `${markdown.trimEnd()}${markdown.trim() ? "\n\n" : ""}![配图${imageIndex}](${url})`;
}

/**
 * 把服务端已经保存的图片槽位合并回即将写入的旧正文。
 * 图片任务和浏览器自动保存可能交错到达，正文写入不能因此把已生成图片恢复成占位符。
 */
export function mergePublishedImages(
  currentMarkdown: string,
  incomingMarkdown: string,
  currentImages: unknown[] = [],
  currentCoverImages: string[] = [],
  preserveInlineImages = true,
): string {
  let merged = incomingMarkdown;
  if (preserveInlineImages) {
    const currentInlineImages = [...currentMarkdown.matchAll(INLINE_IMAGE_PATTERN)].map((match) => match[1]);
    const inlineCount = Math.max(currentImages.length, currentInlineImages.length);

    for (let index = 1; index <= inlineCount; index += 1) {
      const placeholder = new RegExp(`\\[IMAGE${index}\\]`, "g");
      // 只有旧正文仍带同编号占位符时才回填，明确提交的新图片 URL 不能被旧记录覆盖。
      if (!placeholder.test(merged)) continue;
      const url = imageUrl(currentImages[index - 1]) || imageUrl(currentInlineImages[index - 1]);
      if (!url) continue;
      merged = removeImageDescription(merged, index);
      merged = replaceInlineImage(merged, index, url);
    }
  }

  const currentCover = currentMarkdown.match(COVER_IMAGE_PATTERN)?.[1] || currentCoverImages[0];
  if (currentCover) {
    const coverLine = `![封面图](${currentCover})`;
    if (!COVER_IMAGE_PATTERN.test(merged)) merged = `${coverLine}\n\n${merged}`;
  }

  return merged;
}
