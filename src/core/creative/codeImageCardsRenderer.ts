import "../runtime/configureFontconfig.js";
import sharp from "sharp";

import type { CodeImageCardVariant } from "./codeImageCards.js";

export type CodeImageCardRenderInput = {
  variant: CodeImageCardVariant;
  title: string;
  thesis: string;
  keywords: string[];
  logoDataUri?: string;
};

/** 压缩后的文案行，以及生成这些行时实际使用的字号。 */
type FittedText = {
  lines: string[];
  fontSize: number;
};

const LOGICAL_CANVAS_SIZE: Record<CodeImageCardVariant, { width: number; height: number }> = {
  "2.5:1": { width: 750, height: 300 },
  "1:1": { width: 750, height: 750 },
  "3:4": { width: 750, height: 1000 },
};
const OUTPUT_SCALE = 2;
/** 半角字符宽度比例上限，用于保守换行；详见 `measureTextWidth`。 */
const HALF_WIDTH_RATIO = 0.62;
/** 标签胶囊的内边距和间距，配合 `measureTextWidth` 保证标签行不越界。 */
const KEYWORD_FONT_SIZE = 20;
const KEYWORD_PADDING_X = 17;
const KEYWORD_GAP = 14;

type VariantLayout = {
  margin: number;
  titleSize: number;
  titleMinSize: number;
  titleMaxLines: number;
  thesisSize: number;
  thesisMinSize: number;
  thesisMaxLines: number;
  titleY: number;
  thesisBaseY: number;
  keywordBaseY: number;
};

/** 三种比例的基础排版参数：外边距、字号、行数上限和纵向锚点。 */
const VARIANT_LAYOUT: Record<CodeImageCardVariant, VariantLayout> = {
  "2.5:1": { margin: 42, titleSize: 42, titleMinSize: 30, titleMaxLines: 2, thesisSize: 25, thesisMinSize: 20, thesisMaxLines: 2, titleY: 34, thesisBaseY: 132, keywordBaseY: 232 },
  "1:1": { margin: 58, titleSize: 54, titleMinSize: 38, titleMaxLines: 3, thesisSize: 30, thesisMinSize: 20, thesisMaxLines: 4, titleY: 70, thesisBaseY: 205, keywordBaseY: 400 },
  "3:4": { margin: 64, titleSize: 56, titleMinSize: 38, titleMaxLines: 4, thesisSize: 30, thesisMinSize: 20, thesisMaxLines: 5, titleY: 82, thesisBaseY: 330, keywordBaseY: 650 },
};

/** 将品牌模板渲染为压缩 PNG；所有文字和装饰均来自输入数据，不调用外部模型。 */
export async function renderCodeImageCard(input: CodeImageCardRenderInput): Promise<Buffer> {
  const size = getCodeImageCardLogicalSize(input.variant);
  const svg = buildSvg(input, size.width, size.height);
  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 9 })
    .toBuffer();
}

/** 返回固定比例的输出尺寸，供元数据和测试复用。 */
export function getCodeImageCardSize(variant: CodeImageCardVariant): { width: number; height: number } {
  const size = getCodeImageCardLogicalSize(variant);
  return { width: size.width * OUTPUT_SCALE, height: size.height * OUTPUT_SCALE };
}

/** 返回 SVG 排版使用的逻辑尺寸，供渲染器内部保持原有比例和坐标。 */
function getCodeImageCardLogicalSize(variant: CodeImageCardVariant): { width: number; height: number } {
  return LOGICAL_CANVAS_SIZE[variant];
}

/** 按三种画布比例排布标题、核心文案和标签，保证主体内容占据主要视觉区域。 */
function buildSvg(input: CodeImageCardRenderInput, width: number, height: number): string {
  const layout = VARIANT_LAYOUT[input.variant];
  const margin = layout.margin;
  const availableWidth = width - margin * 2;
  // 标题和正文都必须用 fitText 实际选中的字号绘制；
  // 用缩小前的字号绘制会让行宽超出换行时的计算宽度，在画布右侧被裁掉。
  const title = fitText(input.title, availableWidth, layout.titleSize, layout.titleMaxLines, layout.titleMinSize);
  const thesis = fitText(input.thesis, availableWidth, layout.thesisSize, layout.thesisMaxLines, layout.thesisMinSize);
  const thesisY = Math.max(
    layout.thesisBaseY,
    layout.titleY + title.lines.length * title.fontSize * 1.16 + 30,
  );
  // 横图高度只有 300，标签和标识都固定在底部，因此标签行不跟随正文下移。
  const keywordY = input.variant === "2.5:1"
    ? layout.keywordBaseY
    : Math.max(layout.keywordBaseY, thesisY + thesis.lines.length * thesis.fontSize * 1.35 + 36);
  const logoY = height - Math.round(height * 0.09);
  const keywordMarkup = renderKeywordTags(input.keywords, margin, keywordY, availableWidth);
  const logoMarkup = input.logoDataUri
    ? `<image href="${input.logoDataUri}" x="${width - margin - 34}" y="${logoY - 23}" width="24" height="24" preserveAspectRatio="xMidYMid meet"/><text x="${width - margin - 4}" y="${logoY - 5}" text-anchor="end" class="logo">HotNow</text>`
    : `<text x="${width - margin}" y="${logoY}" text-anchor="end" class="logo">HotNow</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * OUTPUT_SCALE}" height="${height * OUTPUT_SCALE}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f8f5ff"/>
  <circle cx="${width - margin * 0.7}" cy="${margin * 0.8}" r="${Math.max(34, Math.round(width * 0.08))}" fill="#caa9fa" opacity="0.28"/>
  <path d="M${margin} ${input.variant === "2.5:1" ? height - 14 : height - margin * 0.8} H${Math.round(width * 0.38)}" stroke="#d8c0fc" stroke-width="3" stroke-linecap="round"/>
  <path d="M${Math.round(width * 0.68)} ${margin * 0.7} H${width - margin}" stroke="#e7c79a" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
  <style>
    text { font-family: "Noto Sans SC", "PingFang SC", sans-serif; fill: #1a1525; }
    .title { font-weight: 700; letter-spacing: -0.8px; }
    .thesis { font-weight: 400; fill: #51445f; }
    .keyword { font-weight: 400; fill: #5b3c86; }
    .logo { font-size: 18px; font-weight: 400; letter-spacing: 0.4px; }
  </style>
  ${renderTextLines(title.lines, margin, layout.titleY, title.fontSize, "title", 1.16)}
  ${renderTextLines(thesis.lines, margin, thesisY, thesis.fontSize, "thesis", 1.35)}
  ${keywordMarkup}
  ${logoMarkup}
</svg>`;
}

