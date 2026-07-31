export type FinishedArticleDirection = "article" | "short_content";

const PLACEHOLDER_PATTERN = /\[IMAGE(\d+)\]/gi;
const INLINE_IMAGE_PATTERN = /!\[配图[^\]]*\]\([^)]+\)/g;

/**
 * 为首次生成正文配图提示词规划稳定位置；已有占位符或配图时保持正文原样。
 */
export function planInlineImagePlaceholders(
  markdown: string,
  direction: FinishedArticleDirection
): { markdown: string; count: number; changed: boolean } {
  const existingCount = countExistingInlineSlots(markdown);
  if (existingCount > 0) {
    return { markdown, count: existingCount, changed: false };
  }

  const paragraphs = markdown.split(/\n{2,}/);
  const candidates = paragraphs
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => {
      const value = text.trim();
      return value.length >= 20
        && !value.startsWith("# ")
        && !value.startsWith(">")
        && !value.startsWith("![");
    });
  if (candidates.length === 0) {
    return { markdown, count: 0, changed: false };
  }

  const textLength = markdown.replace(/\s/g, "").length;
  const maxCount = direction === "short_content" ? 2 : 4;
  const charsPerImage = direction === "short_content" ? 350 : 700;
  const targetCount = Math.min(maxCount, candidates.length, Math.max(1, Math.ceil(textLength / charsPerImage)));
  const selectedParagraphIndexes = new Set<number>();
  for (let slot = 1; slot <= targetCount; slot += 1) {
    const candidateIndex = Math.min(
      candidates.length - 1,
      Math.max(0, Math.floor((slot * candidates.length) / (targetCount + 1)))
    );
    selectedParagraphIndexes.add(candidates[candidateIndex].index);
  }

  let imageIndex = 0;
  const planned: string[] = [];
  paragraphs.forEach((paragraph, index) => {
    planned.push(paragraph);
    if (selectedParagraphIndexes.has(index)) {
      imageIndex += 1;
      planned.push(`[IMAGE${imageIndex}]`);
    }
  });

  return { markdown: planned.join("\n\n"), count: imageIndex, changed: imageIndex > 0 };
}

/**
 * 生成提示词时把已有配图临时还原成占位符；该副本不会写回正文。
 */
export function buildInlinePromptSource(markdown: string): string {
  let imageIndex = 0;
  return markdown.replace(INLINE_IMAGE_PATTERN, () => {
    imageIndex += 1;
    return `[IMAGE${imageIndex}]`;
  });
}

function countExistingInlineSlots(markdown: string): number {
  const placeholderIndexes = [...markdown.matchAll(PLACEHOLDER_PATTERN)].map((match) => Number(match[1]));
  const imageCount = [...markdown.matchAll(INLINE_IMAGE_PATTERN)].length;
  return Math.max(imageCount, ...placeholderIndexes, 0);
}
