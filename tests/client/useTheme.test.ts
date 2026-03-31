import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("useTheme", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("syncs the persisted theme mode with localStorage and document data-theme", async () => {
    window.localStorage.setItem("hot-now-theme", "light");

    const { useTheme, THEME_STORAGE_KEY } = await import("../../src/client/composables/useTheme");
    const theme = useTheme();

    await nextTick();

    expect(THEME_STORAGE_KEY).toBe("hot-now-theme");
    expect(theme.themeMode.value).toBe("light");
    expect(theme.isDarkMode.value).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(theme.themeConfig.value.token?.colorPrimary).toBe("#2352ff");
    expect(theme.themeConfig.value.token?.colorBgLayout).toBe("#f4ede3");
    expect(theme.themeConfig.value.token?.colorBgContainer).toBe("#fbf7f1");
    expect(theme.themeConfig.value.token?.colorText).toBe("#13233c");
    expect(theme.themeConfig.value.token?.borderRadius).toBe(14);

    theme.setThemeMode("dark");
    await nextTick();

    expect(theme.themeMode.value).toBe("dark");
    expect(theme.isDarkMode.value).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(theme.themeConfig.value.token?.colorPrimary).toBe("#7ea2ff");
    expect(theme.themeConfig.value.token?.colorBgLayout).toBe("#111722");
    expect(theme.themeConfig.value.token?.colorBgContainer).toBe("#171f2c");
    expect(theme.themeConfig.value.token?.colorText).toBe("#eef3ff");
    expect(theme.themeConfig.value.token?.borderRadius).toBe(14);

    theme.toggleTheme();
    await nextTick();

    expect(theme.themeMode.value).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
