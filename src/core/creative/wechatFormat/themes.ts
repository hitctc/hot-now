// 微信公众号排版主题定义
// 每个主题的 styles 是 CSS 选择器 → 内联样式字符串的映射

export type WechatThemeId = "pure-white" | "warm-oat" | "dark-pro";

export interface WechatTheme {
  id: WechatThemeId;
  name: string;
  styles: Record<string, string>;
}

const baseFont = `-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif`;
const codeFont = `Menlo, Monaco, Consolas, "Courier New", monospace`;

export const themes: Record<WechatThemeId, WechatTheme> = {
  "pure-white": {
    id: "pure-white",
    name: "纯净白",
    styles: {
      container: `max-width: 100%; margin: 0 auto; padding: 24px 20px 48px 20px; font-family: ${baseFont}; font-size: 15px; line-height: 1.75 !important; color: #333333 !important; background-color: #ffffff !important; word-wrap: break-word;`,
      h1: "margin: 36px 0 20px; font-size: 22px; font-weight: 700; color: #1a1a1a; text-align: center;",
      h2: "margin: 30px 0 16px; font-size: 18px; font-weight: 700; color: #1a1a1a; padding-bottom: 10px; border-bottom: 1px solid #e8e8e8;",
      h3: "margin: 24px 0 12px; font-size: 16px; font-weight: 700; color: #333333;",
      h4: "margin: 20px 0 10px; font-size: 15px; font-weight: 700; color: #333333;",
      p: "margin: 0 0 16px; line-height: 1.75; color: #333333;",
      strong: "font-weight: 700; color: #1a1a1a;",
      em: "font-style: italic; color: #333333;",
      a: "color: #576b95; text-decoration: none; border-bottom: 1px solid #576b95;",
      blockquote: `margin: 16px 0; padding: 12px 16px; background: #f8f8f8; border-left: 3px solid #dddddd; border-radius: 4px; color: #666666;`,
      code: `font-family: ${codeFont}; font-size: 13px; padding: 2px 6px; background: #f6f8fa; color: #d73a49; border-radius: 3px;`,
      pre: `margin: 16px 0; padding: 16px; background: #f6f8fa; border-radius: 6px; overflow-x: auto; font-size: 13px;`,
      ul: `margin: 8px 0; padding-left: 24px; list-style-type: disc !important; list-style-position: outside;`,
      ol: `margin: 8px 0; padding-left: 24px; list-style-type: decimal !important; list-style-position: outside;`,
      li: "margin: 4px 0; line-height: 1.75; color: #333333;",
      hr: "margin: 24px 0; border: none; height: 1px; background-color: #e8e8e8;",
      img: "display: block; max-width: 100%; height: auto; margin: 20px auto; border-radius: 8px;",
      table: "width: 100%; margin: 16px 0; border-collapse: collapse; font-size: 14px;",
      th: "background: #f6f8fa; padding: 8px 12px; text-align: left; font-weight: 600; color: #333333; border: 1px solid #e8e8e8;",
      td: "padding: 8px 12px; border: 1px solid #e8e8e8; color: #333333;",
    },
  },
  "warm-oat": {
    id: "warm-oat",
    name: "燕麦暖色",
    styles: {
      container: `max-width: 100%; margin: 0 auto; padding: 24px 20px 48px 20px; font-family: ${baseFont}; font-size: 15px; line-height: 1.8 !important; color: #3d3226 !important; background-color: #faf8f5 !important; word-wrap: break-word;`,
      h1: "margin: 36px 0 20px; font-size: 22px; font-weight: 700; color: #2c2013; text-align: center;",
      h2: "margin: 30px 0 16px; font-size: 18px; font-weight: 700; color: #2c2013; padding-bottom: 10px; border-bottom: 1px solid #e0d5c7;",
      h3: "margin: 24px 0 12px; font-size: 16px; font-weight: 700; color: #4a3728;",
      h4: "margin: 20px 0 10px; font-size: 15px; font-weight: 700; color: #4a3728;",
      p: "margin: 0 0 16px; line-height: 1.8; color: #3d3226;",
      strong: "font-weight: 700; color: #2c2013;",
      em: "font-style: italic; color: #3d3226;",
      a: "color: #8b6914; text-decoration: none; border-bottom: 1px solid #8b6914;",
      blockquote: `margin: 16px 0; padding: 12px 16px; background: #f3ede4; border-left: 3px solid #c9b99a; border-radius: 4px; color: #7a6b57;`,
      code: `font-family: ${codeFont}; font-size: 13px; padding: 2px 6px; background: #efe9e0; color: #8b6914; border-radius: 3px;`,
      pre: `margin: 16px 0; padding: 16px; background: #efe9e0; border-radius: 6px; overflow-x: auto; font-size: 13px;`,
      ul: `margin: 8px 0; padding-left: 24px; list-style-type: disc !important; list-style-position: outside;`,
      ol: `margin: 8px 0; padding-left: 24px; list-style-type: decimal !important; list-style-position: outside;`,
      li: "margin: 4px 0; line-height: 1.8; color: #3d3226;",
      hr: "margin: 24px 0; border: none; height: 1px; background-color: #e0d5c7;",
      img: "display: block; max-width: 100%; height: auto; margin: 20px auto; border-radius: 8px;",
      table: "width: 100%; margin: 16px 0; border-collapse: collapse; font-size: 14px;",
      th: "background: #f3ede4; padding: 8px 12px; text-align: left; font-weight: 600; color: #3d3226; border: 1px solid #e0d5c7;",
      td: "padding: 8px 12px; border: 1px solid #e0d5c7; color: #3d3226;",
    },
  },
  "dark-pro": {
    id: "dark-pro",
    name: "暗夜 Pro",
    styles: {
      container: `max-width: 100%; margin: 0 auto; padding: 24px 20px 48px 20px; font-family: ${baseFont}; font-size: 15px; line-height: 1.75 !important; color: #e5e5e5 !important; background-color: #0a0a0a !important; word-wrap: break-word;`,
      h1: "margin: 36px 0 20px; font-size: 22px; font-weight: 700; color: #ffffff; text-align: center;",
      h2: "margin: 30px 0 16px; font-size: 18px; font-weight: 700; color: #ffffff; padding-bottom: 10px; border-bottom: 1px solid #262626;",
      h3: "margin: 24px 0 12px; font-size: 16px; font-weight: 700; color: #d4d4d4;",
      h4: "margin: 20px 0 10px; font-size: 15px; font-weight: 700; color: #d4d4d4;",
      p: "margin: 0 0 16px; line-height: 1.75; color: #e5e5e5;",
      strong: "font-weight: 700; color: #ffffff;",
      em: "font-style: italic; color: #e5e5e5;",
      a: "color: #60a5fa; text-decoration: none; border-bottom: 1px solid #60a5fa;",
      blockquote: `margin: 16px 0; padding: 12px 16px; background: #161616; border-left: 3px solid #404040; border-radius: 4px; color: #a3a3a3;`,
      code: `font-family: ${codeFont}; font-size: 13px; padding: 2px 6px; background: #1a1a1a; color: #60a5fa; border-radius: 3px;`,
      pre: `margin: 16px 0; padding: 16px; background: #1a1a1a; border-radius: 6px; overflow-x: auto; font-size: 13px;`,
      ul: `margin: 8px 0; padding-left: 24px; list-style-type: disc !important; list-style-position: outside;`,
      ol: `margin: 8px 0; padding-left: 24px; list-style-type: decimal !important; list-style-position: outside;`,
      li: "margin: 4px 0; line-height: 1.75; color: #e5e5e5;",
      hr: "margin: 24px 0; border: none; height: 1px; background-color: #262626;",
      img: "display: block; max-width: 100%; height: auto; margin: 20px auto; border-radius: 8px;",
      table: "width: 100%; margin: 16px 0; border-collapse: collapse; font-size: 14px;",
      th: "background: #161616; padding: 8px 12px; text-align: left; font-weight: 600; color: #e5e5e5; border: 1px solid #262626;",
      td: "padding: 8px 12px; border: 1px solid #262626; color: #e5e5e5;",
    },
  },
};
