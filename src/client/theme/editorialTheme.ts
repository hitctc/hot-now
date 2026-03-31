import { theme as antTheme, type ConfigProviderProps } from "ant-design-vue";

export type EditorialThemeMode = "dark" | "light";

type ProviderThemeConfig = NonNullable<ConfigProviderProps["theme"]>;

type EditorialThemePalette = {
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

const lightPalette = {
  fontUi: "\"Avenir Next\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
  fontMono: "\"SFMono-Regular\", Menlo, Monaco, Consolas, \"Liberation Mono\", monospace",
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
} as const satisfies EditorialThemePalette;

const darkPalette = {
  fontUi: "\"Avenir Next\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
  fontMono: "\"SFMono-Regular\", Menlo, Monaco, Consolas, \"Liberation Mono\", monospace",
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
} as const satisfies EditorialThemePalette;

const paletteByMode = {
  light: lightPalette,
  dark: darkPalette
} as const satisfies Record<EditorialThemeMode, EditorialThemePalette>;

// Vue 壳和后续内容页共享这一份主题调色板，避免颜色和阴影在多个文件里漂移。
export function readEditorialThemePalette(mode: EditorialThemeMode): EditorialThemePalette {
  return paletteByMode[mode];
}

function buildCssVarRecord(palette: EditorialThemePalette): Record<string, string> {
  return {
    "--editorial-font-ui": palette.fontUi,
    "--editorial-font-mono": palette.fontMono,
    "--editorial-shell-content-width": palette.shellContentWidth,
    "--editorial-radius-sm": palette.radiusSm,
    "--editorial-radius-md": palette.radiusMd,
    "--editorial-radius-lg": palette.radiusLg,
    "--editorial-radius-xl": palette.radiusXl,
    "--editorial-radius-pill": palette.radiusPill,
    "--editorial-bg-page": palette.bgPage,
    "--editorial-bg-page-glow-a": palette.bgPageGlowA,
    "--editorial-bg-page-glow-b": palette.bgPageGlowB,
    "--editorial-bg-page-glow-c": palette.bgPageGlowC,
    "--editorial-grid-line": palette.gridLine,
    "--editorial-scanline": palette.scanline,
    "--editorial-bg-sidebar": palette.bgSidebar,
    "--editorial-bg-sidebar-panel": palette.bgSidebarPanel,
    "--editorial-bg-panel": palette.bgPanel,
    "--editorial-bg-panel-strong": palette.bgPanelStrong,
    "--editorial-bg-control": palette.bgControl,
    "--editorial-bg-control-hover": palette.bgControlHover,
    "--editorial-bg-link": palette.bgLink,
    "--editorial-bg-link-active": palette.bgLinkActive,
    "--editorial-bg-link-active-strong": palette.bgLinkActiveStrong,
    "--editorial-text-main": palette.textMain,
    "--editorial-text-body": palette.textBody,
    "--editorial-text-muted": palette.textMuted,
    "--editorial-text-sidebar": palette.textSidebar,
    "--editorial-text-sidebar-muted": palette.textSidebarMuted,
    "--editorial-text-on-accent": palette.textOnAccent,
    "--editorial-accent": palette.accent,
    "--editorial-accent-orange": palette.accentOrange,
    "--editorial-accent-soft": palette.accentSoft,
    "--editorial-border": palette.border,
    "--editorial-border-strong": palette.borderStrong,
    "--editorial-ring": palette.ring,
    "--editorial-success": palette.success,
    "--editorial-warning": palette.warning,
    "--editorial-danger": palette.danger,
    "--editorial-shadow-card": palette.shadowCard,
    "--editorial-shadow-page": palette.shadowPage,
    "--editorial-shadow-floating": palette.shadowFloating,
    "--editorial-shadow-accent": palette.shadowAccent
  };
}

// 主题切换时把 token 直接写到 documentElement，保证 CSS 和 Ant Design Vue 始终吃到同一份值。
export function applyEditorialThemeCssVariables(
  mode: EditorialThemeMode,
  target: HTMLElement = document.documentElement
): void {
  for (const [name, value] of Object.entries(buildCssVarRecord(readEditorialThemePalette(mode)))) {
    target.style.setProperty(name, value);
  }
}

// ConfigProvider 只接收稳定的一层全局 token，组件细节再交给 CSS 变量和 scoped style 做收口。
export function createEditorialProviderTheme(mode: EditorialThemeMode): ProviderThemeConfig {
  const palette = readEditorialThemePalette(mode);

  return {
    algorithm: mode === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: palette.accent,
      colorInfo: palette.accent,
      colorSuccess: palette.success,
      colorWarning: palette.warning,
      colorError: palette.danger,
      colorBgLayout: palette.bgPage,
      colorBgContainer: palette.bgPanelStrong,
      colorBgElevated: palette.bgSidebarPanel,
      colorFillAlter: palette.bgControl,
      colorText: palette.textMain,
      colorTextSecondary: palette.textBody,
      colorTextTertiary: palette.textMuted,
      colorBorder: palette.border,
      colorBorderSecondary: palette.borderStrong,
      borderRadiusSM: 10,
      borderRadius: 14,
      borderRadiusLG: 18,
      fontFamily: palette.fontUi,
      fontSize: 14,
      controlHeight: 40,
      boxShadow: palette.shadowCard,
      boxShadowSecondary: palette.shadowFloating
    }
  };
}
