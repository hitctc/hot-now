import { theme as antTheme, type ConfigProviderProps } from "ant-design-vue";

import { editorialTokens, type EditorialThemeMode } from "./editorialTokens";

type ProviderThemeConfig = NonNullable<ConfigProviderProps["theme"]>;

export type { EditorialThemeMode } from "./editorialTokens";

export function readEditorialThemePalette(mode: EditorialThemeMode) {
  return editorialTokens[mode];
}

function readRadiusTokenValue(radiusToken: string): number {
  return Number.parseFloat(radiusToken);
}

// ConfigProvider 全局主题：Seed Token → Map Token → Alias Token 三层派生
// 编辑器主题色、背景、边框、圆角等通过 token 统一注入，不需要 CSS 覆写
export function createEditorialProviderTheme(mode: EditorialThemeMode): ProviderThemeConfig {
  const palette = readEditorialThemePalette(mode);
  const borderRadiusSM = readRadiusTokenValue(palette.radiusSm);
  const borderRadius = readRadiusTokenValue(palette.radiusMd);
  const borderRadiusLG = readRadiusTokenValue(palette.radiusLg);

  return {
    algorithm: mode === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      // Seed Token
      colorPrimary: palette.accent,
      colorInfo: palette.accent,
      colorSuccess: palette.success,
      colorWarning: palette.warning,
      colorError: palette.danger,
      colorTextBase: mode === "dark" ? "#ffffff" : "#10182a",
      colorBgBase: mode === "dark" ? "#0a1020" : "#ffffff",
      fontFamily: palette.fontUi,
      fontSize: 14,
      borderRadius,
      controlHeight: 36,
      lineWidth: 1,
      wireframe: false,

      // Map Token — 背景梯度
      colorBgLayout: palette.bgPage,
      colorBgContainer: palette.bgPanelStrong,
      colorBgElevated: palette.bgPanel,
      colorBgMask: mode === "dark" ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.3)",

      // Map Token — 边框
      colorBorder: palette.border,
      colorBorderSecondary: palette.borderStrong,

      // Map Token — 文本色梯度
      colorText: palette.textMain,
      colorTextSecondary: palette.textBody,
      colorTextTertiary: palette.textMuted,
      colorTextQuaternary: mode === "dark" ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.18)",

      // Alias Token — 圆角
      borderRadiusSM,
      borderRadiusLG,

      // Alias Token — 阴影
      boxShadow: palette.shadowCard,
      boxShadowSecondary: palette.shadowFloating,

      // Alias Token — 填充色
      colorFillAlter: palette.bgLinkActiveStrong,
      colorFill: mode === "dark" ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.08)",
      colorFillSecondary: mode === "dark" ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)",
      colorFillTertiary: mode === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)",

      // Alias Token — 交互态
      controlOutline: palette.ring,
      controlItemBgHover: mode === "dark" ? "rgba(122, 162, 255, 0.10)" : "rgba(77, 125, 255, 0.06)",
      controlItemBgActive: mode === "dark" ? "rgba(122, 162, 255, 0.16)" : "rgba(77, 125, 255, 0.10)",

      // Alias Token — 链接
      colorLink: palette.accent,
      colorLinkHover: mode === "dark" ? "#9dc4ff" : "#6b9aff",
      colorLinkActive: mode === "dark" ? "#5a80ff" : "#3d6ae6",
    },
    components: {
      Modal: {
        contentBg: palette.bgPanelStrong,
        headerBg: "transparent",
        titleColor: palette.textMain,
      } as Record<string, unknown>,
      Steps: {
        colorPrimary: palette.accent,
      } as Record<string, unknown>,
      Alert: {
        colorSuccess: palette.success,
        colorError: palette.danger,
        colorWarning: palette.warning,
        colorInfo: palette.accent,
      } as Record<string, unknown>,
      Tooltip: {
        colorBgSpotlight: mode === "dark" ? "rgba(18, 27, 49, 0.94)" : "rgba(255, 255, 255, 0.94)",
        colorTextLightSolid: palette.textMain,
      } as Record<string, unknown>,
    },
  };
}