/** 按行输出 SVG 文本；行宽已在上游换行阶段保证不越过可用宽度。 */
function renderTextLines(
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  className: string,
  lineHeight: number,
): string {
  return lines.map((line, index) => `<text x="${x}" y="${Math.round(y + index * fontSize * lineHeight)}" font-size="${fontSize}" class="${className}" dominant-baseline="hanging">${escapeXml(line)}</text>`).join("");
}

/** 渲染标签胶囊；胶囊宽度由保守文本宽度推导，放不下时直接跳过而不是越界。 */
function renderKeywordTags(keywords: string[], x: number, y: number, maxWidth: number): string {
  let cursor = x;
  const parts: string[] = [];
  for (const keyword of keywords.slice(0, 3)) {
    const label = truncateByWidth(keyword, 180, KEYWORD_FONT_SIZE);
    const width = Math.max(104, Math.round(measureTextWidth(label, KEYWORD_FONT_SIZE)) + KEYWORD_PADDING_X * 2);
    if (cursor + width > x + maxWidth) break;
    parts.push(`<rect x="${cursor}" y="${y}" width="${width}" height="42" rx="21" fill="#eadffc"/><text x="${Math.round(cursor + width / 2)}" y="${y + 10}" text-anchor="middle" font-size="${KEYWORD_FONT_SIZE}" class="keyword" dominant-baseline="hanging">${escapeXml(label)}</text>`);
    cursor += width + KEYWORD_GAP;
  }
  return parts.join("");
}

/**
 * 将文案压缩到指定宽度和行数，并返回换行时实际选中的字号。
 * 调用方必须用返回的 `fontSize` 绘制，否则会按初始字号渲染出比换行宽度更宽的文字。
 * 行数仍超限时只截断末行并补省略号，保证每一行都不越过 `maxWidth`。
 */
function fitText(text: string, maxWidth: number, initialSize: number, maxLines: number, minSize: number): FittedText {
  for (let size = initialSize; size >= minSize; size -= 2) {
    const lines = wrapText(text, maxWidth, size);
    if (lines.length <= maxLines) return { lines, fontSize: size };
  }
  const lines = wrapText(text, maxWidth, minSize).slice(0, maxLines);
  if (lines.length === 0) return { lines, fontSize: minSize };
  const lastIndex = lines.length - 1;
  const ellipsisWidth = measureTextWidth("…", minSize);
  lines[lastIndex] = `${truncateByWidth(lines[lastIndex], maxWidth - ellipsisWidth, minSize)}…`;
  return { lines, fontSize: minSize };
}

/**
 * 按保守字符宽度做硬换行，保证每一行都不超过 `maxWidth`。
 * 中文标点不允许靠“轻微超出”续行，否则 librsvg 会直接把它画到画布外。
 */
function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const characters = [...text.trim().replace(/\s+/g, " ")];
  const lines: string[] = [];
  let index = 0;
  while (index < characters.length) {
    let width = 0;
    let end = index;
    while (end < characters.length) {
      const nextWidth = width + measureTextWidth(characters[end], fontSize);
      // 至少消费一个字符，避免单字宽于可用宽度时无法推进。
      if (nextWidth > maxWidth && end > index) break;
      width = nextWidth;
      end += 1;
    }
    // 避头尾：下一字符是禁则标点时，把本行末字一起下移，而不是让标点越界。
    if (end < characters.length && end - index > 1 && isNonBreakingPunctuation(characters[end])) {
      end -= 1;
    }
    lines.push(characters.slice(index, end).join(""));
    index = end;
  }
  return lines;
}

function isNonBreakingPunctuation(char: string): boolean {
  return "，。！？；：、）》】』”’」』】》〉〕］）)]}>".includes(char);
}

function truncateByWidth(text: string, maxWidth: number, fontSize: number): string {
  let result = "";
  let width = 0;
  for (const char of text.trim()) {
    const charWidth = measureTextWidth(char, fontSize);
    if (width + charWidth > maxWidth) break;
    result += char;
    width += charWidth;
  }
  return result || text.trim().slice(0, 1);
}

/**
 * 字符宽度的保守上限。
 * 中文按整字宽（实测 Noto Sans SC 约 0.92em，取 1em 留出余量），
 * 英文数字按 0.62em（实测约 0.48em），确保估算永远不小于实际绘制宽度。
 */
function measureTextWidth(text: string, fontSize: number): number {
  return [...text].reduce((total, char) => total + (/[\x00-\xff]/.test(char) ? fontSize * HALF_WIDTH_RATIO : fontSize), 0);
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}
