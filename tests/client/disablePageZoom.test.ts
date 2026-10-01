import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { disablePageZoom } from "../../src/client/utils/disablePageZoom.js";

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

/** 用给定手指数构造可被 preventDefault 观察的触摸事件。 */
function touchEvent(type: string, touches: number): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, "touches", { value: Array.from({ length: touches }, () => ({})) });
  return event;
}

it("拦截 iOS 手势缩放事件和多指触摸，但不影响单指滚动", () => {
  cleanup = disablePageZoom(document);

  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    const event = new Event(type, { cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented, `${type} 应被拦截`).toBe(true);
  }

  const twoFingers = touchEvent("touchmove", 2);
  document.dispatchEvent(twoFingers);
  expect(twoFingers.defaultPrevented, "双指移动应被拦截").toBe(true);

  const oneFinger = touchEvent("touchmove", 1);
  document.dispatchEvent(oneFinger);
  expect(oneFinger.defaultPrevented, "单指移动不应被拦截，否则页面无法滚动").toBe(false);
});

it("解绑后不再拦截，避免影响后续页面行为", () => {
  const release = disablePageZoom(document);
  release();

  const event = new Event("gesturestart", { cancelable: true });
  document.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});

describe("全局禁止缩放的静态契约", () => {
  /** 每个 HTML 入口都必须声明不可缩放，否则该页仍可手势放大。 */
  const htmlSources = [
    "src/client/index.html",
    "src/server/renderAppLayout.ts",
    "src/server/renderPages.ts",
    "src/server/routes/sitePageSystemHelpers.ts",
    "src/server/routes/sitePageAssetHelpers.ts",
  ];

  it.each(htmlSources)("%s 声明了不可缩放的 viewport", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    const metas = source.match(/<meta name="viewport"[^>]*>/g) ?? [];
    expect(metas.length).toBeGreaterThan(0);
    for (const meta of metas) {
      expect(meta).toContain("maximum-scale=1.0");
      expect(meta).toContain("user-scalable=no");
    }
  });

  it("全局样式用 touch-action 关闭双指缩放，同时保留单指滑动", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/client/styles/tailwind.css"), "utf8");
    expect(styles).toMatch(/html\s*\{[^}]*touch-action: pan-x pan-y;/);
  });

  it("应用入口与站点脚本都安装手势拦截", () => {
    const mainSource = readFileSync(resolve(process.cwd(), "src/client/main.ts"), "utf8");
    expect(mainSource).toContain("disablePageZoom()");
    const siteScript = readFileSync(resolve(process.cwd(), "src/server/public/site.js"), "utf8");
    expect(siteScript).toContain("gesturestart");
    const loginPage = readFileSync(resolve(process.cwd(), "src/server/routes/sitePageSystemHelpers.ts"), "utf8");
    expect(loginPage).toContain("gesturestart");
  });
});
