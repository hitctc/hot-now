import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

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

  it("toggles the mobile system drawer and closes it on outside and navigation clicks", () => {
    const dom = new JSDOM(
      `<!doctype html>
<html data-theme="dark">
  <body>
    <button type="button" data-theme-choice="dark" aria-pressed="true">深色模式</button>
    <button type="button" data-theme-choice="light" aria-pressed="false">浅色模式</button>
    <div class="mobile-top-nav">
      <div class="mobile-top-nav-bar">
        <div class="mobile-top-nav-tabs" aria-label="内容菜单">
          <a class="mobile-top-tab mobile-top-tab--content" href="/"><span>热点</span></a>
        </div>
        <button
          type="button"
          class="mobile-top-system-toggle"
          data-mobile-system-toggle
          aria-expanded="false"
          aria-controls="mobile-system-drawer"
        >
          系统菜单
        </button>
      </div>
      <nav id="mobile-system-drawer" class="mobile-system-drawer" hidden aria-label="系统菜单">
        <a class="nav-link nav-link--system" href="/settings/view-rules">筛选策略</a>
      </nav>
    </div>
    <main>
      <button type="button" data-role="outside-hit">正文区域</button>
    </main>
  </body>
</html>`,
      {
        url: "https://example.test/",
        runScripts: "outside-only"
      }
    );

    const { window } = dom;
    window.eval(siteScript);

    const toggle = window.document.querySelector("[data-mobile-system-toggle]");
    const drawer = window.document.querySelector("#mobile-system-drawer");
    const contentTab = window.document.querySelector(".mobile-top-tab--content");
    const drawerLink = window.document.querySelector("#mobile-system-drawer a");
    const outsideHit = window.document.querySelector('[data-role="outside-hit"]');
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(drawer?.hasAttribute("hidden")).toBe(true);

    toggle?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(drawer?.hasAttribute("hidden")).toBe(false);

    toggle?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(drawer?.hasAttribute("hidden")).toBe(true);

    toggle?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(drawer?.hasAttribute("hidden")).toBe(false);

    outsideHit?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(drawer?.hasAttribute("hidden")).toBe(true);

    toggle?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(drawer?.hasAttribute("hidden")).toBe(false);

    contentTab?.addEventListener("click", (event) => event.preventDefault(), { once: true });
    contentTab?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(drawer?.hasAttribute("hidden")).toBe(true);

    toggle?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(drawer?.hasAttribute("hidden")).toBe(false);

    drawerLink?.addEventListener("click", (event) => event.preventDefault(), { once: true });
    drawerLink?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(drawer?.hasAttribute("hidden")).toBe(true);
  });

  it("navigates shell links without reloading and keeps sidebar scroll position", async () => {
    const nextHtml = `<!doctype html>
<html data-theme="dark">
  <head>
    <title>热门文章 | HotNow</title>
  </head>
  <body class="shell-page">
    <div class="mobile-top-nav">
      <div class="mobile-top-nav-bar">
        <div class="mobile-top-nav-tabs" aria-label="内容菜单">
          <a class="mobile-top-tab mobile-top-tab--content" data-shell-nav href="/">热点资讯</a>
          <a class="mobile-top-tab mobile-top-tab--content is-active" data-shell-nav href="/articles">热门文章</a>
          <a class="mobile-top-tab mobile-top-tab--content" data-shell-nav href="/ai">最新 AI 消息</a>
        </div>
      </div>
    </div>
    <div class="shell-root">
      <aside class="shell-sidebar shell-sidebar--editorial">
        <section class="sidebar-page-summary">
          <p class="sidebar-page-summary-kicker">当前页面</p>
          <h2 class="sidebar-page-summary-title">热门文章</h2>
          <p class="sidebar-page-summary-description">这里会承载适合深读、完整度更高的文章内容。</p>
        </section>
        <nav class="nav-group nav-group--content">
          <a class="nav-link nav-link--content" data-shell-nav href="/">热点资讯</a>
          <a class="nav-link nav-link--content is-active" data-shell-nav href="/articles">热门文章</a>
          <a class="nav-link nav-link--content" data-shell-nav href="/ai">最新 AI 消息</a>
        </nav>
        <div class="sidebar-footer">
          <button type="button" data-theme-choice="dark" aria-pressed="true">深色模式</button>
          <button type="button" data-theme-choice="light" aria-pressed="false">浅色模式</button>
        </div>
      </aside>
      <div class="shell-main">
        <main class="shell-content">
          <section data-view-key="articles">新的文章内容</section>
        </main>
      </div>
    </div>
  </body>
</html>`;
    const dom = new JSDOM(
      `<!doctype html>
<html data-theme="dark">
  <head>
    <title>热点资讯 | HotNow</title>
  </head>
  <body class="shell-page">
    <div class="mobile-top-nav">
      <div class="mobile-top-nav-bar">
        <div class="mobile-top-nav-tabs" aria-label="内容菜单">
          <a class="mobile-top-tab mobile-top-tab--content is-active" data-shell-nav href="/">热点资讯</a>
          <a class="mobile-top-tab mobile-top-tab--content" data-shell-nav href="/articles">热门文章</a>
          <a class="mobile-top-tab mobile-top-tab--content" data-shell-nav href="/ai">最新 AI 消息</a>
        </div>
      </div>
    </div>
    <div class="shell-root">
      <aside class="shell-sidebar shell-sidebar--editorial">
        <section class="sidebar-page-summary">
          <p class="sidebar-page-summary-kicker">当前页面</p>
          <h2 class="sidebar-page-summary-title">热点资讯</h2>
          <p class="sidebar-page-summary-description">这里会展示统一内容池中的热点内容与时效优先结果。</p>
        </section>
        <nav class="nav-group nav-group--content">
          <a class="nav-link nav-link--content is-active" data-shell-nav href="/">热点资讯</a>
          <a class="nav-link nav-link--content" data-shell-nav href="/articles">热门文章</a>
          <a class="nav-link nav-link--content" data-shell-nav href="/ai">最新 AI 消息</a>
        </nav>
        <div class="sidebar-footer">
          <button type="button" data-theme-choice="dark" aria-pressed="true">深色模式</button>
          <button type="button" data-theme-choice="light" aria-pressed="false">浅色模式</button>
        </div>
      </aside>
      <div class="shell-main">
        <main class="shell-content">
          <section data-view-key="hot">旧的热点内容</section>
        </main>
      </div>
    </div>
  </body>
</html>`,
      {
        url: "https://example.test/",
        runScripts: "outside-only"
      }
    );

    const { window } = dom;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => nextHtml
    });
    const scrollToMock = vi.fn();
    window.localStorage.setItem("hot-now-theme", "light");
    window.fetch = fetchMock as typeof window.fetch;
    window.scrollTo = scrollToMock as typeof window.scrollTo;
    window.eval(siteScript);

    const sidebar = window.document.querySelector(".shell-sidebar");
    const articlesLink = window.document.querySelector('.nav-link[data-shell-nav][href="/articles"]');

    expect(sidebar instanceof window.HTMLElement).toBe(true);

    if (!(sidebar instanceof window.HTMLElement) || !(articlesLink instanceof window.HTMLAnchorElement)) {
      throw new Error("test setup failed");
    }

    sidebar.scrollTop = 136;
    articlesLink.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith("/articles", {
      headers: {
        accept: "text/html",
        "x-hot-now-shell-nav": "1"
      },
      credentials: "same-origin"
    });
    expect(window.location.pathname).toBe("/articles");
    expect(window.document.title).toBe("热门文章 | HotNow");
    expect(window.document.querySelector(".shell-content")?.textContent).toContain("新的文章内容");
    expect(window.document.querySelector(".sidebar-page-summary-title")?.textContent).toBe("热门文章");
    expect(window.document.querySelector('.nav-link[data-shell-nav][href="/articles"]')?.className).toContain("is-active");
    expect(window.document.querySelector('[data-theme-choice="light"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(sidebar.scrollTop).toBe(136);
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("opens the local feedback panel after reaction clicks and submits feedback form payloads", async () => {
    const dom = new JSDOM(
      `<!doctype html>
<html data-theme="dark">
  <body>
    <button type="button" data-theme-choice="dark" aria-pressed="true">深色模式</button>
    <button type="button" data-theme-choice="light" aria-pressed="false">浅色模式</button>
    <article data-content-id="42">
      <button type="button" data-content-action="reaction" data-reaction="like" aria-pressed="false">点赞</button>
      <button type="button" data-content-action="feedback-panel-toggle" aria-expanded="false">补充反馈</button>
      <div data-role="feedback-panel" hidden>
        <form data-content-feedback-form>
          <textarea name="freeText"></textarea>
          <select name="suggestedEffect">
            <option value="">未设置</option>
            <option value="boost">加分</option>
          </select>
          <select name="strengthLevel">
            <option value="">未设置</option>
            <option value="high">高</option>
          </select>
          <input name="positiveKeywords" />
          <input name="negativeKeywords" />
          <button type="submit">保存反馈</button>
        </form>
      </div>
    </article>
  </body>
</html>`,
      {
        url: "https://example.test/",
        runScripts: "outside-only"
      }
    );

    const { window } = dom;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, entryId: 9 })
      });
    window.fetch = fetchMock as typeof window.fetch;
    window.eval(siteScript);

    const likeButton = window.document.querySelector('[data-content-action="reaction"][data-reaction="like"]');
    const feedbackPanel = window.document.querySelector("[data-role='feedback-panel']");
    const feedbackForm = window.document.querySelector("[data-content-feedback-form]");
    const freeText = feedbackForm?.querySelector('[name="freeText"]') as HTMLTextAreaElement | null;
    const suggestedEffect = feedbackForm?.querySelector('[name="suggestedEffect"]') as HTMLSelectElement | null;
    const strengthLevel = feedbackForm?.querySelector('[name="strengthLevel"]') as HTMLSelectElement | null;
    const positiveKeywords = feedbackForm?.querySelector('[name="positiveKeywords"]') as HTMLInputElement | null;
    const negativeKeywords = feedbackForm?.querySelector('[name="negativeKeywords"]') as HTMLInputElement | null;

    likeButton?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(feedbackPanel?.hasAttribute("hidden")).toBe(false);

    if (!freeText || !suggestedEffect || !strengthLevel || !positiveKeywords || !negativeKeywords || !feedbackForm) {
      throw new Error("feedback form setup failed");
    }

    freeText.value = "保留 agent workflow 内容";
    suggestedEffect.value = "boost";
    strengthLevel.value = "high";
    positiveKeywords.value = "agent, workflow";
    negativeKeywords.value = "融资";

    feedbackForm.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/actions/content/42/reaction",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/actions/content/42/feedback-pool",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          reactionSnapshot: "like",
          freeText: "保留 agent workflow 内容",
          suggestedEffect: "boost",
          strengthLevel: "high",
          positiveKeywords: ["agent", "workflow"],
          negativeKeywords: ["融资"]
        })
      })
    );
  });
});
