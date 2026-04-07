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
  shellContentWidth: "1180px",
  radiusSm: "6px",
  radiusMd: "8px",
  radiusLg: "12px",
  radiusXl: "16px",
  radiusPill: "999px",
  bgPage: "#fbfbfa",
  bgPageGlowA: "transparent",
  bgPageGlowB: "transparent",
  bgPageGlowC: "transparent",
  gridLine: "transparent",
  scanline: "transparent",
  bgSidebar: "linear-gradient(180deg, #f7f7f5 0%, #f7f7f5 100%)",
  bgSidebarPanel: "#f7f7f5",
  bgPanel: "#ffffff",
  bgPanelStrong: "#ffffff",
  bgControl: "#ffffff",
  bgControlHover: "#f1f1ef",
  bgLink: "rgba(55, 53, 47, 0.04)",
  bgLinkActive: "linear-gradient(180deg, #ececea 0%, #ececea 100%)",
  bgLinkActiveStrong: "rgba(55, 53, 47, 0.06)",
  textMain: "#37352f",
  textBody: "#5f5e58",
  textMuted: "#8f8e88",
  textSidebar: "#37352f",
  textSidebarMuted: "#7b7a74",
  textOnAccent: "#ffffff",
  accent: "#2f2f2f",
  accentOrange: "#2f2f2f",
  accentSoft: "rgba(55, 53, 47, 0.08)",
  border: "rgba(55, 53, 47, 0.08)",
  borderStrong: "rgba(55, 53, 47, 0.14)",
  ring: "rgba(55, 53, 47, 0.16)",
  success: "#2f2f2f",
  warning: "#2f2f2f",
  danger: "#2f2f2f",
  shadowCard: "0 1px 2px rgba(15, 23, 42, 0.04)",
  shadowPage: "0 0 0 rgba(0, 0, 0, 0)",
  shadowFloating: "0 8px 24px rgba(15, 23, 42, 0.06)",
  shadowAccent: "0 0 0 1px rgba(55, 53, 47, 0.08)"
} as const satisfies EditorialThemeTokens;

const editorialDarkTokens = {
  fontUi: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  shellContentWidth: "1180px",
  radiusSm: "6px",
  radiusMd: "8px",
  radiusLg: "12px",
  radiusXl: "16px",
  radiusPill: "999px",
  bgPage: "#191919",
  bgPageGlowA: "transparent",
  bgPageGlowB: "transparent",
  bgPageGlowC: "transparent",
  gridLine: "transparent",
  scanline: "transparent",
  bgSidebar: "linear-gradient(180deg, #202020 0%, #202020 100%)",
  bgSidebarPanel: "#202020",
  bgPanel: "#202020",
  bgPanelStrong: "#202020",
  bgControl: "#202020",
  bgControlHover: "#2a2a2a",
  bgLink: "rgba(255, 255, 255, 0.04)",
  bgLinkActive: "linear-gradient(180deg, #2a2a2a 0%, #2a2a2a 100%)",
  bgLinkActiveStrong: "rgba(255, 255, 255, 0.06)",
  textMain: "#ffffff",
  textBody: "#d0d0cf",
  textMuted: "#9b9a97",
  textSidebar: "#ffffff",
  textSidebarMuted: "#9b9a97",
  textOnAccent: "#ffffff",
  accent: "#ffffff",
  accentOrange: "#ffffff",
  accentSoft: "rgba(255, 255, 255, 0.08)",
  border: "rgba(255, 255, 255, 0.1)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  ring: "rgba(255, 255, 255, 0.2)",
  success: "#ffffff",
  warning: "#ffffff",
  danger: "#ffffff",
  shadowCard: "0 1px 2px rgba(0, 0, 0, 0.24)",
  shadowPage: "0 0 0 rgba(0, 0, 0, 0)",
  shadowFloating: "0 10px 30px rgba(0, 0, 0, 0.28)",
  shadowAccent: "0 0 0 1px rgba(255, 255, 255, 0.08)"
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
