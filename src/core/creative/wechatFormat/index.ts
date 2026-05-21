// 微信公众号格式化主入口
// 管线：Markdown → 预处理 → HTML → 主题注入 → 微信兼容 → 最终 HTML

import { renderMarkdownToWechatHtml } from "./renderer.js";
import { makeWechatCompatible } from "./wechatCompat.js";
import type { WechatThemeId } from "./themes.js";

export type { WechatThemeId };
export { themes } from "./themes.js";

// 将 Markdown 转换为微信公众号兼容的 HTML（兼容旧调用方）
export async function formatForWechat(
  markdown: string,
  themeId: WechatThemeId
): Promise<string> {
  const styledHtml = renderMarkdownToWechatHtml(markdown, themeId);
  return makeWechatCompatible(styledHtml);
}
