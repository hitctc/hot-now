import { theme as antTheme, type ConfigProviderProps } from "ant-design-vue";

import { editorialTokens, type EditorialThemeMode } from "./editorialTokens";

type ProviderThemeConfig = NonNullable<ConfigProviderProps["theme"]>;

export type { EditorialThemeMode } from "./editorialTokens";

// Vue 壳和内容页都通过这个薄封装读取 token，避免再维护一份独立 palette。
export function readEditorialThemePalette(mode: EditorialThemeMode) {
  return editorialTokens[mode];
}

// AntD 的圆角 token 需要 number，这里统一从字符串 token 解析，避免再写死像素值。
function readRadiusTokenValue(radiusToken: string): number {
  return Number.parseFloat(radiusToken);
}

// ConfigProvider 只接收稳定的一层全局 token，组件细节再交给 CSS 变量和 scoped style 做收口。
export function createEditorialProviderTheme(mode: EditorialThemeMode): ProviderThemeConfig {
  const palette = readEditorialThemePalette(mode);
  const borderRadiusSM = readRadiusTokenValue(palette.radiusSm);
  const borderRadius = readRadiusTokenValue(palette.radiusMd);
  const borderRadiusLG = readRadiusTokenValue(palette.radiusLg);

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
      colorBgElevated: palette.bgPanel,
      colorFillAlter: palette.bgLinkActiveStrong,
      colorText: palette.textMain,
      colorTextSecondary: palette.textBody,
      colorTextTertiary: palette.textMuted,
      colorBorder: palette.border,
      colorBorderSecondary: palette.borderStrong,
      borderRadiusSM,
      borderRadius,
      borderRadiusLG,
      fontFamily: palette.fontUi,
      fontSize: 14,
      controlHeight: 36,
      boxShadow: palette.shadowCard,
      boxShadowSecondary: palette.shadowFloating,
      controlOutline: palette.ring
    }
  };
}
