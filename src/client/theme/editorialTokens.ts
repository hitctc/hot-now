import type { Config } from "tailwindcss";

export type EditorialThemeMode = "dark" | "light";

export type EditorialThemeTokens = {
  fontUi: string;
  fontMono: string;
  shellContentWidth: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusXl: string;
  radiusPill: string;
  bgPage: string;
  bgPageGlowA: string;
  bgPageGlowB: string;
  bgPageGlowC: string;
  gridLine: string;
  scanline: string;
  bgSidebar: string;
  bgSidebarPanel: string;
  bgPanel: string;
  bgPanelStrong: string;
  bgControl: string;
  bgControlHover: string;
  bgLink: string;
  bgLinkActive: string;
  bgLinkActiveStrong: string;
  textMain: string;
  textBody: string;
  textMuted: string;
  textSidebar: string;
  textSidebarMuted: string;
  textOnAccent: string;
  accent: string;
  accentOrange: string;
  accentSoft: string;
  border: string;
  borderStrong: string;
  ring: string;
  success: string;
  warning: string;
  danger: string;
  shadowCard: string;
  shadowPage: string;
  shadowFloating: string;
  shadowAccent: string;
};

const editorialLightTokens = {
  fontUi: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  shellContentWidth: "1240px",
  radiusSm: "10px",
  radiusMd: "16px",
  radiusLg: "24px",
  radiusXl: "32px",
  radiusPill: "999px",
  bgPage: "#f4f7ff",
  bgPageGlowA: "radial-gradient(circle at 14% 16%, rgba(87, 144, 255, 0.24), transparent 28%)",
  bgPageGlowB: "radial-gradient(circle at 85% 18%, rgba(81, 220, 255, 0.20), transparent 24%)",
  bgPageGlowC: "radial-gradient(circle at 56% 78%, rgba(149, 111, 255, 0.16), transparent 28%)",
  gridLine: "linear-gradient(rgba(120, 146, 207, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(120, 146, 207, 0.08) 1px, transparent 1px)",
  scanline: "linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0) 100%)",
  bgSidebar: "linear-gradient(180deg, rgba(233, 240, 255, 0.92) 0%, rgba(245, 248, 255, 0.92) 100%)",
  bgSidebarPanel: "rgba(255, 255, 255, 0.6)",
  bgPanel: "rgba(255, 255, 255, 0.72)",
  bgPanelStrong: "rgba(255, 255, 255, 0.86)",
  bgControl: "rgba(255, 255, 255, 0.7)",
  bgControlHover: "rgba(255, 255, 255, 0.9)",
  bgLink: "rgba(77, 125, 255, 0.08)",
  bgLinkActive: "linear-gradient(135deg, rgba(89, 131, 255, 0.18), rgba(114, 225, 255, 0.12))",
  bgLinkActiveStrong: "rgba(88, 126, 255, 0.22)",
  textMain: "#10182a",
  textBody: "#36435f",
  textMuted: "#7081a4",
  textSidebar: "#18253f",
  textSidebarMuted: "#607498",
  textOnAccent: "#ffffff",
  accent: "#4d7dff",
  accentOrange: "#6f6bff",
  accentSoft: "rgba(77, 125, 255, 0.12)",
  border: "rgba(116, 144, 205, 0.18)",
  borderStrong: "rgba(92, 119, 190, 0.28)",
  ring: "rgba(77, 125, 255, 0.34)",
  success: "#2a9d8f",
  warning: "#d79b36",
  danger: "#df5f7c",
  shadowCard: "0 18px 44px rgba(31, 58, 120, 0.08)",
  shadowPage: "0 0 0 rgba(0, 0, 0, 0)",
  shadowFloating: "0 24px 60px rgba(25, 43, 92, 0.16)",
  shadowAccent: "0 16px 36px rgba(77, 125, 255, 0.18)"
} as const satisfies EditorialThemeTokens;

