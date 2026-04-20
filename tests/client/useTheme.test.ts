import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { editorialTokens } from "../../src/client/theme/editorialTokens";

describe("useTheme", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("boots the persisted theme before the app mounts without waiting for nextTick", async () => {
    window.localStorage.setItem("hot-now-theme", "light");

    const { bootstrapEditorialTheme, THEME_STORAGE_KEY } = await import("../../src/client/composables/useTheme");
    const lightTokens = editorialTokens.light;

    bootstrapEditorialTheme();

    expect(THEME_STORAGE_KEY).toBe("hot-now-theme");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--editorial-bg-page")).toBe(lightTokens.bgPage);
    expect(document.documentElement.style.getPropertyValue("--editorial-accent")).toBe(lightTokens.accent);
  });

  it("falls back to light theme when there is no stored preference", async () => {
    const { bootstrapEditorialTheme, useTheme, THEME_STORAGE_KEY } = await import("../../src/client/composables/useTheme");
    const theme = useTheme();
    const lightTokens = editorialTokens.light;

    bootstrapEditorialTheme();

    expect(THEME_STORAGE_KEY).toBe("hot-now-theme");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(theme.themeMode.value).toBe("light");
    expect(theme.isDarkMode.value).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--editorial-bg-page")).toBe(lightTokens.bgPage);
  });

  it("syncs the persisted theme mode with localStorage and document data-theme", async () => {
    window.localStorage.setItem("hot-now-theme", "light");

    const { bootstrapEditorialTheme, useTheme, THEME_STORAGE_KEY } = await import("../../src/client/composables/useTheme");
    const theme = useTheme();
    const lightTokens = editorialTokens.light;
    const darkTokens = editorialTokens.dark;

    bootstrapEditorialTheme();

    expect(THEME_STORAGE_KEY).toBe("hot-now-theme");
    expect(theme.themeMode.value).toBe("light");
    expect(theme.isDarkMode.value).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--editorial-bg-page")).toBe(lightTokens.bgPage);
    expect(document.documentElement.style.getPropertyValue("--editorial-accent")).toBe(lightTokens.accent);
    expect(theme.themeConfig.value.token?.colorPrimary).toBe(lightTokens.accent);
    expect(theme.themeConfig.value.token?.colorBgLayout).toBe(lightTokens.bgPage);
    expect(theme.themeConfig.value.token?.colorBgContainer).toBe(lightTokens.bgPanelStrong);
    expect(theme.themeConfig.value.token?.colorText).toBe(lightTokens.textMain);
    expect(theme.themeConfig.value.token?.borderRadiusSM).toBe(Number.parseFloat(lightTokens.radiusSm));
    expect(theme.themeConfig.value.token?.borderRadius).toBe(Number.parseFloat(lightTokens.radiusMd));
    expect(theme.themeConfig.value.token?.borderRadiusLG).toBe(Number.parseFloat(lightTokens.radiusLg));

    theme.setThemeMode("dark");
    await nextTick();

    expect(THEME_STORAGE_KEY).toBe("hot-now-theme");
    expect(theme.themeMode.value).toBe("dark");
    expect(theme.isDarkMode.value).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--editorial-bg-page")).toBe(darkTokens.bgPage);
    expect(document.documentElement.style.getPropertyValue("--editorial-accent")).toBe(darkTokens.accent);
    expect(theme.themeConfig.value.token?.colorPrimary).toBe(darkTokens.accent);
    expect(theme.themeConfig.value.token?.colorBgLayout).toBe(darkTokens.bgPage);
    expect(theme.themeConfig.value.token?.colorBgContainer).toBe(darkTokens.bgPanelStrong);
    expect(theme.themeConfig.value.token?.colorText).toBe(darkTokens.textMain);
    expect(theme.themeConfig.value.token?.borderRadiusSM).toBe(Number.parseFloat(darkTokens.radiusSm));
    expect(theme.themeConfig.value.token?.borderRadius).toBe(Number.parseFloat(darkTokens.radiusMd));
    expect(theme.themeConfig.value.token?.borderRadiusLG).toBe(Number.parseFloat(darkTokens.radiusLg));

    theme.toggleTheme();
    await nextTick();

    expect(theme.themeMode.value).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--editorial-bg-page")).toBe(lightTokens.bgPage);
  });
});
