type ViewRuleItem = {
  ruleKey: string;
  displayName: string;
  config: Record<string, unknown>;
  isEnabled: boolean;
};

type SourceItem = {
  kind: string;
  name: string;
  rssUrl: string | null;
  isActive: boolean;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
};

type SourcesPageOptions = {
  canTriggerManualRun: boolean;
  isRunning: boolean;
};

type ProfileView = {
  username: string;
  displayName: string;
  role: string;
  email: string | null;
  loggedIn: boolean;
};

export function renderViewRulesPage(rules: ViewRuleItem[]): string {
  // The settings module keeps one card per rule so users can edit JSON config without leaving unified shell.
  if (rules.length === 0) {
    return renderEmptyState("筛选策略", "当前还没有可编辑的规则，请先完成系统初始化。");
  }

  const cardsHtml = rules.map((rule) => renderViewRuleCard(rule)).join("");

  return `
    <section class="content-intro content-intro--system">
      <p class="content-kicker">系统菜单</p>
      <p class="content-description">筛选策略：查看并保存 hot / articles / ai 的 JSON 配置。</p>
    </section>
    <section class="system-stack system-stack--control">
      ${cardsHtml}
    </section>
  `;
}

export function renderSourcesPage(sources: SourceItem[], options: SourcesPageOptions): string {
  // Source cards expose active state and latest collection hints for day-to-day switching decisions.
  if (sources.length === 0) {
    return renderEmptyState("数据迭代收集", "尚未发现数据源，请先执行种子初始化。");
  }

  const activeSource = sources.find((source) => source.isActive) ?? null;
  const cardsHtml = sources.map((source) => renderSourceCard(source)).join("");

  return `
    <section class="content-intro content-intro--system">
      <p class="content-kicker">系统菜单</p>
      <p class="content-description">数据迭代收集：切换当前启用 source，并查看最近抓取状态。</p>
    </section>
    <section class="system-stack system-stack--control">
      ${renderManualCollectionCard(activeSource, options)}
      ${cardsHtml}
    </section>
  `;
}

export function renderProfilePage(profile: ProfileView | null): string {
  // Profile rendering shows login context and bootstrap user metadata from the local DB.
  if (!profile) {
    return renderEmptyState("当前登录用户", "当前没有可读取的用户信息。");
  }

  return `
    <section class="content-intro content-intro--system">
      <p class="content-kicker">系统菜单</p>
      <p class="content-description">当前登录用户：展示账号身份、角色和联系邮箱。</p>
    </section>
    <section class="system-stack system-stack--control">
      <article class="system-card system-card--control system-card--profile">
        <h3 class="system-card-title">当前登录用户</h3>
        <dl class="system-detail-list">
          <div class="system-detail-row">
            <dt>username</dt>
            <dd>${escapeHtml(profile.username)}</dd>
          </div>
          <div class="system-detail-row">
            <dt>displayName</dt>
            <dd>${escapeHtml(profile.displayName)}</dd>
          </div>
          <div class="system-detail-row">
            <dt>role</dt>
            <dd>${escapeHtml(profile.role)}</dd>
          </div>
          <div class="system-detail-row">
            <dt>email</dt>
            <dd>${escapeHtml(profile.email?.trim() || "未设置")}</dd>
          </div>
          <div class="system-detail-row">
            <dt>登录状态</dt>
            <dd>${profile.loggedIn ? "已登录（当前会话有效）" : "未登录（公开访问模式）"}</dd>
          </div>
        </dl>
      </article>
    </section>
  `;
}

function renderViewRuleCard(rule: ViewRuleItem): string {
  // JSON textarea stays plaintext so operators can copy/paste config snippets directly.
  return `
    <article class="system-card system-card--control system-card--view-rule" data-system-card="view-rule" data-rule-key="${escapeHtml(rule.ruleKey)}">
      <header class="system-card-header">
        <h3 class="system-card-title">${escapeHtml(rule.displayName)}</h3>
        <p class="system-card-meta">rule_key: <code>${escapeHtml(rule.ruleKey)}</code> · ${
          rule.isEnabled ? "启用中" : "已禁用"
        }</p>
      </header>
      <form class="system-form" data-system-action="view-rule-save" data-rule-key="${escapeHtml(rule.ruleKey)}">
        <label class="system-label" for="rule-config-${escapeHtml(rule.ruleKey)}">当前 JSON 配置</label>
        <textarea
          id="rule-config-${escapeHtml(rule.ruleKey)}"
          class="system-textarea"
          data-role="view-rule-config"
          name="config"
          rows="8"
          spellcheck="false"
        >${escapeHtml(JSON.stringify(rule.config, null, 2))}</textarea>
        <div class="system-action-row">
          <button type="submit" class="primary-mini-button">保存策略</button>
        </div>
        <div class="system-status-region">
          <p class="action-status system-status" data-role="action-status" aria-live="polite"></p>
        </div>
      </form>
    </article>
  `;
}