const editorialDarkTokens = {
  fontUi: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  shellContentWidth: "1240px",
  radiusSm: "10px",
  radiusMd: "16px",
  radiusLg: "24px",
  radiusXl: "32px",
  radiusPill: "999px",
  bgPage: "#0a1020",
  bgPageGlowA: "radial-gradient(circle at 16% 18%, rgba(72, 108, 255, 0.30), transparent 26%)",
  bgPageGlowB: "radial-gradient(circle at 84% 18%, rgba(81, 220, 255, 0.22), transparent 22%)",
  bgPageGlowC: "radial-gradient(circle at 62% 82%, rgba(148, 96, 255, 0.18), transparent 28%)",
  gridLine: "linear-gradient(rgba(130, 160, 225, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(130, 160, 225, 0.06) 1px, transparent 1px)",
  scanline: "linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 100%)",
  bgSidebar: "linear-gradient(180deg, rgba(12, 18, 34, 0.96) 0%, rgba(15, 22, 40, 0.96) 100%)",
  bgSidebarPanel: "rgba(17, 24, 42, 0.72)",
  bgPanel: "rgba(15, 22, 40, 0.76)",
  bgPanelStrong: "rgba(17, 24, 42, 0.9)",
  bgControl: "rgba(17, 25, 44, 0.74)",
  bgControlHover: "rgba(27, 38, 67, 0.9)",
  bgLink: "rgba(122, 162, 255, 0.10)",
  bgLinkActive: "linear-gradient(135deg, rgba(90, 128, 255, 0.24), rgba(81, 220, 255, 0.14))",
  bgLinkActiveStrong: "rgba(95, 130, 225, 0.22)",
  textMain: "#ffffff",
  textBody: "#d2dcf8",
  textMuted: "#8b9ac3",
  textSidebar: "#ffffff",
  textSidebarMuted: "#9eb0da",
  textOnAccent: "#ffffff",
  accent: "#7aa2ff",
  accentOrange: "#8d7bff",
  accentSoft: "rgba(122, 162, 255, 0.16)",
  border: "rgba(109, 132, 196, 0.26)",
  borderStrong: "rgba(128, 164, 255, 0.34)",
  ring: "rgba(122, 162, 255, 0.42)",
  success: "#6cd4b2",
  warning: "#ffbf63",
  danger: "#ff7f96",
  shadowCard: "0 18px 44px rgba(3, 7, 18, 0.34)",
  shadowPage: "0 0 0 rgba(0, 0, 0, 0)",
  shadowFloating: "0 28px 70px rgba(2, 8, 20, 0.4)",
  shadowAccent: "0 18px 44px rgba(88, 124, 255, 0.26)"
} as const satisfies EditorialThemeTokens;

export const editorialTokens = {
  light: editorialLightTokens,
  dark: editorialDarkTokens
} as const satisfies Record<EditorialThemeMode, EditorialThemeTokens>;

// 这个映射是 CSS 和 TS 共享的唯一变量名清单，后续只改 token 数据，不改这里的命名规则。
function buildEditorialCssVariableRecord(tokens: EditorialThemeTokens): Record<string, string> {
  return {
    "--editorial-font-ui": tokens.fontUi,
    "--editorial-font-mono": tokens.fontMono,
    "--editorial-shell-content-width": tokens.shellContentWidth,
    "--editorial-radius-sm": tokens.radiusSm,
    "--editorial-radius-md": tokens.radiusMd,
    "--editorial-radius-lg": tokens.radiusLg,
    "--editorial-radius-xl": tokens.radiusXl,
    "--editorial-radius-pill": tokens.radiusPill,
    "--editorial-bg-page": tokens.bgPage,
    "--editorial-bg-page-glow-a": tokens.bgPageGlowA,
    "--editorial-bg-page-glow-b": tokens.bgPageGlowB,
    "--editorial-bg-page-glow-c": tokens.bgPageGlowC,
    "--editorial-grid-line": tokens.gridLine,
    "--editorial-scanline": tokens.scanline,
    "--editorial-bg-sidebar": tokens.bgSidebar,
    "--editorial-bg-sidebar-panel": tokens.bgSidebarPanel,
    "--editorial-bg-panel": tokens.bgPanel,
    "--editorial-bg-panel-strong": tokens.bgPanelStrong,
    "--editorial-bg-control": tokens.bgControl,
    "--editorial-bg-control-hover": tokens.bgControlHover,
    "--editorial-bg-link": tokens.bgLink,
    "--editorial-bg-link-active": tokens.bgLinkActive,
    "--editorial-bg-link-active-strong": tokens.bgLinkActiveStrong,
    "--editorial-text-main": tokens.textMain,
    "--editorial-text-body": tokens.textBody,
    "--editorial-text-muted": tokens.textMuted,
    "--editorial-text-sidebar": tokens.textSidebar,
    "--editorial-text-sidebar-muted": tokens.textSidebarMuted,
    "--editorial-text-on-accent": tokens.textOnAccent,
    "--editorial-accent": tokens.accent,
    "--editorial-accent-orange": tokens.accentOrange,
    "--editorial-accent-soft": tokens.accentSoft,
    "--editorial-border": tokens.border,
    "--editorial-border-strong": tokens.borderStrong,
    "--editorial-ring": tokens.ring,
    "--editorial-success": tokens.success,
    "--editorial-warning": tokens.warning,
    "--editorial-danger": tokens.danger,
    "--editorial-shadow-card": tokens.shadowCard,
    "--editorial-shadow-page": tokens.shadowPage,
    "--editorial-shadow-floating": tokens.shadowFloating,
    "--editorial-shadow-accent": tokens.shadowAccent
  };
}

