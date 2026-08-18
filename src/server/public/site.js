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
  const contentSourceStorageKey = "hot-now-content-sources";
  let globalStatusTimerId = null;
  let shellNavigationInFlight = false;

  applyInitialTheme();
  hydrateContentSourceFilter();
  closeMobileSystemDrawer();

  root.addEventListener("change", async (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
      return;
    }

    const filter = target.closest("[data-content-source-filter]");

    if (!(filter instanceof HTMLFormElement)) {
      return;
    }

    persistContentSourceSelection(filter);
    await refreshCurrentContentSourceView();
  });

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

    const sourceFilterAction = target.closest("[data-source-filter-action]");

    if (sourceFilterAction instanceof HTMLButtonElement) {
      const filter = sourceFilterAction.closest("[data-content-source-filter]");

      if (!(filter instanceof HTMLFormElement)) {
        return;
      }

      event.preventDefault();

      if (sourceFilterAction.dataset.sourceFilterAction === "all") {
        syncContentSourceCheckboxes(filter, readRenderedSourceKinds(filter));
      }

      if (sourceFilterAction.dataset.sourceFilterAction === "clear") {
        syncContentSourceCheckboxes(filter, []);
      }

      persistContentSourceSelection(filter);
      await refreshCurrentContentSourceView();
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

    if (target.dataset.systemAction === "provider-settings-activation") {
      event.preventDefault();
      await handleProviderSettingsActivation(target);
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