function renderSourceCard(source: SourceItem): string {
  // Activation form posts only source kind to keep the route contract explicit and tiny.
  return `
    <article class="system-card system-card--control system-card--source" data-system-card="source" data-source-kind="${escapeHtml(source.kind)}">
      <header class="system-card-header">
        <h3 class="system-card-title">${escapeHtml(source.name)}</h3>
        <p class="system-card-meta">kind: <code>${escapeHtml(source.kind)}</code></p>
      </header>
      <dl class="system-detail-list">
        <div class="system-detail-row">
          <dt>RSS</dt>
          <dd>${renderOptionalLink(source.rssUrl)}</dd>
        </div>
        <div class="system-detail-row">
          <dt>状态</dt>
          <dd data-role="source-active-state">${source.isActive ? "当前启用" : "未启用"}</dd>
        </div>
        <div class="system-detail-row">
          <dt>最近抓取时间</dt>
          <dd>${escapeHtml(formatDateTime(source.lastCollectedAt))}</dd>
        </div>
        <div class="system-detail-row">
          <dt>最近抓取状态</dt>
          <dd>${escapeHtml(source.lastCollectionStatus?.trim() || "unknown")}</dd>
        </div>
      </dl>
      <form class="system-form" data-system-action="activate-source" data-source-kind="${escapeHtml(source.kind)}">
        <button type="submit" class="primary-mini-button" data-role="activate-button"${source.isActive ? " disabled" : ""}>
          ${source.isActive ? "当前启用" : "设为当前启用"}
        </button>
        <div class="system-status-region">
          <p class="action-status system-status" data-role="action-status" aria-live="polite"></p>
        </div>
      </form>
    </article>
  `;
}

function renderManualCollectionCard(source: SourceItem | null, options: SourcesPageOptions): string {
  // Manual collection reuses the existing digest trigger so operators can run the active source from the unified page.
  const activeSourceName = source?.name ?? "未设置";
  const buttonText = options.isRunning ? "采集中..." : "手动执行采集";
  const disabledAttr = options.canTriggerManualRun && !options.isRunning ? "" : " disabled";
  const initialStatus = options.canTriggerManualRun
    ? options.isRunning
      ? "当前已有任务执行中，请稍后再试。"
      : ""
    : "当前环境未启用手动采集。";

  return `
    <article class="system-card system-card--control system-card--manual-collection">
      <header class="system-card-header">
        <h3 class="system-card-title">手动执行采集</h3>
        <p class="system-card-meta">当前启用 source：${escapeHtml(activeSourceName)}</p>
      </header>
      <form class="system-form" data-system-action="manual-collection-run">
        <div class="system-action-row">
          <button type="submit" class="primary-mini-button" data-role="manual-run-button"${disabledAttr}>
            ${buttonText}
          </button>
        </div>
        <div class="system-status-region">
          <p class="action-status system-status" data-role="action-status" aria-live="polite">${escapeHtml(initialStatus)}</p>
        </div>
      </form>
    </article>
  `;
}

function renderEmptyState(title: string, description: string): string {
  // Empty states keep shell pages readable even when callbacks return no rows.
  return `
    <section class="system-empty system-empty--control">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
    </section>
  `;
}

function renderOptionalLink(url: string | null): string {
  const safeUrl = toSafeHttpUrl(url);

  if (!safeUrl) {
    return "未配置";
  }

  return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(safeUrl)}</a>`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "未记录";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 16).replace("T", " ");
}

function toSafeHttpUrl(rawValue: string | null): string | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = new URL(rawValue);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  // System pages also render persisted DB strings, so templates escape every interpolated value.
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
