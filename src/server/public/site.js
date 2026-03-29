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
  const globalStatusDisplayDurationMs = 3000;
  const globalErrorStatusDisplayDurationMs = 7000;
  let globalStatusTimerId = null;

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
      await handleFavorite(button, contentId);
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

    if (target.dataset.systemAction === "manual-send-latest-email") {
      event.preventDefault();
      await handleManualSendLatestEmail(target);
      return;
    }
  });

  async function handleFavorite(button, contentId) {
    // Favorite toggles between one persisted state and no state, matching backend delete+insert semantics.
    const currentlyFavorited = button.dataset.favorited === "true";
    const nextFavorited = !currentlyFavorited;
    const response = await postJson(`/actions/content/${contentId}/favorite`, { isFavorited: nextFavorited });

    if (!response.ok) {
      showStatus(await readActionError(response, "收藏操作失败，请稍后再试。"), "error");
      return;
    }

    button.dataset.favorited = nextFavorited ? "true" : "false";
    button.setAttribute("aria-pressed", nextFavorited ? "true" : "false");
    button.textContent = nextFavorited ? "已收藏" : "收藏";
    showStatus(nextFavorited ? "已加入收藏。" : "已取消收藏。", "success");
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
      showStatus(await readActionError(response, "反馈提交失败，请稍后再试。"), "error");
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

    showStatus(nextReaction === "none" ? "已清除反馈。" : "反馈已保存。", "success");
  }

  async function handleViewRuleSave(form) {
    // Rule save now reads a fixed field set and posts the assembled config object directly.
    const ruleKey = (form.dataset.ruleKey || "").trim();

    if (!ruleKey) {
      showFormStatus(form, "规则标识缺失，无法保存。", "error");
      return;
    }

    if (typeof form.checkValidity === "function" && !form.checkValidity()) {
      if (typeof form.reportValidity === "function") {
        form.reportValidity();
      }

      showFormStatus(form, "请先把规则字段填写完整。", "error");
      return;
    }

    const config = readViewRuleConfig(form);

    if (!config.ok) {
      showFormStatus(form, config.message, "error");
      return;
    }

    const response = await postJson(`/actions/view-rules/${encodeURIComponent(ruleKey)}`, { config: config.config });

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "保存失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, "规则已保存。", "success");
  }

  async function handleToggleSource(form) {
    // Toggling a source updates the local system cards immediately so the multi-source page stays in sync without a refresh.
    const sourceKind = (form.dataset.sourceKind || "").trim();
    const enable = form.dataset.enable === "true";

    if (!sourceKind) {
      showFormStatus(form, "source kind 缺失，无法切换。", "error");
      return;
    }

    const response = await postJson("/actions/sources/toggle", { kind: sourceKind, enable });

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "切换失败，请稍后再试。"), "error");
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
    showFormStatus(form, enable ? "已启用 source。" : "已停用 source。", "success");
  }

  async function handleManualCollectionRun(form) {
    // Manual collection posts to the dedicated collect route so the shell matches the new split action contract.
    const runButton = form.querySelector('[data-role="manual-collection-button"]');

    if (!(runButton instanceof HTMLButtonElement)) {
      showFormStatus(form, "未找到采集按钮。", "error");
      return;
    }

    runButton.disabled = true;
    runButton.textContent = "采集中...";
    const response = await postJson("/actions/collect", {});

    if (!response.ok) {
      runButton.disabled = false;
      runButton.textContent = "手动执行采集";
      showFormStatus(form, await readSystemActionError(response, "采集任务启动失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, "已开始执行采集，请稍后刷新查看结果。", "success");
  }

  async function handleManualSendLatestEmail(form) {
    // Manual resend stays inline with the sources page so operators can retry mail delivery without leaving unified shell.
    const sendButton = form.querySelector('[data-role="manual-send-latest-email-button"]');

    if (!(sendButton instanceof HTMLButtonElement)) {
      showFormStatus(form, "未找到发信按钮。", "error");
      return;
    }

    sendButton.disabled = true;
    sendButton.textContent = "发送中...";
    const response = await postJson("/actions/send-latest-email", {});

    if (!response.ok) {
      sendButton.disabled = false;
      sendButton.textContent = "发送最新报告";
      showFormStatus(
        form,
        await readSystemActionError(response, "最新报告发送失败，请稍后再试。", "manual-send-latest-email"),
        "error"
      );
      return;
    }

    showFormStatus(form, "已开始发送最新报告邮件，请稍后检查投递结果。", "success");
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

  async function readSystemActionError(response, fallbackMessage, systemAction) {
    // System actions share one error reader, while callers can pass an action hint for route-specific reason wording.
    if (!response || typeof response !== "object") {
      return fallbackMessage;
    }

    const payload = await safeJson(response);

    if (systemAction === "manual-send-latest-email") {
      if (payload?.reason === "not-found") {
        return "最新报告不存在，请先执行一次采集。";
      }

      if (payload?.reason === "report-unavailable") {
        return "最新报告暂不可用，请稍后重试。";
      }

      if (payload?.reason === "send-failed") {
        return "最新报告发送失败，请检查 SMTP 配置后重试。";
      }
    }

    if (typeof response.status === "number") {
      if (response.status === 401) {
        return "请先登录后再操作。";
      }

      if (response.status === 404) {
        return "目标项不存在，可能已被删除或未初始化。";
      }
    }

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

  function showStatus(message, tone = "info") {
    // All lightweight action feedback goes through a single top-center toast so pages share one interaction rule.
    const toast = ensureGlobalStatusToast();
    toast.textContent = message;
    toast.classList.toggle("is-error", tone === "error");
    toast.classList.toggle("is-success", tone === "success");
    toast.classList.add("is-visible");
    toast.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");

    if (globalStatusTimerId !== null) {
      window.clearTimeout(globalStatusTimerId);
    }

    globalStatusTimerId = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      toast.classList.remove("is-error", "is-success");
      globalStatusTimerId = null;
    }, tone === "error" ? globalErrorStatusDisplayDurationMs : globalStatusDisplayDurationMs);
  }

  function showFormStatus(form, message, tone = "info") {
    // System forms keep their hidden local status node for structure, but visible feedback is unified via the global toast.
    const statusNode = form.querySelector('[data-role="action-status"]');

    if (statusNode instanceof HTMLElement) {
      statusNode.textContent = message;
    }

    showStatus(message, tone);
  }

  function ensureGlobalStatusToast() {
    // The toast host is created lazily so pages without content actions do not render any extra chrome.
    const existingToast = root.querySelector('[data-role="global-status-toast"]');

    if (existingToast instanceof HTMLElement) {
      return existingToast;
    }

    const toast = document.createElement("div");
    toast.className = "global-status-toast";
    toast.dataset.role = "global-status-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");
    document.body.appendChild(toast);
    return toast;
  }

  function refreshEnabledSourcesSummary() {
    // The manual collection card reads enabled source names from the current DOM so source toggles feel immediate.
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
