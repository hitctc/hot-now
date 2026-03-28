import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const siteScript = readFileSync(new URL("../../src/server/public/site.js", import.meta.url), "utf8");

describe("site theme runtime", () => {
  it("boots from localStorage and keeps theme buttons in sync", () => {
    const dom = new JSDOM(
      `<!doctype html>
<html data-theme="dark">
  <body>
    <button type="button" data-theme-choice="dark" aria-pressed="true">深色模式</button>
    <button type="button" data-theme-choice="light" aria-pressed="false">浅色模式</button>
  </body>
</html>`,
      {
        url: "https://example.test/",
        runScripts: "outside-only"
      }
    );

    const { window } = dom;
    window.localStorage.setItem("hot-now-theme", "light");
    window.eval(siteScript);

    const darkButton = window.document.querySelector('[data-theme-choice="dark"]');
    const lightButton = window.document.querySelector('[data-theme-choice="light"]');

    expect(window.document.documentElement.dataset.theme).toBe("light");
    expect(darkButton?.getAttribute("aria-pressed")).toBe("false");
    expect(lightButton?.getAttribute("aria-pressed")).toBe("true");

    darkButton?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(window.document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("hot-now-theme")).toBe("dark");
    expect(darkButton?.getAttribute("aria-pressed")).toBe("true");
    expect(lightButton?.getAttribute("aria-pressed")).toBe("false");
  });
});
