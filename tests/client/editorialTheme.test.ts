import { theme as antTheme } from "ant-design-vue";
import { describe, expect, it } from "vitest";

import {
  createEditorialCssVariables,
  createEditorialTailwindTheme,
  editorialTokens
} from "../../src/client/theme/editorialTokens";
import { createEditorialProviderTheme } from "../../src/client/theme/editorialTheme";

describe("editorial theme bridge", () => {
  it("shares the same light and dark tokens across css variables, Tailwind, and Ant Design Vue", () => {
    const lightCssVariables = createEditorialCssVariables("light");
    const darkCssVariables = createEditorialCssVariables("dark");
    const tailwindTheme = createEditorialTailwindTheme();
    const tailwindExtend = tailwindTheme.extend as {
      fontFamily?: { editorial?: string[]; "editorial-mono"?: string[] };
      maxWidth?: Record<string, string>;
      borderRadius?: Record<string, string>;
      colors?: { editorial?: Record<string, string> };
      backgroundImage?: Record<string, string>;
      boxShadow?: Record<string, string>;
    };
    const lightProviderTheme = createEditorialProviderTheme("light");
    const darkProviderTheme = createEditorialProviderTheme("dark");

    expect(lightCssVariables["--editorial-bg-page"]).toBe(editorialTokens.light.bgPage);
    expect(lightCssVariables["--editorial-accent"]).toBe(editorialTokens.light.accent);
    expect(lightCssVariables["--editorial-shadow-card"]).toBe(editorialTokens.light.shadowCard);
    expect(editorialTokens.light.bgPage).toBe("#fbfbfa");
    expect(editorialTokens.light.bgSidebarPanel).toBe("#f7f7f5");
    expect(editorialTokens.light.textMain).toBe("#37352f");
    expect(editorialTokens.light.border).toBe("rgba(55, 53, 47, 0.08)");
    expect(darkCssVariables["--editorial-bg-page"]).toBe(editorialTokens.dark.bgPage);
    expect(darkCssVariables["--editorial-accent"]).toBe(editorialTokens.dark.accent);
    expect(darkCssVariables["--editorial-shadow-card"]).toBe(editorialTokens.dark.shadowCard);
    expect(editorialTokens.dark.bgPage).toBe("#191919");
    expect(editorialTokens.dark.bgSidebarPanel).toBe("#202020");
    expect(editorialTokens.dark.textMain).toBe("#ffffff");
    expect(editorialTokens.dark.border).toBe("rgba(255, 255, 255, 0.1)");

    expect(tailwindExtend.fontFamily?.editorial).toEqual(["var(--editorial-font-ui)"]);
    expect(tailwindExtend.fontFamily?.["editorial-mono"]).toEqual(["var(--editorial-font-mono)"]);
    expect(tailwindExtend.maxWidth?.["editorial-shell"]).toBe("var(--editorial-shell-content-width)");
    expect(tailwindExtend.borderRadius?.["editorial-xl"]).toBe("var(--editorial-radius-xl)");
    expect(tailwindExtend.borderRadius?.["editorial-pill"]).toBe("var(--editorial-radius-pill)");
    expect(tailwindExtend.colors?.editorial?.accent).toBe("var(--editorial-accent)");
    expect(tailwindExtend.colors?.editorial?.["text-main"]).toBe("var(--editorial-text-main)");
    expect(tailwindExtend.backgroundImage?.["editorial-sidebar"]).toBe("var(--editorial-bg-sidebar)");
    expect(tailwindExtend.backgroundImage?.["editorial-link-active"]).toBe("var(--editorial-bg-link-active)");
    expect(tailwindExtend.boxShadow?.["editorial-card"]).toBe("var(--editorial-shadow-card)");

    expect(lightProviderTheme.algorithm).toBe(antTheme.defaultAlgorithm);
    expect(lightProviderTheme.token?.colorPrimary).toBe(editorialTokens.light.accent);
    expect(lightProviderTheme.token?.colorBgLayout).toBe(editorialTokens.light.bgPage);
    expect(lightProviderTheme.token?.colorBgContainer).toBe(editorialTokens.light.bgPanelStrong);
    expect(lightProviderTheme.token?.colorBgElevated).toBe(editorialTokens.light.bgPanel);
    expect(lightProviderTheme.token?.colorText).toBe(editorialTokens.light.textMain);
    expect(lightProviderTheme.token?.controlHeight).toBe(36);
    expect(lightProviderTheme.token?.borderRadiusSM).toBe(Number.parseFloat(editorialTokens.light.radiusSm));
    expect(lightProviderTheme.token?.borderRadius).toBe(Number.parseFloat(editorialTokens.light.radiusMd));
    expect(lightProviderTheme.token?.borderRadiusLG).toBe(Number.parseFloat(editorialTokens.light.radiusLg));
    expect(lightProviderTheme.token?.boxShadow).toBe(editorialTokens.light.shadowCard);

    expect(darkProviderTheme.algorithm).toBe(antTheme.darkAlgorithm);
    expect(darkProviderTheme.token?.colorPrimary).toBe(editorialTokens.dark.accent);
    expect(darkProviderTheme.token?.colorBgLayout).toBe(editorialTokens.dark.bgPage);
    expect(darkProviderTheme.token?.colorBgContainer).toBe(editorialTokens.dark.bgPanelStrong);
    expect(darkProviderTheme.token?.colorBgElevated).toBe(editorialTokens.dark.bgPanel);
    expect(darkProviderTheme.token?.colorText).toBe(editorialTokens.dark.textMain);
    expect(darkProviderTheme.token?.controlHeight).toBe(36);
    expect(darkProviderTheme.token?.borderRadiusSM).toBe(Number.parseFloat(editorialTokens.dark.radiusSm));
    expect(darkProviderTheme.token?.borderRadius).toBe(Number.parseFloat(editorialTokens.dark.radiusMd));
    expect(darkProviderTheme.token?.borderRadiusLG).toBe(Number.parseFloat(editorialTokens.dark.radiusLg));
    expect(darkProviderTheme.token?.boxShadow).toBe(editorialTokens.dark.shadowCard);
  });
});
