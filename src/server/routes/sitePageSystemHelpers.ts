import { readNextCollectionRunAt } from "../../core/scheduler/readNextCollectionRunAt.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import { renderProfilePage, renderSourcesPage, renderViewRulesPage } from "../renderSystemPages.js";
import type { SitePageDeps } from "./sitePageRouteShared.js";

export async function renderSystemPageForPath(deps: SitePageDeps, pathname: string, loggedIn: boolean): Promise<string | undefined> {
  // System pages keep callback wiring in main; routes only decide which renderer to call for the current path.
  if (pathname === "/settings/view-rules") {
    if (!deps.getViewRulesWorkbenchData) {
      return undefined;
    }

    const workbench = await deps.getViewRulesWorkbenchData();
    return renderViewRulesPage(workbench);
  }

  if (pathname === "/settings/sources") {
    if (!deps.listSources) {
      return undefined;
    }

    const sources = await deps.listSources();
    const operationSummary = deps.getSourcesOperationSummary
      ? await deps.getSourcesOperationSummary()
      : { lastCollectionRunAt: null, lastSendLatestEmailAt: null };
    const nextCollectionRunAt = readNextCollectionRunAt(deps.config?.collectionSchedule);

    return renderSourcesPage(sources, {
      canTriggerManualCollect: typeof (deps.triggerManualCollect ?? deps.triggerManualRun) === "function",
      canTriggerManualTwitterCollect: typeof deps.triggerManualTwitterCollect === "function",
      canTriggerManualTwitterKeywordCollect: typeof deps.triggerManualTwitterKeywordCollect === "function",
      canTriggerManualSendLatestEmail: typeof deps.triggerManualSendLatestEmail === "function",
      isRunning: deps.isRunning?.() ?? false,
      lastCollectionRunAt: operationSummary.lastCollectionRunAt,
      lastSendLatestEmailAt: operationSummary.lastSendLatestEmailAt,
      nextCollectionRunAt
    });
  }

  if (pathname === "/settings/profile") {
    if (!deps.getCurrentUserProfile) {
      return undefined;
    }

    const profile = await deps.getCurrentUserProfile();

    if (!profile) {
      return renderProfilePage(null);
    }

    return renderProfilePage({
      username: profile.username,
      displayName: profile.displayName,
      role: profile.role,
      email: profile.email,
      loggedIn
    });
  }

  return undefined;
}


export function isMalformedContentStoreError(error: unknown): boolean {
  // Only known SQLite file-shape errors degrade to an empty state; other exceptions must still surface for debugging.
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorCode = "code" in error && typeof error.code === "string" ? error.code : "";
  const errorMessage = "message" in error && typeof error.message === "string" ? error.message : "";

  return (
    errorCode === "SQLITE_CORRUPT" ||
    errorCode === "SQLITE_NOTADB" ||
    /database disk image is malformed/i.test(errorMessage) ||
    /file is not a database/i.test(errorMessage)
  );
}

export function safeRedirectTarget(target: unknown): string | null {
  if (typeof target !== "string") return null;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return null;
  if (target === "/login") return null;
  if (/[<>\r\n]/.test(target)) return null;
  return target;
}

// 未登录跳登录页时带上原地址，登录后才能回到原页面；helper 收口多处调用避免漏改
export function redirectToLogin(reply: FastifyReply, request: FastifyRequest) {
  const target = safeRedirectTarget(request.url) || "";
  return reply.redirect(target ? `/login?redirect=${encodeURIComponent(target)}` : "/login");
}

export function renderLoginPage(redirectTarget?: string) {
  // Login remains a small self-contained page that posts JSON without adding extra Fastify plugins.
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>登录 | 热讯平台HotNow</title>
    <link rel="icon" type="image/png" href="/brand/hotnow-favicon.png" />
    <link rel="stylesheet" href="/assets/site.css" />
  </head>
  <body class="login-page">
    <main class="login-shell">
      <section class="login-stage" data-login-stage="brand">
        <div class="login-stage__halo" aria-hidden="true"></div>
        <p class="login-kicker">Spotlight Feed</p>
        <div class="login-stage__brandlock">
          <img class="login-stage__logo" src="/brand/hotnow-logo-mark.png?v=1" alt="HotNow logo" />
          <div>
            <p class="login-stage__title">HotNow</p>
            <p class="login-stage__eyebrow">AI 热点与新讯</p>
          </div>
        </div>
        <h1>欢迎回到 HotNow</h1>
        <p class="login-subtitle">登录后继续管理来源、筛选规则和统一站点的系统能力。</p>
        <ul class="login-stage__highlights">
          <li>统一查看 AI 新讯、AI 热点和来源调度状态</li>
          <li>在同一套深浅色主题里切换系统配置与内容工作台</li>
          <li>把危险操作收口在受保护的系统菜单中，避免误触</li>
        </ul>
      </section>

      <section class="login-card" data-login-panel="form">
        <p class="login-card__eyebrow">账号验证</p>
        <h2>登录 HotNow</h2>
        <p class="login-card__summary">统一站点已启用账号校验，请使用管理员账号继续。</p>
        <form id="login-form">
          <label class="field-label" for="username">用户名</label>
          <input id="username" class="field-input" name="username" autocomplete="username" required />
          <label class="field-label" for="password">密码</label>
          <input
            id="password"
            class="field-input"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
          <button class="primary-button" type="submit">登录</button>
        </form>
        <p id="login-error" class="form-error"></p>
      </section>
    </main>
    <script>
      const redirectTarget = ${JSON.stringify(redirectTarget || "")};
      const form = document.getElementById("login-form");
      const errorNode = document.getElementById("login-error");
      const submitBtn = form ? form.querySelector(".primary-button") : null;
      const usernameInput = document.getElementById("username");
      const passwordInput = document.getElementById("password");

      // 账号密码都填好后才激活按钮，给用户"可以点了"的视觉反馈
      function syncReady() {
        if (!submitBtn || !usernameInput || !passwordInput) return;
        const ready = (usernameInput.value || "").trim() !== "" && (passwordInput.value || "") !== "";
        submitBtn.classList.toggle("is-ready", ready);
      }
      usernameInput?.addEventListener("input", syncReady);
      passwordInput?.addEventListener("input", syncReady);
      syncReady();

      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorNode.textContent = "";
        const username = (document.getElementById("username")?.value || "").trim();
        const password = document.getElementById("password")?.value || "";
        // 提交中：禁用按钮 + 切换文案，防止重复点击并给出加载反馈
        const originalText = submitBtn ? submitBtn.textContent : "登录";
        if (submitBtn) {
          submitBtn.classList.add("is-loading");
          submitBtn.disabled = true;
          submitBtn.textContent = "登录中…";
        }
        try {
          const response = await fetch("/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username, password, redirect: redirectTarget || undefined })
          });

          if (response.redirected) {
            location.href = response.url;
            return;
          }

          if (response.status === 200 || response.status === 204 || response.status === 302) {
            location.href = redirectTarget || "/";
            return;
          }

          errorNode.textContent = "登录失败，请检查用户名和密码。";
        } catch {
          errorNode.textContent = "登录请求失败，请稍后重试。";
        } finally {
          if (submitBtn) {
            submitBtn.classList.remove("is-loading");
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
          }
        }
      });
    </script>
  </body>
</html>`;
}
