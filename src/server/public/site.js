(function () {
  const root = document;
  const themeRoot = document.documentElement;
  const themeStorageKey = "hot-now-theme";
  const viewRuleFieldOrder = [
    { name: "limit", label: "条数限制", integer: true },
    { name: "freshnessWindowDays", label: "新鲜度窗口", integer: true },
    { name: "freshnessWeight", label: "新鲜度权重", integer: false },
    { name: "sourceWeight", label: "来源权重", integer: false },
    { name: "completenessWeight", label: "完整度权重", integer: false },
    { name: "aiWeight", label: "AI 权重", integer: false },
    { name: "heatWeight", label: "热点权重", integer: false }
  ];

  applyInitialTheme();

  root.addEventListener("click", async (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const themeButton = target.closest("[data-theme-choice]");

    if (themeButton instanceof HTMLButtonElement) {
      event.preventDefault();
      setTheme(themeButton.dataset.themeChoice || "dark");
      return;
    }

    const button = target.closest("[data-content-action]");

    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const card = button.closest("[data-content-id]");

    if (!(card instanceof HTMLElement)) {
      return;
    }

    const contentId = Number(card.dataset.contentId);

    if (!Number.isInteger(contentId) || contentId <= 0) {
      return;
    }

    const action = button.dataset.contentAction;

    if (action === "favorite") {
      event.preventDefault();
      await handleFavorite(card, button, contentId);
      return;
    }

    if (action === "reaction") {
      event.preventDefault();
      await handleReaction(card, button, contentId);
    }
  });

  root.addEventListener("submit", async (event) => {
    const target = event.target;

    if (!(target instanceof HTMLFormElement)) {
      return;
    }

    if (target.dataset.systemAction === "view-rule-save") {
      event.preventDefault();
      await handleViewRuleSave(target);
      return;
    }

    if (target.dataset.systemAction === "toggle-source") {
      event.preventDefault();
      await handleToggleSource(target);
      return;
    }

    if (target.dataset.systemAction === "manual-collection-run") {
      event.preventDefault();
      await handleManualCollectionRun(target);
      return;
    }
  });

  async function handleFavorite(card, button, contentId) {
    // Favorite toggles between one persisted state and no state, matching backend delete+insert semantics.
    const currentlyFavorited = button.dataset.favorited === "true";
    const nextFavorited = !currentlyFavorited;
    const response = await postJson(`/actions/content/${contentId}/favorite`, { isFavorited: nextFavorited });

    if (!response.ok) {
      showStatus(card, await readActionError(response, "收藏操作失败，请稍后再试。"));
      return;
    }

    button.dataset.favorited = nextFavorited ? "true" : "false";
    button.setAttribute("aria-pressed", nextFavorited ? "true" : "false");
    button.textContent = nextFavorited ? "已收藏" : "收藏";
    showStatus(card, nextFavorited ? "已加入收藏。" : "已取消收藏。");
  }

  async function handleReaction(card, button, contentId) {
    // Clicking an already-selected reaction clears it, so users can undo feedback in one tap.
    const desiredReaction = button.dataset.reaction;

    if (desiredReaction !== "like" && desiredReaction !== "dislike") {
      return;
    }

    const currentPressed = button.getAttribute("aria-pressed") === "true";
    const nextReaction = currentPressed ? "none" : desiredReaction;
    const response = await postJson(`/actions/content/${contentId}/reaction`, { reaction: nextReaction });

    if (!response.ok) {
      showStatus(card, await readActionError(response, "反馈提交失败，请稍后再试。"));
      return;
    }

    const actionButtons = card.querySelectorAll('button[data-content-action="reaction"]');

    for (const actionButton of actionButtons) {
      if (!(actionButton instanceof HTMLButtonElement)) {
        continue;
      }

      const reaction = actionButton.dataset.reaction;
      const isPressed = reaction === nextReaction;
      actionButton.setAttribute("aria-pressed", isPressed ? "true" : "false");
    }

    showStatus(card, nextReaction === "none" ? "已清除反馈。" : "反馈已保存。");
  }

  async function handleViewRuleSave(form) {
    // Rule save now reads a fixed field set and posts the assembled config object directly.
    const ruleKey = (form.dataset.ruleKey || "").trim();

    if (!ruleKey) {
      showFormStatus(form, "规则标识缺失，无法保存。");
      return;
    }

    if (typeof form.checkValidity === "function" && !form.checkValidity()) {
      if (typeof form.reportValidity === "function") {
        form.reportValidity();
      }

      showFormStatus(form, "请先把规则字段填写完整。");
      return;
    }

    const config = readViewRuleConfig(form);

    if (!config.ok) {
      showFormStatus(form, config.message);
      return;
    }

    const response = await postJson(`/actions/view-rules/${encodeURIComponent(ruleKey)}`, { config: config.config });

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "保存失败，请稍后再试。"));
      return;
    }

    showFormStatus(form, "规则已保存。");
  }

  async function handleToggleSource(form) {
    // Toggling a source updates the local system cards immediately so the multi-source page stays in sync without a refresh.
    const sourceKind = (form.dataset.sourceKind || "").trim();
    const enable = form.dataset.enable === "true";

    if (!sourceKind) {
      showFormStatus(form, "source kind 缺失，无法切换。");
      return;
    }

    const response = await postJson("/actions/sources/toggle", { kind: sourceKind, enable });

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "切换失败，请稍后再试。"));
      return;
    }

    const sourceCard = form.closest('[data-system-card="source"]');

    if (sourceCard instanceof HTMLElement) {
      const statusNode = sourceCard.querySelector('[data-role="source-enabled-state"]');
      const actionButton = sourceCard.querySelector('[data-role="toggle-button"]');

      if (statusNode instanceof HTMLElement) {
        statusNode.textContent = enable ? "已启用" : "已停用";
      }

      if (actionButton instanceof HTMLButtonElement) {
        actionButton.textContent = enable ? "停用 source" : "启用 source";
      }

      form.dataset.enable = enable ? "false" : "true";
    }

    refreshEnabledSourcesSummary();
    showFormStatus(form, enable ? "已启用 source。" : "已停用 source。");
  }

  async function handleManualCollectionRun(form) {
    // Manual collection uses the same digest endpoint as the legacy control page, but keeps feedback inline in the unified shell.
    const runButton = form.querySelector('[data-role="manual-run-button"]');

    if (!(runButton instanceof HTMLButtonElement)) {
      showFormStatus(form, "未找到采集按钮。");
      return;
    }

    runButton.disabled = true;
    runButton.textContent = "采集中...";
    const response = await postJson("/actions/run", {});

    if (!response.ok) {
      runButton.disabled = false;
      runButton.textContent = "手动执行采集";
      showFormStatus(form, await readSystemActionError(response, "采集任务启动失败，请稍后再试。"));
      return;
    }

    showFormStatus(form, "已开始执行采集，请稍后刷新查看结果。");
  }

  async function postJson(url, body) {
    // Network failures return a shape with `ok: false` so callers can share one error branch.
    try {
      return await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch {
      return { ok: false };
    }
  }

  async function readActionError(response, fallbackMessage) {
    // Error parsing centralizes route-specific reasons so each handler can keep one concise fallback path.
    if (!response || typeof response !== "object") {
      return fallbackMessage;
    }

    if (typeof response.status === "number") {
      if (response.status === 401) {
        return "请先登录后再操作。";
      }

      if (response.status === 404) {
        return "内容不存在，可能已被删除。";
      }
    }

    const payload = await safeJson(response);

    return fallbackMessage;
  }

  async function readSystemActionError(response, fallbackMessage) {
    // System actions map backend status/reason into user-facing inline text.
    if (!response || typeof response !== "object") {
      return fallbackMessage;
    }

    if (typeof response.status === "number") {
      if (response.status === 401) {
        return "请先登录后再操作。";
      }

      if (response.status === 404) {
        return "目标项不存在，可能已被删除或未初始化。";
      }
    }

    const payload = await safeJson(response);

    if (payload?.reason === "invalid-view-rule-payload") {
      return "规则配置不合法，请检查表单字段。";
    }

    if (payload?.reason === "invalid-source-kind") {
      return "source 参数不合法。";
    }

    if (payload?.reason === "invalid-source-enable") {
      return "source 启用状态参数不合法。";
    }

    if (payload?.reason === "already-running") {
      return "当前已有任务执行中，请稍后再试。";
    }

    return fallbackMessage;
  }

  function showStatus(card, message) {
    // Per-card status text keeps feedback local to the item the user just interacted with.
    const statusNode = card.querySelector('[data-role="action-status"]');

    if (statusNode) {
      statusNode.textContent = message;
    }
  }

  function showFormStatus(form, message) {
    // Form-level status keeps system actions consistent with content cards' localized feedback.
    const statusNode = form.querySelector('[data-role="action-status"]');

    if (statusNode instanceof HTMLElement) {
      statusNode.textContent = message;
    }
  }

  function refreshEnabledSourcesSummary() {
    // The manual-run card reads enabled source names from the current DOM so source toggles feel immediate.
    const summaryNode = root.querySelector('[data-role="enabled-sources-summary"]');

    if (!(summaryNode instanceof HTMLElement)) {
      return;
    }

    const enabledNames = [...root.querySelectorAll('[data-system-card="source"]')].flatMap((sourceCard) => {
      if (!(sourceCard instanceof HTMLElement)) {
        return [];
      }

      const statusNode = sourceCard.querySelector('[data-role="source-enabled-state"]');
      const sourceName = (sourceCard.dataset.sourceName || "").trim();

      if (statusNode instanceof HTMLElement && statusNode.textContent?.trim() === "已启用" && sourceName) {
        return [sourceName];
      }

      return [];
    });

    summaryNode.textContent = `当前启用 sources：${enabledNames.join(" / ") || "未设置"}`;
  }

  async function safeJson(response) {
    // Some action responses may intentionally be empty, so JSON parsing must stay best-effort.
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function readViewRuleConfig(form) {
    // The browser sends numeric fields as strings, so the submit handler converts them into numbers once here.
    const formData = new FormData(form);
    const config = {};

    for (const field of viewRuleFieldOrder) {
      const rawValue = formData.get(field.name);

      if (typeof rawValue !== "string" || rawValue.trim() === "") {
        return { ok: false, message: `${field.label} 不能为空。` };
      }

      const parsedValue = Number(rawValue);

      if (!Number.isFinite(parsedValue)) {
        return { ok: false, message: `${field.label} 必须是有效数字。` };
      }

      config[field.name] = field.integer ? Math.floor(parsedValue) : parsedValue;
    }

    return { ok: true, config };
  }

  function applyInitialTheme() {
    // Theme boot reads persisted preference first and falls back to the shell's dark default.
    const savedTheme = readStoredTheme();
    setTheme(savedTheme || "dark", false);
  }

  function readStoredTheme() {
    try {
      const value = localStorage.getItem(themeStorageKey);

      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  }

  function setTheme(theme, persist = true) {
    // Theme state stays limited to light/dark so the shell never drifts outside the supported contract.
    const nextTheme = theme === "light" ? "light" : "dark";
    themeRoot.dataset.theme = nextTheme;
    syncThemeButtons(nextTheme);

    if (persist) {
      try {
        localStorage.setItem(themeStorageKey, nextTheme);
      } catch {
        // Persistence is best-effort; the runtime theme change still applies immediately.
      }
    }
  }

  function syncThemeButtons(theme) {
    const themeButtons = root.querySelectorAll("[data-theme-choice]");

    for (const themeButton of themeButtons) {
      if (!(themeButton instanceof HTMLButtonElement)) {
        continue;
      }

      const isPressed = themeButton.dataset.themeChoice === theme;
      themeButton.setAttribute("aria-pressed", isPressed ? "true" : "false");
    }
  }
})();
