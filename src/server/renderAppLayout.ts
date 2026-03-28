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
  user: AppShellUser;
};

const appShellPages: AppShellPage[] = [
  { path: "/", title: "今日看板", section: "content", description: "这里会展示今日重点热点与整体摘要。" },
  { path: "/articles", title: "文章库", section: "content", description: "这里会承载文章搜索、筛选和详情入口。" },
  { path: "/ai", title: "AI 视角", section: "content", description: "这里会放置 AI 评分、聚类和观点整合结果。" },
  {
    path: "/settings/view-rules",
    title: "查看规则",
    section: "system",
    description: "这里会配置热点筛选规则与展示偏好。"
  },
  { path: "/settings/sources", title: "数据源", section: "system", description: "这里会管理 RSS 与外部数据源配置。" },
  { path: "/settings/profile", title: "个人信息", section: "system", description: "这里会管理当前账号资料与安全设置。" }
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
  const contentLinks = renderNavGroup(appShellPages.filter((page) => page.section === "content"), view.currentPath);
  const systemLinks = renderNavGroup(appShellPages.filter((page) => page.section === "system"), view.currentPath);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(view.page.title)} | HotNow</title>
    <link rel="stylesheet" href="/assets/site.css" />
  </head>
  <body class="shell-page">
    <div class="shell-root">
      <aside class="shell-sidebar">
        <div class="brand-block">
          <p class="brand-kicker">HotNow</p>
          <h1 class="brand-title">Unified Site</h1>
        </div>
        <nav class="nav-group">
          <p class="nav-title">内容菜单</p>
          ${contentLinks}
        </nav>
        <nav class="nav-group">
          <p class="nav-title">系统菜单</p>
          ${systemLinks}
        </nav>
      </aside>
      <div class="shell-main">
        <header class="shell-header">
          <div>
            <p class="header-overline">当前页面</p>
            <h2 class="header-title">${escapeHtml(view.page.title)}</h2>
          </div>
          <div class="header-user">
            <div>
              <p class="user-name">${escapeHtml(view.user.displayName)}</p>
              <p class="user-meta">@${escapeHtml(view.user.username)} · ${escapeHtml(view.user.role)}</p>
            </div>
            <form method="post" action="/logout">
              <button type="submit" class="ghost-button">退出登录</button>
            </form>
          </div>
        </header>
        <main class="shell-content">
          <section class="placeholder-card">
            <h3>模块占位</h3>
            <p>${escapeHtml(view.page.description)}</p>
          </section>
        </main>
      </div>
    </div>
  </body>
</html>`;
}

function renderNavGroup(pages: AppShellPage[], currentPath: string): string {
  // Navigation links are generated from page metadata so menu labels never drift from routes.
  return pages
    .map((page) => {
      const activeClass = page.path === currentPath ? " is-active" : "";
      return `<a class="nav-link${activeClass}" href="${escapeHtml(page.path)}">${escapeHtml(page.title)}</a>`;
    })
    .join("");
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
