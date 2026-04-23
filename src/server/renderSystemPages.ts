type ProviderSettingsSummaryView = {
  providerKind: string;
  apiKeyLast4: string;
  isEnabled: boolean;
  updatedAt: string;
};

type ProviderCapabilityView = {
  hasMasterKey: boolean;
  featureAvailable: boolean;
  message: string;
};

type FeedbackPoolItem = {
  id: number;
  contentItemId: number;
  contentTitle: string;
  canonicalUrl: string;
  sourceName: string;
  freeText: string | null;
  suggestedEffect: string | null;
  strengthLevel: string | null;
  positiveKeywords: string[];
  negativeKeywords: string[];
  createdAt: string;
  updatedAt: string;
};

type FilterRuleWorkbenchView = {
  ruleKey: "ai" | "hot";
  displayName: string;
  summary: string;
  toggles: {
    enableTimeWindow: boolean;
    enableSourceViewBonus: boolean;
    enableAiKeywordWeight: boolean;
    enableHeatKeywordWeight: boolean;
    enableFreshnessWeight: boolean;
    enableScoreRanking: boolean;
  };
  weights: {
    freshnessWeight: number;
    sourceWeight: number;
    completenessWeight: number;
    aiWeight: number;
    heatWeight: number;
  };
};

export type ViewRulesWorkbenchView = {
  filterWorkbench: {
    aiRule: FilterRuleWorkbenchView;
    hotRule: FilterRuleWorkbenchView;
  };
  providerSettings: ProviderSettingsSummaryView[];
  providerCapability: ProviderCapabilityView;
  feedbackPool: FeedbackPoolItem[];
};

type SourceItem = {
  kind: string;
  name: string;
  rssUrl: string | null;
  isEnabled: boolean;
  showAllWhenSelected: boolean;
  lastCollectedAt: string | null;
  lastCollectionStatus: string | null;
  totalCount?: number;
  publishedTodayCount?: number;
  collectedTodayCount?: number;
  viewStats?: {
    hot: { candidateCount: number; visibleCount: number; visibleShare: number };
    articles: { candidateCount: number; visibleCount: number; visibleShare: number };
    ai: { candidateCount: number; visibleCount: number; visibleShare: number };
  };
};

export type SourcesSettingsOperationsView = {
  canTriggerManualCollect: boolean;
  canTriggerManualTwitterCollect: boolean;
  canTriggerManualTwitterKeywordCollect: boolean;
  canTriggerManualHackerNewsCollect?: boolean;
  canTriggerManualBilibiliCollect?: boolean;
  canTriggerManualWeiboTrendingCollect?: boolean;
  canTriggerManualSendLatestEmail: boolean;
  isRunning: boolean;
  lastCollectionRunAt: string | null;
  lastSendLatestEmailAt: string | null;
  nextCollectionRunAt: string | null;
};

export type SourcesCapabilityView = {
  wechatArticleUrlEnabled: boolean;
  wechatArticleUrlMessage: string;
  twitterAccountCollectionEnabled?: boolean;
  twitterAccountCollectionMessage?: string;
  twitterKeywordSearchEnabled?: boolean;
  twitterKeywordSearchMessage?: string;
  hackerNewsSearchEnabled?: boolean;
  hackerNewsSearchMessage?: string;
  bilibiliSearchEnabled?: boolean;
  bilibiliSearchMessage?: string;
  weiboTrendingEnabled?: boolean;
  weiboTrendingMessage?: string;
};

