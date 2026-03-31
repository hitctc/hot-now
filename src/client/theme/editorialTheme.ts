import { theme as antTheme, type ConfigProviderProps } from "ant-design-vue";

import type { ThemeMode } from "../composables/useTheme";

type ProviderThemeConfig = NonNullable<ConfigProviderProps["theme"]>;

const editorialThemeTokens = {
  light: {
    colorPrimary: "#2352ff",
    colorBgLayout: "#f4ede3",
    colorBgContainer: "#fbf7f1",
    colorText: "#13233c",
    colorTextSecondary: "#43546e",
    colorBorder: "rgba(19, 35, 60, 0.12)",
    colorBorderSecondary: "rgba(35, 82, 255, 0.22)",
    colorFillSecondary: "rgba(244, 237, 227, 0.88)",
    colorFillTertiary: "rgba(243, 236, 228, 0.96)",
    colorSplit: "rgba(19, 35, 60, 0.08)",
    colorSuccess: "#22624f",
    colorWarning: "#ff6a2a",
    colorError: "#b33a2c",
    borderRadius: 14,
    borderRadiusLG: 18,
    borderRadiusSM: 10,
    fontFamily: "\"Avenir Next\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
    fontSize: 14,
    controlHeight: 38,
    boxShadow: "0 24px 48px rgba(43, 59, 86, 0.14)",
    boxShadowSecondary: "0 18px 34px rgba(26, 42, 70, 0.08)"
  },
  dark: {
    colorPrimary: "#7ea2ff",
    colorBgLayout: "#111722",
    colorBgContainer: "#171f2c",
    colorText: "#eef3ff",
    colorTextSecondary: "#c4cedf",
    colorBorder: "rgba(255, 255, 255, 0.1)",
    colorBorderSecondary: "rgba(126, 162, 255, 0.28)",
    colorFillSecondary: "rgba(29, 38, 53, 0.88)",
    colorFillTertiary: "rgba(24, 33, 48, 0.96)",
    colorSplit: "rgba(255, 255, 255, 0.08)",
    colorSuccess: "#58c8a1",
    colorWarning: "#ff9b6d",
    colorError: "#ff8f80",
    borderRadius: 14,
    borderRadiusLG: 18,
    borderRadiusSM: 10,
    fontFamily: "\"Avenir Next\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
    fontSize: 14,
    controlHeight: 38,
    boxShadow: "0 24px 48px rgba(3, 8, 18, 0.48)",
    boxShadowSecondary: "0 18px 34px rgba(3, 8, 18, 0.34)"
  }
} as const;

export function buildEditorialTheme(mode: ThemeMode): ProviderThemeConfig {
  // Editorial Desk keeps the server shell's paper/deep-ink contrast, while Ant components consume the same semantic tokens.
  return {
    algorithm: mode === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: editorialThemeTokens[mode]
  };
}
