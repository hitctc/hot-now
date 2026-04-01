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
  fontUi: '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  shellContentWidth: "1520px",
  radiusSm: "10px",
  radiusMd: "14px",
  radiusLg: "18px",
  radiusXl: "24px",
  radiusPill: "999px",
  bgPage: "#f4ede3",
  bgPageGlowA: "rgba(35, 82, 255, 0.08)",
  bgPageGlowB: "rgba(255, 106, 42, 0.07)",
  bgPageGlowC: "rgba(19, 35, 60, 0.05)",
  gridLine: "rgba(19, 35, 60, 0.03)",
  scanline: "rgba(255, 255, 255, 0.44)",
  bgSidebar: "linear-gradient(180deg, rgba(251, 247, 241, 0.98) 0%, rgba(244, 237, 227, 0.96) 100%)",
  bgSidebarPanel: "rgba(251, 247, 241, 0.94)",
  bgPanel: "rgba(251, 247, 241, 0.9)",
  bgPanelStrong: "rgba(255, 252, 247, 0.98)",
  bgControl: "rgba(244, 237, 227, 0.88)",
  bgControlHover: "rgba(236, 228, 218, 1)",
  bgLink: "rgba(35, 82, 255, 0.06)",
  bgLinkActive: "linear-gradient(135deg, #2352ff, #4d7aff)",
  bgLinkActiveStrong: "rgba(255, 255, 255, 0.28)",
  textMain: "#13233c",
  textBody: "#43546e",
  textMuted: "#6a7890",
  textSidebar: "#13233c",
  textSidebarMuted: "#6f7d92",
  textOnAccent: "#fdfaf5",
  accent: "#2352ff",
  accentOrange: "#ff6a2a",
  accentSoft: "rgba(35, 82, 255, 0.18)",
  border: "rgba(19, 35, 60, 0.12)",
  borderStrong: "rgba(35, 82, 255, 0.22)",
  ring: "rgba(35, 82, 255, 0.18)",
  success: "#22624f",
  warning: "#ff6a2a",
  danger: "#b33a2c",
  shadowCard: "0 18px 34px rgba(26, 42, 70, 0.08)",
  shadowPage: "0 24px 48px rgba(43, 59, 86, 0.14)",
  shadowFloating: "0 16px 30px rgba(43, 59, 86, 0.12)",
  shadowAccent: "0 0 0 1px rgba(35, 82, 255, 0.12), 0 14px 28px rgba(35, 82, 255, 0.16)"
} as const satisfies EditorialThemeTokens;

const editorialDarkTokens = {
  fontUi: '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  shellContentWidth: "1520px",
  radiusSm: "10px",
  radiusMd: "14px",
  radiusLg: "18px",
  radiusXl: "24px",
  radiusPill: "999px",
  bgPage: "#111722",
  bgPageGlowA: "rgba(126, 162, 255, 0.16)",
  bgPageGlowB: "rgba(255, 155, 109, 0.12)",
  bgPageGlowC: "rgba(238, 243, 255, 0.06)",
  gridLine: "rgba(255, 255, 255, 0.04)",
  scanline: "rgba(255, 255, 255, 0.03)",
  bgSidebar: "linear-gradient(180deg, rgba(17, 23, 34, 0.98) 0%, rgba(23, 31, 44, 0.96) 100%)",
  bgSidebarPanel: "rgba(23, 31, 44, 0.92)",
  bgPanel: "rgba(23, 31, 44, 0.9)",
  bgPanelStrong: "rgba(29, 38, 53, 0.98)",
  bgControl: "rgba(29, 38, 53, 0.88)",
  bgControlHover: "rgba(38, 49, 68, 0.98)",
  bgLink: "rgba(126, 162, 255, 0.09)",
  bgLinkActive: "linear-gradient(135deg, #7ea2ff, #557aff)",
  bgLinkActiveStrong: "rgba(17, 23, 34, 0.28)",
  textMain: "#eef3ff",
  textBody: "#c4cedf",
  textMuted: "#8f9bb2",
  textSidebar: "#eef3ff",
  textSidebarMuted: "#9ba8be",
  textOnAccent: "#0d1420",
  accent: "#7ea2ff",
  accentOrange: "#ff9b6d",
  accentSoft: "rgba(126, 162, 255, 0.22)",
  border: "rgba(255, 255, 255, 0.1)",
  borderStrong: "rgba(126, 162, 255, 0.28)",
  ring: "rgba(126, 162, 255, 0.24)",
  success: "#58c8a1",
  warning: "#ff9b6d",
  danger: "#ff8f80",
  shadowCard: "0 18px 34px rgba(3, 8, 18, 0.34)",
  shadowPage: "0 24px 48px rgba(3, 8, 18, 0.48)",
  shadowFloating: "0 16px 30px rgba(3, 8, 18, 0.34)",
  shadowAccent: "0 0 0 1px rgba(126, 162, 255, 0.14), 0 14px 28px rgba(59, 92, 170, 0.28)"
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