export type TwitterAccountSettingsView = {
  id: number;
  username: string;
  userId: string | null;
  displayName: string;
  category: string;
  priority: number;
  includeReplies: boolean;
  isEnabled: boolean;
  notes: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TwitterSearchKeywordSettingsView = {
  id: number;
  keyword: string;
  category: string;
  priority: number;
  isCollectEnabled: boolean;
  isVisible: boolean;
  notes: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HackerNewsQuerySettingsView = {
  id: number;
  query: string;
  priority: number;
  isEnabled: boolean;
  notes: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BilibiliQuerySettingsView = {
  id: number;
  query: string;
  priority: number;
  isEnabled: boolean;
  notes: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WeiboTrendingSettingsView = {
  fixedKeywords: string[];
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
};

export type SourcesSettingsView = {
  sources: SourceItem[];
  twitterAccounts?: TwitterAccountSettingsView[];
  twitterSearchKeywords?: TwitterSearchKeywordSettingsView[];
  hackerNewsQueries?: HackerNewsQuerySettingsView[];
  bilibiliQueries?: BilibiliQuerySettingsView[];
  weiboTrending?: WeiboTrendingSettingsView;
  operations: SourcesSettingsOperationsView;
  capability: SourcesCapabilityView;
};

export type ProfileView = {
  username: string;
  displayName: string;
  role: string;
  email: string | null;
  loggedIn: boolean;
};

export function renderViewRulesPage(rules: ViewRulesWorkbenchView): string {
  return `
    <section class="content-intro content-intro--system">
      <p class="content-kicker">系统菜单</p>
      <p class="content-description">筛选策略：这里会解释并控制 AI 新讯与 AI 热点的内容筛选开关，同时保留反馈池和暂未使用的 LLM 设置。</p>
    </section>
    <section class="system-section system-section--workbench" data-system-section="view-rules">
      <header class="system-section-header">
        <p class="system-section-kicker">内容筛选工作台</p>
        <h3 class="system-section-title">查看 AI 新讯与 AI 热点的真实筛选规则</h3>
        <p class="system-section-description">客户端会展示当前筛选总览、分页面开关、反馈池，以及暂未使用的 LLM 设置。</p>
      </header>
      <div class="system-stack system-stack--control system-stack--workbench">
        ${renderLegacyViewRulesFeedbackCard(rules.feedbackPool)}
        ${renderLegacyViewRulesProviderCard(rules)}
      </div>
    </section>
  `;
}

export function renderSourcesPage(sources: SourceItem[], options: SourcesSettingsOperationsView): string {
  // Source cards expose enable state and latest collection hints so operators can manage multi-source intake.
  if (sources.length === 0) {
    return renderEmptyState("数据迭代收集", "尚未发现数据源，请先执行种子初始化。");
  }

  const enabledSources = sources.filter((source) => source.isEnabled);
  const overviewTableHtml = renderSourcesOverviewTable(sources);
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
        ${overviewTableHtml}
        ${cardsHtml}
      </div>
    </section>
  `;
}

function renderSourcesOverviewTable(sources: SourceItem[]) {
  return `
    <div class="source-analytics-shell">
      <table class="source-analytics-table">
        <thead>
          <tr>
            <th>来源</th>
            <th>总条数</th>
            <th>今天发布</th>
            <th>今天抓取</th>
            <th>AI 热点候选 / 展示</th>
            <th>Hot 独立展示占比</th>
            <th>Articles 今日候选 / 今日展示</th>
            <th>Articles 独立展示占比</th>
            <th>AI 新讯24小时候选 / 24小时展示</th>
            <th>AI 独立展示占比</th>
          </tr>
        </thead>
        <tbody>
          ${sources.map((source) => renderSourcesOverviewRow(source)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSourcesOverviewRow(source: SourceItem) {
  const hotStats = source.viewStats?.hot ?? { candidateCount: 0, visibleCount: 0, visibleShare: 0 };
  const articleStats = source.viewStats?.articles ?? {
    candidateCount: 0,
    visibleCount: 0,
    visibleShare: 0
  };
  const aiStats = source.viewStats?.ai ?? { candidateCount: 0, visibleCount: 0, visibleShare: 0 };

  return `
    <tr>
      <th scope="row">${escapeHtml(source.name)}</th>
      <td>${source.totalCount ?? 0}</td>
      <td>${source.publishedTodayCount ?? 0}</td>
      <td>${source.collectedTodayCount ?? 0}</td>
      <td>${hotStats.candidateCount} / ${hotStats.visibleCount}</td>
      <td>${formatPercent(hotStats.visibleShare)}</td>
      <td>${articleStats.candidateCount} / ${articleStats.visibleCount}</td>
      <td>${formatPercent(articleStats.visibleShare)}</td>
      <td>${aiStats.candidateCount} / ${aiStats.visibleCount}</td>
      <td>${formatPercent(aiStats.visibleShare)}</td>
    </tr>
  `;
}

function formatPercent(value: number) {
  return `${(Math.max(0, value) * 100).toFixed(1)}%`;
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

function renderLegacyViewRulesProviderCard(workbench: ViewRulesWorkbenchView): string {
  const providerSettingsList = workbench.providerSettings;
  const enabledProviderSettings = providerSettingsList.find((settings) => settings.isEnabled) ?? null;
  const selectedProvider = enabledProviderSettings?.providerKind ?? providerSettingsList[0]?.providerKind ?? "deepseek";
  const selectedProviderSettings =
    providerSettingsList.find((settings) => settings.providerKind === selectedProvider) ?? null;

  return `
    <article class="system-card system-card--control system-card--provider system-card--panel system-card--form-panel" data-system-card="provider-settings">
      <header class="system-card-header">
        <h3 class="system-card-title">LLM 设置</h3>
        <p class="system-card-meta">状态：暂未使用</p>
        <p class="system-card-meta">已启用厂商：${escapeHtml(formatProviderLabel(enabledProviderSettings?.providerKind ?? null))}</p>
        <p class="system-card-meta">${escapeHtml(workbench.providerCapability.message)}</p>
      </header>
      <form class="system-form" data-system-action="provider-settings-save">
        <label class="rating-field">
          <span class="field-label">厂商</span>
          <select class="field-input" name="providerKind">
            ${renderSelectOption("deepseek", "DeepSeek", selectedProvider)}
            ${renderSelectOption("minimax", "MiniMax", selectedProvider)}
            ${renderSelectOption("kimi", "Kimi", selectedProvider)}
          </select>
        </label>
        <label class="rating-field">
          <span class="field-label">API Key</span>
          <input class="field-input" type="password" name="apiKey" placeholder="输入新的 API key 会更新当前厂商配置" />
          <span class="system-card-meta">当前厂商尾号：${escapeHtml(selectedProviderSettings?.apiKeyLast4 ?? "未配置")}</span>
        </label>
        <div class="system-action-row">
          <button type="submit" class="primary-mini-button">保存厂商设置</button>
        </div>
        <div class="system-status-region">
          <p class="action-status system-status" data-role="action-status" aria-live="polite"></p>
        </div>
      </form>
      <form class="system-form" data-system-action="provider-settings-activation">
        <label class="rating-field">
          <span class="field-label">厂商</span>
          <select class="field-input" name="providerKind">
            ${renderSelectOption("deepseek", "DeepSeek", selectedProvider)}
            ${renderSelectOption("minimax", "MiniMax", selectedProvider)}
            ${renderSelectOption("kimi", "Kimi", selectedProvider)}
          </select>
        </label>
        <label class="rating-field">
          <span class="field-label">启用状态</span>
          <select class="field-input" name="enable">
            ${renderSelectOption("true", "启用当前厂商", selectedProviderSettings?.isEnabled ? "false" : "true")}
            ${renderSelectOption("false", "停用当前厂商", selectedProviderSettings?.isEnabled ? "false" : "true")}
          </select>
        </label>
        <div class="system-action-row">
          <button type="submit" class="secondary-mini-button">更新启用状态</button>
        </div>
        <div class="system-status-region">
          <p class="action-status system-status" data-role="action-status" aria-live="polite"></p>
        </div>
      </form>
      <form class="system-form" data-system-action="provider-settings-delete">
        <label class="rating-field">
          <span class="field-label">厂商</span>
          <select class="field-input" name="providerKind">
            ${renderSelectOption("deepseek", "DeepSeek", selectedProvider)}
            ${renderSelectOption("minimax", "MiniMax", selectedProvider)}
            ${renderSelectOption("kimi", "Kimi", selectedProvider)}
          </select>
        </label>
        <div class="system-action-row">
          <button type="submit" class="secondary-mini-button">删除当前厂商配置</button>
        </div>
        <div class="system-status-region">
          <p class="action-status system-status" data-role="action-status" aria-live="polite"></p>
        </div>
      </form>
    </article>
  `;
}

function renderLegacyViewRulesFeedbackCard(entries: FeedbackPoolItem[]): string {
  const combinedCopyText = entries.map((entry) => buildFeedbackCopyText(entry)).join("\n\n---\n\n");
  const bodyHtml =
    entries.length > 0
      ? entries.map((entry) => renderLegacyFeedbackPoolEntry(entry)).join("")
      : `<p class="system-card-meta">反馈池为空，内容页提交的新反馈词会出现在这里。</p>`;

  return `
    <article class="system-card system-card--control system-card--feedback-pool system-card--panel" data-system-card="feedback-pool">
      <header class="system-card-header">
        <h3 class="system-card-title">反馈池</h3>
        <p class="system-card-meta">这里集中展示内容页写入的反馈词，不再转成草稿或正式策略。</p>
      </header>
      <div class="system-action-row">
        <button type="button" class="secondary-mini-button" data-system-action="copy-text" data-copy-text="${escapeAttribute(combinedCopyText)}">复制全部反馈</button>
      </div>
      <form class="system-form" data-system-action="feedback-clear-all">
        <div class="system-action-row">
          <button type="submit" class="secondary-mini-button">清空全部反馈</button>
        </div>
        <div class="system-status-region">
          <p class="action-status system-status" data-role="action-status" aria-live="polite"></p>
        </div>
      </form>
      <div class="system-stack system-stack--control system-stack--inventory">
        ${bodyHtml}
      </div>
    </article>
  `;
}

function renderLegacyFeedbackPoolEntry(entry: FeedbackPoolItem): string {
  return `
    <article class="system-card system-card--control system-card--feedback-entry system-card--panel" data-feedback-id="${entry.id}">
      <header class="system-card-header">
        <h3 class="system-card-title">${escapeHtml(entry.contentTitle)}</h3>
        <p class="system-card-meta">${escapeHtml(entry.sourceName)} · ${escapeHtml(formatDateTime(entry.updatedAt))}</p>
      </header>
      <dl class="system-detail-list">
        <div class="system-detail-row">
          <dt>链接</dt>
          <dd>${renderOptionalLink(entry.canonicalUrl)}</dd>
        </div>
        <div class="system-detail-row">
          <dt>反馈词</dt>
          <dd>${escapeHtml(entry.freeText?.trim() || "未填写")}</dd>
        </div>
        <div class="system-detail-row">
          <dt>建议动作</dt>
          <dd>${escapeHtml(entry.suggestedEffect?.trim() || "未设置")}</dd>
        </div>
        <div class="system-detail-row">
          <dt>强度</dt>
          <dd>${escapeHtml(entry.strengthLevel?.trim() || "未设置")}</dd>
        </div>
      </dl>
      <p class="system-card-meta">关键词加分：${escapeHtml(entry.positiveKeywords.join(", ") || "未设置")}</p>
      <p class="system-card-meta">关键词减分：${escapeHtml(entry.negativeKeywords.join(", ") || "未设置")}</p>
      <div class="system-action-row">
        <button type="button" class="secondary-mini-button" data-system-action="copy-text" data-copy-text="${escapeAttribute(buildFeedbackCopyText(entry))}">复制</button>
      </div>
      <form class="system-form" data-system-action="feedback-delete" data-feedback-id="${entry.id}">
        <div class="system-action-row">
          <button type="submit" class="secondary-mini-button">删除</button>
        </div>
        <div class="system-status-region">
          <p class="action-status system-status" data-role="action-status" aria-live="polite"></p>
        </div>
      </form>
    </article>
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
          <dd>${escapeHtml(formatCollectionStatus(source.lastCollectionStatus))}</dd>
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

function renderManualCollectionCard(sources: SourceItem[], options: SourcesSettingsOperationsView): string {
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

function renderManualSendLatestEmailCard(options: SourcesSettingsOperationsView): string {
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

function buildFeedbackCopyText(entry: FeedbackPoolItem): string {
  return [
    `标题：${entry.contentTitle}`,
    `来源：${entry.sourceName}`,
    `链接：${entry.canonicalUrl}`,
    `反馈词：${entry.freeText?.trim() || "未填写"}`,
    `建议动作：${entry.suggestedEffect?.trim() || "未设置"}`,
    `强度：${entry.strengthLevel?.trim() || "未设置"}`,
    `关键词加分：${entry.positiveKeywords.join(", ") || "未设置"}`,
    `关键词减分：${entry.negativeKeywords.join(", ") || "未设置"}`
  ].join("\n");
}

function renderSelectOption(value: string, label: string, selectedValue: string): string {
  const selected = value === selectedValue ? ' selected="selected"' : "";
  return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
}

function formatProviderLabel(value: string | null): string {
  if (value === "deepseek") {
    return "DeepSeek";
  }

  if (value === "minimax") {
    return "MiniMax";
  }

  if (value === "kimi") {
    return "Kimi";
  }

  return value?.trim() || "未配置";
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

function formatCollectionStatus(value: string | null): string {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "未知";
  }

  if (normalized === "completed") {
    return "已完成";
  }

  if (normalized === "running") {
    return "进行中";
  }

  if (normalized === "failed") {
    return "已失败";
  }

  if (normalized === "pending") {
    return "等待中";
  }

  return value ?? "未知";
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

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\n/g, "&#10;");
}
