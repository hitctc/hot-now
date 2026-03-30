import { viewRuleFieldDefinitions } from "../core/viewRules/viewRuleConfig.js";

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
  isEnabled: boolean;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
};

type SourcesPageOptions = {
  canTriggerManualCollect: boolean;
  canTriggerManualSendLatestEmail: boolean;
  isRunning: boolean;
  lastCollectionRunAt: string | null;
  lastSendLatestEmailAt: string | null;
};

type ProfileView = {
  username: string;
  displayName: string;
  role: string;
  email: string | null;
  loggedIn: boolean;
};

export function renderViewRulesPage(rules: ViewRuleItem[]): string {
  // The settings module keeps one card per rule so users can edit the weight form without leaving unified shell.
  if (rules.length === 0) {
    return renderEmptyState("筛选策略", "当前还没有可编辑的规则，请先完成系统初始化。");
  }

  const cardsHtml = rules.map((rule) => renderViewRuleCard(rule)).join("");

  return `
    <section class="content-intro content-intro--system">
      <p class="content-kicker">系统菜单</p>
      <p class="content-description">筛选策略：通过字段表单调整 hot / articles / ai 的条数、窗口和权重。</p>
    </section>
    <section class="system-section system-section--workbench" data-system-section="view-rules">
      <header class="system-section-header">
        <p class="system-section-kicker">策略工作台</p>
        <h3 class="system-section-title">逐项调整内容筛选规则</h3>
        <p class="system-section-description">这里保留 hot / articles / ai 的权重与窗口表单，适合直接在统一站点内细调展示逻辑。</p>
      </header>
      <div class="system-stack system-stack--control system-stack--workbench">
        ${cardsHtml}
      </div>
    </section>
  `;
}

export function renderSourcesPage(sources: SourceItem[], options: SourcesPageOptions): string {
  // Source cards expose enable state and latest collection hints so operators can manage multi-source intake.
  if (sources.length === 0) {
    return renderEmptyState("数据迭代收集", "尚未发现数据源，请先执行种子初始化。");
  }

  const enabledSources = sources.filter((source) => source.isEnabled);
  const cardsHtml = sources.map((source) => renderSourceCard(source)).join("");

  return `
    <section class="content-intro content-intro--system">
      <p class="content-kicker">系统菜单</p>
      <p class="content-description">数据迭代收集：管理多 source 启用状态，并查看最近抓取结果。</p>
    </section>
    <section class="system-section system-section--operations system-section--workbench" data-system-section="operations">
      <header class="system-section-header">
        <p class="system-section-kicker">即时操作</p>
        <h3 class="system-section-title">先执行动作，再查看结果</h3>
        <p class="system-section-description">这里放直接影响采集和报告投递的操作，不和单个 source 的状态卡混在一起。</p>
      </header>
      <div class="system-stack system-stack--control system-stack--operations system-stack--workbench">
        ${renderManualCollectionCard(enabledSources, options)}
        ${renderManualSendLatestEmailCard(options)}
      </div>
    </section>
    <section class="system-section system-section--sources system-section--inventory" data-system-section="sources">
      <header class="system-section-header">
        <p class="system-section-kicker">数据源状态</p>
        <h3 class="system-section-title">查看当前接入和启用情况</h3>
        <p class="system-section-description">这里展示每个 source 的启用状态、最近抓取时间和最近抓取结果，便于逐项管理。</p>
      </header>
      <div class="system-stack system-stack--control system-stack--sources system-stack--inventory">
        ${cardsHtml}
      </div>
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
    <section class="system-section system-section--workbench" data-system-section="profile">
      <header class="system-section-header">
        <p class="system-section-kicker">账号面板</p>
        <h3 class="system-section-title">查看当前登录用户上下文</h3>
        <p class="system-section-description">这里保留本地单用户模式下的账号信息、角色和会话状态，方便核对当前登录环境。</p>
      </header>
      <div class="system-stack system-stack--control system-stack--workbench">
        <article class="system-card system-card--control system-card--profile system-card--panel">
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
      </div>
    </section>
  `;
}

