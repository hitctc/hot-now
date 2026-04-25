type AppShellUser = {
  username: string;
  displayName: string;
  role: string;
};

export type AppShellPage = {
  path: string;
  title: string;
  section: "content" | "system";
  description: string;
};

type AppShellView = {
  currentPath: string;
  page: AppShellPage;
  user?: AppShellUser;
  showSystemMenu?: boolean;
  loginHref?: string;
  contentHtml?: string;
};

const appShellPages: AppShellPage[] = [
  { path: "/", title: "AI 新讯", section: "content", description: "这里会展示最新 AI 新闻、模型、事件与智能体信号。" },
  { path: "/ai-new", title: "AI 新讯", section: "content", description: "这里会展示最新 AI 新闻、模型、事件与智能体信号。" },
  { path: "/ai-hot", title: "AI 热点", section: "content", description: "这里会承接已经开始形成热度的 AI 热点内容。" },
  { path: "/ai-timeline", title: "AI 时间线", section: "content", description: "这里会按时间追踪主流 AI 公司官方发布的模型、产品、开发生态和行业动态。" },
  { path: "/settings/sources", title: "数据收集", section: "system", description: "这里会管理 RSS 数据源的启用状态、抓取结果和手动采集。" },
  {
    path: "/settings/ai-timeline",
    title: "AI 时间线管理",
    section: "system",
    description: "这里会管理官方源健康、候选事件、证据链和主时间线展示规则。"
  },
  {
    path: "/settings/view-rules",
    title: "筛选策略",
    section: "system",
    description: "这里会配置 AI 新讯与 AI 热点的筛选规则与展示偏好。"
  },
  { path: "/settings/profile", title: "当前用户", section: "system", description: "这里会展示当前账号资料、角色和登录状态。" }
];

// The server resolves shell pages from one canonical list so route registration and navigation stay in sync.
export function getAppShellPages(): AppShellPage[] {
  return appShellPages;
}

export function findAppShellPage(pathname: string): AppShellPage | null {
  // Route handlers use this lookup to map URLs back to one shared page definition.
  return appShellPages.find((page) => page.path === pathname) ?? null;
}

// App shell rendering keeps one stable layout contract that later tasks can fill with real feature modules.
export function renderAppLayout(view: AppShellView): string {
  const contentLinks = renderNavGroup(
    appShellPages.filter((page) => page.section === "content" && page.path !== "/"),
    view.currentPath
  );
  const systemLinks = renderNavGroup(appShellPages.filter((page) => page.section === "system"), view.currentPath);
  const showSystemMenu = view.showSystemMenu ?? true;
  const pageContent = view.contentHtml ?? renderPlaceholder(view.page.description);
  const sidebarPageSummary = renderSidebarPageSummary(view.page);
  const sidebarAccount = renderSidebarAccount(view.user, view.loginHref);
  const mobileTopNav = renderMobileTopNav(view.currentPath, showSystemMenu);
  const themeControl = `
  <section class="theme-dock" data-theme-toggle>
    <p class="theme-dock-title">界面主题</p>
    <div class="theme-switch" role="group" aria-label="界面主题切换">
      <button type="button" class="theme-switch-button" data-theme-choice="dark" aria-pressed="false">深色模式</button>
      <button type="button" class="theme-switch-button" data-theme-choice="light" aria-pressed="true">浅色模式</button>
    </div>
  </section>
`;

  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(view.page.title)} | HotNow</title>
    <link rel="icon" type="image/png" href="/brand/hotnow-favicon.png" />
    <link rel="stylesheet" href="/assets/site.css" />
    <script src="/assets/site.js" defer></script>
  </head>
  <body class="shell-page">
    ${mobileTopNav}
    <div class="shell-root">
      <aside class="shell-sidebar shell-sidebar--editorial">
        <div class="brand-block brand-block--masthead">
          <p class="brand-kicker">HotNow Editorial Desk</p>
          <h1 class="brand-title">HotNow</h1>
          <p class="brand-description">多源热点、筛选策略与投递动作在同一编辑台内完成。</p>
        </div>
        ${sidebarPageSummary}
        <nav class="nav-group nav-group--content">
          <p class="nav-title">内容菜单</p>
          ${contentLinks}
        </nav>
        ${showSystemMenu ? `<nav class="nav-group nav-group--system">
          <p class="nav-title">系统菜单</p>
          ${systemLinks}
        </nav>` : ""}
        <div class="sidebar-footer">
          ${themeControl}
          ${sidebarAccount}
        </div>
      </aside>
      <div class="shell-main">
        <main class="shell-content">
          ${pageContent}
        </main>
      </div>
    </div>
  </body>
