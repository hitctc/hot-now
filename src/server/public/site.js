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
  const shellNavigationHeader = "x-hot-now-shell-nav";
  let globalStatusTimerId = null;
  let shellNavigationInFlight = false;

  applyInitialTheme();
  closeMobileSystemDrawer();

  root.addEventListener("click", async (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const shellNavLink = target.closest("[data-shell-nav]");

    if (shellNavLink instanceof HTMLAnchorElement && shouldHandleShellNavigation(event, shellNavLink)) {
      event.preventDefault();
      closeMobileSystemDrawer();
      await navigateShellPage(shellNavLink.href);
      return;
    }

    const mobileSystemToggle = target.closest("[data-mobile-system-toggle]");

    if (mobileSystemToggle instanceof HTMLButtonElement) {
      event.preventDefault();
      toggleMobileSystemDrawer();
      return;
    }

    const themeButton = target.closest("[data-theme-choice]");

    if (themeButton instanceof HTMLButtonElement) {
      event.preventDefault();
      setTheme(themeButton.dataset.themeChoice || "dark");
      closeMobileSystemDrawer();
      return;
    }

    const systemActionButton = target.closest("button[data-system-action]");

    if (systemActionButton instanceof HTMLButtonElement) {
      if (systemActionButton.dataset.systemAction === "copy-text") {
        event.preventDefault();
        await copyTextToClipboard(systemActionButton.dataset.copyText || "");
        closeMobileSystemDrawer();
        return;
      }

      if (systemActionButton.dataset.systemAction === "draft-apply") {
        event.preventDefault();
        applyDraftToNlRuleEditor(systemActionButton);
        closeMobileSystemDrawer();
        return;
      }
    }

    const button = target.closest("[data-content-action]");

    if (!(button instanceof HTMLButtonElement)) {
      closeMobileSystemDrawer();
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
      closeMobileSystemDrawer();
      return;
    }

    if (action === "reaction") {
      event.preventDefault();
      await handleReaction(card, button, contentId);
      closeMobileSystemDrawer();
      return;
    }

    if (action === "feedback-panel-toggle") {
      event.preventDefault();
      toggleFeedbackPanel(card, button);
      closeMobileSystemDrawer();
      return;
    }

    closeMobileSystemDrawer();
  });

  root.addEventListener("submit", async (event) => {
    const target = event.target;

    if (!(target instanceof HTMLFormElement)) {
      return;
    }

    if (target.hasAttribute("data-content-feedback-form")) {
      event.preventDefault();
      await handleContentFeedbackSave(target);
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

    if (target.dataset.systemAction === "provider-settings-save") {
      event.preventDefault();
      await handleProviderSettingsSave(target);
      return;
    }

    if (target.dataset.systemAction === "provider-settings-delete") {
      event.preventDefault();
      await handleProviderSettingsDelete(target);
      return;
    }

    if (target.dataset.systemAction === "nl-rules-save") {
      event.preventDefault();
      await handleNlRulesSave(target);
      return;
    }

    if (target.dataset.systemAction === "feedback-draft-create") {
      event.preventDefault();
      await handleFeedbackDraftCreate(target);
      return;
    }

    if (target.dataset.systemAction === "feedback-delete") {
      event.preventDefault();
      await handleFeedbackDelete(target);
      return;
    }

    if (target.dataset.systemAction === "feedback-clear-all") {
      event.preventDefault();
      await handleFeedbackClearAll(target);
      return;
    }

    if (target.dataset.systemAction === "draft-save") {
      event.preventDefault();
      await handleDraftSave(target);
      return;
    }

    if (target.dataset.systemAction === "draft-delete") {
      event.preventDefault();
      await handleDraftDelete(target);
      return;
    }
  });

  window.addEventListener("popstate", () => {
    if (!isShellNavigationEnabled()) {
      return;
    }

    void navigateShellPage(window.location.pathname + window.location.search, { pushHistory: false });
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

    setFeedbackPanelOpen(card, true);
    showStatus(nextReaction === "none" ? "已清除反馈。" : "反馈已保存。", "success");
  }

  async function handleContentFeedbackSave(form) {
    const card = form.closest("[data-content-id]");

    if (!(card instanceof HTMLElement)) {
      showFormStatus(form, "未找到内容卡片，无法保存反馈。", "error");
      return;
    }

    const contentId = Number(card.dataset.contentId);

    if (!Number.isInteger(contentId) || contentId <= 0) {
      showFormStatus(form, "内容标识不合法，无法保存反馈。", "error");
      return;
    }

    const payload = readContentFeedbackPayload(form, card);
    const response = await postJson(`/actions/content/${contentId}/feedback-pool`, payload);

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "反馈保存失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, "反馈已写入反馈池。", "success");
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

  async function handleProviderSettingsSave(form) {
    const formData = new FormData(form);
    const providerKind = String(formData.get("providerKind") || "").trim();
    const apiKey = String(formData.get("apiKey") || "").trim();

    if (!providerKind || !apiKey) {
      showFormStatus(form, "请先填写厂商和 API Key。", "error");
      return;
    }

    const response = await postJson("/actions/view-rules/provider-settings", {
      providerKind,
      apiKey,
      isEnabled: true
    });

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "厂商配置保存失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, "厂商配置已保存。", "success");
    await refreshCurrentShellPage();
  }

  async function handleProviderSettingsDelete(form) {
    if (!window.confirm("确认删除当前厂商配置吗？")) {
      return;
    }

    const response = await postJson("/actions/view-rules/provider-settings/delete", {});

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "厂商配置删除失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, "厂商配置已删除。", "success");
    await refreshCurrentShellPage();
  }

  async function handleNlRulesSave(form) {
    const formData = new FormData(form);
    const response = await postJson("/actions/view-rules/nl-rules", {
      rules: {
        global: String(formData.get("globalRuleText") || ""),
        hot: String(formData.get("hotRuleText") || ""),
        articles: String(formData.get("articlesRuleText") || ""),
        ai: String(formData.get("aiRuleText") || "")
      }
    });

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "正式规则保存失败，请稍后再试。"), "error");
      return;
    }

    const payload = await safeJson(response);
    const runStatus = payload?.run?.status;
    const message =
      runStatus === "completed"
        ? "正式规则已保存，当前内容库已完成重算。"
        : runStatus === "skipped"
          ? "正式规则已保存，但当前未执行自然语言重算。"
          : "正式规则已保存。";

    showFormStatus(form, message, "success");
    await refreshCurrentShellPage();
  }

  async function handleFeedbackDraftCreate(form) {
    const feedbackId = form.dataset.feedbackId;
    const response = await postJson(`/actions/feedback-pool/${encodeURIComponent(feedbackId || "")}/create-draft`, {});

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "转草稿失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, "已转成草稿。", "success");
    await refreshCurrentShellPage();
  }

  async function handleFeedbackDelete(form) {
    if (!window.confirm("确认删除这条反馈吗？")) {
      return;
    }

    const feedbackId = form.dataset.feedbackId;
    const response = await postJson(`/actions/feedback-pool/${encodeURIComponent(feedbackId || "")}/delete`, {});

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "删除反馈失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, "反馈已删除。", "success");
    await refreshCurrentShellPage();
  }

  async function handleFeedbackClearAll(form) {
    if (!window.confirm("确认清空全部反馈吗？")) {
      return;
    }

    const response = await postJson("/actions/feedback-pool/clear", {});

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "清空反馈失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, "反馈池已清空。", "success");
    await refreshCurrentShellPage();
  }

  async function handleDraftSave(form) {
    const draftId = form.dataset.draftId;
    const formData = new FormData(form);
    const response = await postJson(`/actions/strategy-drafts/${encodeURIComponent(draftId || "")}/save`, {
      suggestedScope: String(formData.get("suggestedScope") || "unspecified"),
      draftText: String(formData.get("draftText") || ""),
      draftEffectSummary: String(formData.get("draftEffectSummary") || ""),
      positiveKeywords: parseKeywordInput(String(formData.get("positiveKeywords") || "")),
      negativeKeywords: parseKeywordInput(String(formData.get("negativeKeywords") || ""))
    });

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "保存草稿失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, "草稿已保存。", "success");
  }

  async function handleDraftDelete(form) {
    if (!window.confirm("确认删除这条草稿吗？")) {
      return;
    }

    const draftId = form.dataset.draftId;
    const response = await postJson(`/actions/strategy-drafts/${encodeURIComponent(draftId || "")}/delete`, {});

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "删除草稿失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, "草稿已删除。", "success");
    await refreshCurrentShellPage();
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

  async function copyTextToClipboard(text) {
    if (!text) {
      showStatus("没有可复制的内容。", "error");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }

      showStatus("内容已复制。", "success");
    } catch {
      showStatus("复制失败，请手动复制。", "error");
    }
  }

  function applyDraftToNlRuleEditor(button) {
    const form = button.closest("[data-system-action='draft-save']");

    if (!(form instanceof HTMLFormElement)) {
      showStatus("未找到草稿表单。", "error");
      return;
    }

    const formData = new FormData(form);
    const suggestedScope = String(formData.get("suggestedScope") || "unspecified");
    const draftText = String(formData.get("draftText") || "").trim();

    if (!draftText) {
      showStatus("草稿内容为空，无法写入。", "error");
      return;
    }

    if (suggestedScope === "unspecified") {
      showStatus("请先选择目标范围，再写入正式策略编辑器。", "error");
      return;
    }

    const target = root.querySelector(`[data-nl-rule-scope="${escapeCssAttributeValue(suggestedScope)}"]`);

    if (!(target instanceof HTMLTextAreaElement)) {
      showStatus("未找到对应的正式策略编辑框。", "error");
      return;
    }

    target.value = target.value.trim() ? `${target.value.trim()}\n\n${draftText}` : draftText;
    showStatus("草稿已写入正式策略编辑器，记得保存正式规则。", "success");
  }

  async function refreshCurrentShellPage() {
    const currentHref = window.location.pathname + window.location.search;

    if (isShellNavigationEnabled()) {
      await navigateShellPage(currentHref, { pushHistory: false, force: true });
      return;
    }

    window.location.reload();
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

  function readContentFeedbackPayload(form, card) {
    const formData = new FormData(form);

    return {
      reactionSnapshot: readCurrentReactionSnapshot(card),
      freeText: String(formData.get("freeText") || ""),
      suggestedEffect: normalizeNullableValue(formData.get("suggestedEffect")),
      strengthLevel: normalizeNullableValue(formData.get("strengthLevel")),
      positiveKeywords: parseKeywordInput(String(formData.get("positiveKeywords") || "")),
      negativeKeywords: parseKeywordInput(String(formData.get("negativeKeywords") || ""))
    };
  }

  function readCurrentReactionSnapshot(card) {
    const reactionButtons = card.querySelectorAll('[data-content-action="reaction"]');

    for (const button of reactionButtons) {
      if (!(button instanceof HTMLButtonElement)) {
        continue;
      }

      if (button.getAttribute("aria-pressed") === "true") {
        return button.dataset.reaction === "dislike" ? "dislike" : "like";
      }
    }

    return "none";
  }

  function parseKeywordInput(value) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeNullableValue(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function findFeedbackPanel(card) {
    const panel = card.querySelector("[data-role='feedback-panel']");

    if (panel instanceof HTMLElement) {
      return panel;
    }

    const inlineForm = card.querySelector("[data-content-feedback-form]");
    return inlineForm instanceof HTMLElement ? inlineForm : null;
  }

  function setFeedbackPanelOpen(card, shouldOpen) {
    const panel = findFeedbackPanel(card);
    const toggleButton = card.querySelector('[data-content-action="feedback-panel-toggle"]');

    if (panel instanceof HTMLElement) {
      panel.toggleAttribute("hidden", !shouldOpen);
    }

    if (toggleButton instanceof HTMLButtonElement) {
      toggleButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    }
  }

  function toggleFeedbackPanel(card) {
    const panel = findFeedbackPanel(card);

    if (!(panel instanceof HTMLElement)) {
      return;
    }

    setFeedbackPanelOpen(card, panel.hasAttribute("hidden"));
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

  function isShellNavigationEnabled() {
    return Boolean(getShellRoot() && getShellSidebar() && getShellContent());
  }

  function getShellRoot() {
    const shellRoot = root.querySelector(".shell-root");

    return shellRoot instanceof HTMLElement ? shellRoot : null;
  }

  function getShellSidebar() {
    const shellSidebar = root.querySelector(".shell-sidebar");

    return shellSidebar instanceof HTMLElement ? shellSidebar : null;
  }

  function getShellContent() {
    const shellContent = root.querySelector(".shell-content");

    return shellContent instanceof HTMLElement ? shellContent : null;
  }

  function getMobileTopNav() {
    const mobileTopNav = root.querySelector(".mobile-top-nav");

    return mobileTopNav instanceof HTMLElement ? mobileTopNav : null;
  }

  function shouldHandleShellNavigation(event, link) {
    if (!isShellNavigationEnabled()) {
      return false;
    }

    if (link.target && link.target !== "_self") {
      return false;
    }

    if (link.hasAttribute("download")) {
      return false;
    }

    if (event instanceof MouseEvent && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
      return false;
    }

    try {
      const targetUrl = new URL(link.href, window.location.href);
      return targetUrl.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  async function navigateShellPage(nextHref, options = { pushHistory: true, force: false }) {
    if (shellNavigationInFlight) {
      return;
    }

    const targetUrl = new URL(nextHref, window.location.href);
    const currentUrl = new URL(window.location.href);

    if (options.force !== true && targetUrl.pathname === currentUrl.pathname && targetUrl.search === currentUrl.search) {
      return;
    }

    const shellSidebar = getShellSidebar();

    if (!(shellSidebar instanceof HTMLElement)) {
      window.location.assign(targetUrl.toString());
      return;
    }

    shellNavigationInFlight = true;
    const sidebarScrollTop = shellSidebar.scrollTop;

    try {
      const response = await fetch(targetUrl.pathname + targetUrl.search, {
        headers: {
          accept: "text/html",
          [shellNavigationHeader]: "1"
        },
        credentials: "same-origin"
      });

      if (!response.ok) {
        window.location.assign(targetUrl.toString());
        return;
      }

      const nextHtml = await response.text();
      const nextDocument = new DOMParser().parseFromString(nextHtml, "text/html");

      if (!patchShellDocument(nextDocument)) {
        window.location.assign(targetUrl.toString());
        return;
      }

      if (options.pushHistory !== false) {
        window.history.pushState({ path: targetUrl.pathname + targetUrl.search }, "", targetUrl.toString());
      }

      document.title = nextDocument.title || document.title;
      syncThemeButtons(themeRoot.dataset.theme || "dark");
      shellSidebar.scrollTop = sidebarScrollTop;
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch {
      window.location.assign(targetUrl.toString());
    } finally {
      shellNavigationInFlight = false;
    }
  }

  function patchShellDocument(nextDocument) {
    const currentShellContent = getShellContent();
    const currentShellSidebar = getShellSidebar();
    const nextShellContent = nextDocument.querySelector(".shell-content");
    const nextShellSidebar = nextDocument.querySelector(".shell-sidebar");

    if (!(currentShellContent instanceof HTMLElement) || !(currentShellSidebar instanceof HTMLElement)) {
      return false;
    }

    if (!(nextShellContent instanceof HTMLElement) || !(nextShellSidebar instanceof HTMLElement)) {
      return false;
    }

    currentShellContent.innerHTML = nextShellContent.innerHTML;
    currentShellSidebar.innerHTML = nextShellSidebar.innerHTML;
    patchMobileTopNav(nextDocument);
    return true;
  }

  function patchMobileTopNav(nextDocument) {
    const currentMobileTopNav = getMobileTopNav();
    const nextMobileTopNav = nextDocument.querySelector(".mobile-top-nav");

    if (currentMobileTopNav instanceof HTMLElement && nextMobileTopNav instanceof HTMLElement) {
      currentMobileTopNav.replaceWith(nextMobileTopNav);
      closeMobileSystemDrawer();
      return;
    }

    if (currentMobileTopNav instanceof HTMLElement) {
      currentMobileTopNav.remove();
      return;
    }

    if (nextMobileTopNav instanceof HTMLElement) {
      const shellRoot = getShellRoot();

      if (shellRoot instanceof HTMLElement) {
        shellRoot.before(nextMobileTopNav);
      }
    }
  }

  function getMobileSystemToggle() {
    const toggle = root.querySelector("[data-mobile-system-toggle]");

    return toggle instanceof HTMLButtonElement ? toggle : null;
  }

  function getMobileSystemDrawer() {
    const drawer = root.querySelector("#mobile-system-drawer");

    return drawer instanceof HTMLElement ? drawer : null;
  }

  function isMobileSystemDrawerOpen() {
    const toggle = getMobileSystemToggle();
    const drawer = getMobileSystemDrawer();

    if (toggle instanceof HTMLButtonElement) {
      return toggle.getAttribute("aria-expanded") === "true";
    }

    return drawer instanceof HTMLElement && !drawer.hasAttribute("hidden");
  }

  function setMobileSystemDrawerOpen(isOpen) {
    const toggle = getMobileSystemToggle();
    const drawer = getMobileSystemDrawer();

    if (toggle instanceof HTMLButtonElement) {
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    if (drawer instanceof HTMLElement) {
      drawer.toggleAttribute("hidden", !isOpen);
    }
  }

  function toggleMobileSystemDrawer() {
    setMobileSystemDrawerOpen(!isMobileSystemDrawerOpen());
  }

  function closeMobileSystemDrawer() {
    setMobileSystemDrawerOpen(false);
  }

  function escapeCssAttributeValue(value) {
    // Draft scope values are controlled, but the fallback keeps the selector valid in older runtimes without CSS.escape.
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }

    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
