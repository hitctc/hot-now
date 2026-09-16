import sharp from "sharp";

import type { CodeImageCardVariant } from "./codeImageCards.js";

export type CodeImageCardRenderInput = {
  variant: CodeImageCardVariant;
  title: string;
  thesis: string;
  keywords: string[];
  logoDataUri?: string;
};

const CANVAS_SIZE: Record<CodeImageCardVariant, { width: number; height: number }> = {
  "2.5:1": { width: 750, height: 300 },
  "1:1": { width: 750, height: 750 },
  "3:4": { width: 750, height: 1000 },
};

/** 将品牌模板渲染为压缩 PNG；所有文字和装饰均来自输入数据，不调用外部模型。 */
export async function renderCodeImageCard(input: CodeImageCardRenderInput): Promise<Buffer> {
  const size = CANVAS_SIZE[input.variant];
  const svg = buildSvg(input, size.width, size.height);
  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 9 })
    .toBuffer();
}

/** 返回固定比例的输出尺寸，供元数据和测试复用。 */
export function getCodeImageCardSize(variant: CodeImageCardVariant): { width: number; height: number } {
  return CANVAS_SIZE[variant];
}

function buildSvg(input: CodeImageCardRenderInput, width: number, height: number): string {
  const margin = Math.round(width * 0.08);
  const titleSize = input.variant === "2.5:1" ? 34 : 48;
  const titleLines = fitText(input.title, width - margin * 2, titleSize, input.variant === "2.5:1" ? 2 : input.variant === "1:1" ? 3 : 4, 24);
  const thesisLines = input.variant === "2.5:1"
    ? fitText(input.thesis, width * 0.54, 18, 2, 14)
    : fitText(input.thesis, width - margin * 2, 23, input.variant === "3:4" ? 4 : 3, 16);
  const keywordLines = input.keywords.slice(0, 3).map((keyword) => truncateByWidth(keyword, 145, 17));
  const titleY = input.variant === "2.5:1" ? Math.round(height * 0.18) : Math.round(height * 0.13);
  const thesisY = input.variant === "2.5:1"
    ? Math.round(height * 0.61)
    : Math.round(height * (input.variant === "3:4" ? 0.42 : 0.58));
  const keywordY = input.variant === "3:4" ? Math.round(height * 0.72) : Math.round(height * 0.78);
  const logoY = height - Math.round(height * 0.09);
  const keywordMarkup = input.variant === "2.5:1"
    ? ""
    : renderKeywordTags(keywordLines, margin, keywordY);
  const logoMarkup = input.logoDataUri
    ? `<image href="${input.logoDataUri}" x="${width - margin - 34}" y="${logoY - 23}" width="24" height="24" preserveAspectRatio="xMidYMid meet"/><text x="${width - margin - 4}" y="${logoY - 5}" text-anchor="end" class="logo">HotNow</text>`
    : `<text x="${width - margin}" y="${logoY}" text-anchor="end" class="logo">HotNow</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f8f5ff"/>
  <circle cx="${width - margin * 0.7}" cy="${margin * 0.8}" r="${Math.max(34, Math.round(width * 0.08))}" fill="#caa9fa" opacity="0.28"/>
  <path d="M${margin} ${height - margin * 0.8} H${Math.round(width * 0.38)}" stroke="#d8c0fc" stroke-width="3" stroke-linecap="round"/>
  <path d="M${Math.round(width * 0.68)} ${margin * 0.7} H${width - margin}" stroke="#e7c79a" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
  <style>
    text { font-family: PingFang SC, Noto Sans SC, sans-serif; fill: #1a1525; }
    .title { font-weight: 700; letter-spacing: -0.8px; }
    .thesis { font-weight: 500; fill: #51445f; }
    .keyword { font-weight: 600; fill: #5b3c86; }
    .logo { font-size: 16px; font-weight: 700; letter-spacing: 0.4px; }
  </style>
  ${renderTextLines(titleLines, margin, titleY, titleSize, "title", 1.2)}
  ${renderTextLines(thesisLines, input.variant === "2.5:1" ? margin : margin, thesisY, input.variant === "2.5:1" ? 18 : 23, "thesis", 1.45)}
  ${keywordMarkup}
  ${logoMarkup}
</svg>`;
}

function renderTextLines(lines: string[], x: number, y: number, fontSize: number, className: string, lineHeight: number): string {
  return lines.map((line, index) => `<text x="${x}" y="${Math.round(y + index * fontSize * lineHeight)}" font-size="${fontSize}" class="${className}" dominant-baseline="hanging">${escapeXml(line)}</text>`).join("");
}

function renderKeywordTags(keywords: string[], x: number, y: number): string {
  let cursor = x;
  return keywords.map((keyword) => {
    const width = Math.max(86, keyword.length * 17 + 28);
    const markup = `<rect x="${cursor}" y="${y}" width="${width}" height="34" rx="17" fill="#eadffc"/><text x="${cursor + width / 2}" y="${y + 9}" text-anchor="middle" font-size="17" class="keyword" dominant-baseline="hanging">${escapeXml(keyword)}</text>`;
    cursor += width + 12;
    return markup;
  }).join("");
}

function fitText(text: string, maxWidth: number, initialSize: number, maxLines: number, minSize: number): string[] {
  for (let size = initialSize; size >= minSize; size -= 2) {
    const lines = wrapText(text, maxWidth, size);
    if (lines.length <= maxLines) return lines;
  }
  const lines = wrapText(text, maxWidth, minSize).slice(0, maxLines);
  if (lines.length > 0) lines[lines.length - 1] = `${truncateByWidth(lines[lines.length - 1], maxWidth - 20, minSize)}…`;
  return lines;
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return ["暂无内容"];
  const lines: string[] = [];
  let line = "";
  let width = 0;
  for (const char of normalized) {
    const charWidth = /[\x00-\xff]/.test(char) ? fontSize * 0.55 : fontSize;
    if (line && width + charWidth > maxWidth) {
      lines.push(line);
      line = char;
      width = charWidth;
    } else {
      line += char;
      width += charWidth;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function truncateByWidth(text: string, maxWidth: number, fontSize: number): string {
  let result = "";
  let width = 0;
  for (const char of text.trim()) {
    const charWidth = /[\x00-\xff]/.test(char) ? fontSize * 0.55 : fontSize;
    if (width + charWidth > maxWidth) break;
    result += char;
    width += charWidth;
  }
  return result || text.trim().slice(0, 1);
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}