function renderViewRuleCard(rule: ViewRuleItem): string {
  // Each rule exposes the same fixed set of inputs so operators can tune weights without editing raw JSON.
  return `
    <article class="system-card system-card--control system-card--view-rule system-card--panel system-card--form-panel" data-system-card="view-rule" data-rule-key="${escapeHtml(rule.ruleKey)}">
      <header class="system-card-header">
        <h3 class="system-card-title">${escapeHtml(rule.displayName)}</h3>
        <p class="system-card-meta">rule_key: <code>${escapeHtml(rule.ruleKey)}</code> · ${rule.isEnabled ? "启用中" : "已禁用"}</p>
      </header>
      <form class="system-form rating-form" data-system-action="view-rule-save" data-rule-key="${escapeHtml(rule.ruleKey)}">
        <div class="rating-grid">
          ${viewRuleFieldDefinitions.map((field) => renderViewRuleField(rule, field)).join("")}
        </div>
        <p class="system-card-meta">保存时会自动补齐缺省字段，权重建议填写 0 到 1 之间的小数。</p>
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

function renderViewRuleField(rule: ViewRuleItem, field: (typeof viewRuleFieldDefinitions)[number]): string {
  const rawValue = rule.config[field.name];
  const value = typeof rawValue === "number" && Number.isFinite(rawValue) ? String(rawValue) : "";

  return `
    <label class="rating-field">
      <span class="field-label">${escapeHtml(field.label)}</span>
      <input
        class="field-input"
        type="number"
        name="${escapeHtml(field.name)}"
        value="${escapeHtml(value)}"
        inputmode="${field.inputMode}"
        min="${field.min}"
        step="${field.step}"
        required
      />
      <span class="system-card-meta">${escapeHtml(field.description)}</span>
    </label>
  `;
}

function renderSourceCard(source: SourceItem): string {
  // Toggle forms post only source kind plus the next enable state so the action contract stays tiny and explicit.
  const nextEnable = source.isEnabled ? "false" : "true";

  return `
    <article class="system-card system-card--control system-card--source system-card--inventory system-card--panel" data-system-card="source" data-source-kind="${escapeHtml(source.kind)}" data-source-name="${escapeHtml(source.name)}">
      <header class="system-card-header">
        <p class="system-card-kicker">数据源</p>
        <h3 class="system-card-title">${escapeHtml(source.name)}</h3>
        <p class="system-card-meta">kind: <code>${escapeHtml(source.kind)}</code></p>
      </header>
      <dl class="system-detail-list system-detail-list--source">
        <div class="system-detail-row">
          <dt>RSS</dt>
          <dd class="system-detail-value system-detail-value--rss">${renderOptionalLink(source.rssUrl)}</dd>
        </div>
        <div class="system-detail-row">
          <dt>状态</dt>
          <dd data-role="source-enabled-state">${source.isEnabled ? "已启用" : "已停用"}</dd>
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
      <div class="system-card-actions system-card-actions--source">
        <form class="system-form system-form--source-action" data-system-action="toggle-source" data-source-kind="${escapeHtml(source.kind)}" data-enable="${nextEnable}">
          <button type="submit" class="primary-mini-button" data-role="toggle-button">
            ${source.isEnabled ? "停用 source" : "启用 source"}
          </button>
          <div class="system-status-region">
            <p class="action-status system-status" data-role="action-status" aria-live="polite"></p>
          </div>
        </form>
      </div>
    </article>
  `;
}

function renderManualCollectionCard(sources: SourceItem[], options: SourcesPageOptions): string {
  // Manual collection is its own control card so operators can see enabled sources and the action scope before they click.
  const enabledSourceNames = formatEnabledSourceNames(sources);
  const buttonText = options.isRunning ? "采集中..." : "手动执行采集";
  const disabledAttr = options.canTriggerManualCollect && !options.isRunning ? "" : " disabled";
  const initialStatus = options.canTriggerManualCollect
    ? options.isRunning
      ? "当前已有任务执行中，请稍后再试。"
      : ""
    : "当前环境未启用手动采集。";

  return `
    <article class="system-card system-card--control system-card--manual-collection system-card--operation system-card--operation-primary system-card--workbench" data-system-card="manual-collection">
      <header class="system-card-header">
        <p class="system-card-kicker">采集动作</p>
        <h3 class="system-card-title">手动执行采集</h3>
        <p class="system-card-meta">对当前启用 sources 立即执行一次抓取、聚类和报告生成。</p>
        <p class="system-card-meta" data-role="enabled-sources-summary">当前启用 sources：${escapeHtml(enabledSourceNames)}</p>
        <p class="system-card-meta">最后执行时间：${escapeHtml(formatDateTime(options.lastCollectionRunAt))}</p>
      </header>
      <form class="system-form" data-system-action="manual-collection-run">
        <div class="system-action-row">
          <button type="submit" class="primary-mini-button" data-role="manual-collection-button"${disabledAttr}>
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

function renderManualSendLatestEmailCard(options: SourcesPageOptions): string {
  // Latest-email is separated from collection so operators can resend the newest report without re-running the whole pipeline.
  const buttonText = options.isRunning ? "发送中..." : "发送最新报告";
  const disabledAttr = options.canTriggerManualSendLatestEmail && !options.isRunning ? "" : " disabled";
  const initialStatus = options.canTriggerManualSendLatestEmail
    ? options.isRunning
      ? "当前已有任务执行中，请稍后再试。"
      : ""
    : "当前环境未启用手动发送最新报告。";

  return `
    <article class="system-card system-card--control system-card--manual-send-latest-email system-card--operation system-card--operation-secondary system-card--workbench" data-system-card="manual-send-latest-email">
      <header class="system-card-header">
        <p class="system-card-kicker">投递动作</p>
        <h3 class="system-card-title">手动发送最新报告</h3>
        <p class="system-card-meta">对最新一份已生成报告单独执行一次邮件发送。</p>
        <p class="system-card-meta">不重新抓取 source，也不会重跑热点归并。</p>
        <p class="system-card-meta">最后执行时间：${escapeHtml(formatDateTime(options.lastSendLatestEmailAt))}</p>
      </header>
      <form class="system-form" data-system-action="manual-send-latest-email">
        <div class="system-action-row">
          <button type="submit" class="primary-mini-button" data-role="manual-send-latest-email-button"${disabledAttr}>
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

function formatEnabledSourceNames(sources: SourceItem[]): string {
  if (sources.length === 0) {
    return "未设置";
  }

  return sources.map((source) => source.name.trim()).filter(Boolean).join(" / ");
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

  // System pages show operator-facing timestamps, so they should match the product's Shanghai locale
  // instead of raw UTC ISO output from storage.
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .format(parsed)
    .replace(/\//g, "-");
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
