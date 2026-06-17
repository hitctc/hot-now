import type MarkdownIt from "markdown-it";

// 给 block 级 token 注入 data-source-line / data-source-end 属性，
// 让预览 HTML 的每个块都能反查到它对应的源码行号（用于编辑区/预览区按行对齐）。
// markdown-it 的 block token 带 .map = [startLine, endLine]（0 索引），这里转成 1 索引。
const BLOCK_TOKENS_WITH_MAP = [
  "paragraph_open",
  "heading_open",
  "bullet_list_open",
  "ordered_list_open",
  "list_item_open",
  "blockquote_open",
  "fence",
  "code_block",
  "hr",
  "table_open",
  "html_block",
];

export function injectSourceLineTracking(md: MarkdownIt): void {
  for (const name of BLOCK_TOKENS_WITH_MAP) {
    const original = md.renderer.rules[name];
    md.renderer.rules[name] = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token.map) {
        token.attrSet("data-source-line", String(token.map[0] + 1));
        token.attrSet("data-source-end", String(token.map[1] ?? token.map[0] + 1));
      }
      return original ? original(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    };
  }
}
