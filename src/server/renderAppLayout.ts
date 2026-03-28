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
  contentHtml?: string;
};

const appShellPages: AppShellPage[] = [
  { path: "/", title: "热点资讯", section: "content", description: "这里会展示统一内容池中的热点内容与时效优先结果。" },
  { path: "/articles", title: "热门文章", section: "content", description: "这里会承载适合深读、完整度更高的文章内容。" },
  { path: "/ai", title: "最新 AI 消息", section: "content", description: "这里会展示 AI 相关性更高、发布时间更近的内容。" },
  {
    path: "/settings/view-rules",
    title: "筛选策略",
    section: "system",
    description: "这里会配置各内容菜单的筛选规则与展示偏好。"
  },
  { path: "/settings/sources", title: "数据迭代收集", section: "system", description: "这里会管理 RSS 数据源、当前启用项和采集状态。" },
  { path: "/settings/profile", title: "当前登录用户", section: "system", description: "这里会展示当前账号资料、角色和登录状态。" }
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
  const pageContent = view.contentHtml ?? renderPlaceholder(view.page.description);
  const userBlock = view.user ? renderUserBlock(view.user) : `<p class="user-meta">公开访问模式</p>`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(view.page.title)} | HotNow</title>
    <link rel="stylesheet" href="/assets/site.css" />
    <script src="/assets/site.js" defer></script>
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
            ${userBlock}
          </div>
        </header>
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

function renderUserBlock(user: AppShellUser) {
  // Authenticated pages keep user identity and logout controls in one shared header fragment.
  return `
    <div>
      <p class="user-name">${escapeHtml(user.displayName)}</p>
      <p class="user-meta">@${escapeHtml(user.username)} · ${escapeHtml(user.role)}</p>
    </div>
    <form method="post" action="/logout">
      <button type="submit" class="ghost-button">退出登录</button>
    </form>
  `;
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