// 主题切换时，Vue 侧和 Tailwind 侧都只认这组 CSS 变量，不再自己拼颜色值。
export function createEditorialCssVariables(mode: EditorialThemeMode): Record<string, string> {
  return buildEditorialCssVariableRecord(editorialTokens[mode]);
}

// Tailwind 直接消费 CSS 变量，这样运行时切主题时不需要重新编译样式。
export function createEditorialTailwindTheme(): NonNullable<Config["theme"]> {
  return {
    extend: {
      fontFamily: {
        editorial: ['var(--editorial-font-ui)'],
        "editorial-mono": ['var(--editorial-font-mono)']
      },
      maxWidth: {
        "editorial-shell": 'var(--editorial-shell-content-width)'
      },
      borderRadius: {
        "editorial-sm": 'var(--editorial-radius-sm)',
        "editorial-md": 'var(--editorial-radius-md)',
        "editorial-lg": 'var(--editorial-radius-lg)',
        "editorial-xl": 'var(--editorial-radius-xl)',
        "editorial-pill": 'var(--editorial-radius-pill)'
      },
      colors: {
        editorial: {
          page: 'var(--editorial-bg-page)',
          'page-glow-a': 'var(--editorial-bg-page-glow-a)',
          'page-glow-b': 'var(--editorial-bg-page-glow-b)',
          'page-glow-c': 'var(--editorial-bg-page-glow-c)',
          'grid-line': 'var(--editorial-grid-line)',
          scanline: 'var(--editorial-scanline)',
          'sidebar-panel': 'var(--editorial-bg-sidebar-panel)',
          panel: 'var(--editorial-bg-panel)',
          'panel-strong': 'var(--editorial-bg-panel-strong)',
          control: 'var(--editorial-bg-control)',
          'control-hover': 'var(--editorial-bg-control-hover)',
          link: 'var(--editorial-bg-link)',
          'link-active-strong': 'var(--editorial-bg-link-active-strong)',
          'text-main': 'var(--editorial-text-main)',
          'text-body': 'var(--editorial-text-body)',
          'text-muted': 'var(--editorial-text-muted)',
          'text-sidebar': 'var(--editorial-text-sidebar)',
          'text-sidebar-muted': 'var(--editorial-text-sidebar-muted)',
          'text-on-accent': 'var(--editorial-text-on-accent)',
          accent: 'var(--editorial-accent)',
          'accent-orange': 'var(--editorial-accent-orange)',
          'accent-soft': 'var(--editorial-accent-soft)',
          border: 'var(--editorial-border)',
          'border-strong': 'var(--editorial-border-strong)',
          ring: 'var(--editorial-ring)',
          success: 'var(--editorial-success)',
          warning: 'var(--editorial-warning)',
          danger: 'var(--editorial-danger)'
        }
      },
      backgroundImage: {
        'editorial-sidebar': 'var(--editorial-bg-sidebar)',
        'editorial-link-active': 'var(--editorial-bg-link-active)'
      },
      boxShadow: {
        'editorial-card': 'var(--editorial-shadow-card)',
        'editorial-page': 'var(--editorial-shadow-page)',
        'editorial-floating': 'var(--editorial-shadow-floating)',
        'editorial-accent': 'var(--editorial-shadow-accent)'
      }
    }
  };
}