</html>`;
}

function renderPlaceholder(description: string) {
  // Placeholder mode is preserved so shell-only pages still render when content deps are absent.
  return `
    <section class="placeholder-card">
      <h3>模块占位</h3>
      <p>${escapeHtml(description)}</p>
    </section>
  `;
}

function renderSidebarPageSummary(page: AppShellPage) {
  // The sidebar summary mirrors the current page title and description so the shell keeps context in one place.
  return `
    <section class="sidebar-page-summary" aria-labelledby="sidebar-page-summary-title">
      <p class="sidebar-page-summary-kicker">当前页面</p>
      <h2 id="sidebar-page-summary-title" class="sidebar-page-summary-title">${escapeHtml(page.title)}</h2>
      <p class="sidebar-page-summary-description">${escapeHtml(page.description)}</p>
    </section>
  `;
}

function renderSidebarAccount(user?: AppShellUser, loginHref?: string) {
  // The sidebar account block keeps identity, login entry, and logout controls anchored beside the theme switcher.
  if (!user) {
    const loginAction = loginHref
      ? `<a href="${escapeHtml(loginHref)}" class="ghost-button">登录后访问系统菜单</a>`
      : "";

    return `
      <section class="sidebar-account" aria-label="账号信息">
        <p class="user-meta">${loginHref ? "当前为内容公开访问模式" : "公开访问模式"}</p>
        ${loginAction}
      </section>
    `;
  }

  return `
    <section class="sidebar-account" aria-label="账号信息">
      <div class="sidebar-account-body">
        <p class="user-name">${escapeHtml(user.displayName)}</p>
        <p class="user-meta">@${escapeHtml(user.username)} · ${escapeHtml(user.role)}</p>
      </div>
      <form method="post" action="/logout" enctype="text/plain" class="sidebar-account-actions">
        <button type="submit" class="ghost-button">退出登录</button>
      </form>
    </section>
  `;
}

function renderMobileTopNav(currentPath: string, showSystemMenu: boolean) {
  // Mobile keeps a compact top bar so content tabs stay visible and the system drawer can be wired later.
  const contentTabs = renderMobileTopTabs(
    appShellPages.filter((page) => page.section === "content" && page.path !== "/"),
    currentPath
  );
  const systemDrawer = showSystemMenu
    ? `
      <nav id="mobile-system-drawer" class="mobile-system-drawer" hidden aria-label="系统菜单">
        ${renderNavGroup(appShellPages.filter((page) => page.section === "system"), currentPath)}
      </nav>
    `
    : "";
  const systemToggle = showSystemMenu
    ? `
      <button
        type="button"
        class="mobile-top-system-toggle"
        data-mobile-system-toggle
        aria-expanded="false"
        aria-controls="mobile-system-drawer"
      >
        系统菜单
      </button>
    `
    : "";

  return `
    <div class="mobile-top-nav" aria-label="移动端顶部导航">
      <div class="mobile-top-nav-bar">
        <div class="mobile-top-nav-tabs" aria-label="内容菜单">
          ${contentTabs}
        </div>
        ${systemToggle}
      </div>
      ${systemDrawer}
    </div>
  `;
}

function renderMobileTopTabs(pages: AppShellPage[], currentPath: string): string {
  // Content tabs keep the same route metadata but use a compact active pill treatment on mobile.
  return pages
    .map((page) => {
      const activeClass = isCurrentNavPath(page.path, currentPath) ? " is-active" : "";
      return `<a class="mobile-top-tab mobile-top-tab--content${activeClass}" data-shell-nav href="${escapeHtml(page.path)}">${escapeHtml(page.title)}</a>`;
    })
    .join("");
}

function renderNavGroup(pages: AppShellPage[], currentPath: string): string {
  // Navigation links are generated from page metadata so menu labels never drift from routes.
  return pages
    .map((page) => {
      const activeClass = isCurrentNavPath(page.path, currentPath) ? " is-active" : "";
      return `<a class="nav-link nav-link--${page.section}${activeClass}" data-shell-nav href="${escapeHtml(page.path)}">${escapeHtml(page.title)}</a>`;
    })
    .join("");
}

function isCurrentNavPath(pagePath: string, currentPath: string): boolean {
  // "/" is just the public alias of "/ai-new", so both paths should highlight the same navigation item.
  return pagePath === currentPath || (pagePath === "/ai-new" && currentPath === "/");
}

function escapeHtml(value: string): string {
  // Escaping user-facing strings here prevents accidental HTML injection in shell templates.
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
