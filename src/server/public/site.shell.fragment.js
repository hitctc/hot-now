  }

  async function refreshCurrentShellPage() {
    const currentHref = window.location.pathname + window.location.search;

    if (isShellNavigationEnabled()) {
      await navigateShellPage(currentHref, { pushHistory: false, force: true });
      return;
    }

    window.location.reload();
  }

  function buildShellFetchHeaders(targetUrl) {
    const headers = {
      accept: "text/html",
      [shellNavigationHeader]: "1"
    };

    if (isContentPathname(targetUrl.pathname)) {
      const storedKinds = readStoredContentSourceKinds();

      if (storedKinds !== null) {
        headers["x-hot-now-source-filter"] = storedKinds.join(",");
      }
    }

    return headers;
  }

  function hydrateContentSourceFilter() {
    const filter = root.querySelector("[data-content-source-filter]");

    if (!(filter instanceof HTMLFormElement)) {
      return;
    }

    const availableKinds = readRenderedSourceKinds(filter);
    const storedKinds = readStoredContentSourceKinds(availableKinds);

    if (storedKinds === null) {
      return;
    }

    syncContentSourceCheckboxes(filter, storedKinds);

    if (shouldRefreshHydratedContentSourceView(filter, storedKinds)) {
      void refreshCurrentContentSourceView();
    }
  }

  function shouldRefreshHydratedContentSourceView(filter, storedKinds) {
    if (!isContentPathname(window.location.pathname)) {
      return false;
    }

    return readSelectedSourceKindsFromFilter(filter).join(",") !== storedKinds.join(",");
  }

  function persistContentSourceSelection(filter) {
    writeStoredContentSourceKinds(readCheckedSourceKinds(filter));
  }

  function readCheckedSourceKinds(filter) {
    return [...filter.querySelectorAll("input[type='checkbox'][data-source-kind]")]
      .filter((checkbox) => checkbox instanceof HTMLInputElement && checkbox.checked)
      .map((checkbox) => checkbox.dataset.sourceKind)
      .filter((value) => typeof value === "string" && value.length > 0);
  }

  function readStoredContentSourceKinds(availableKinds = readRenderedSourceKinds()) {
    const parsed = readStringArrayStorage(contentSourceStorageKey);

    if (parsed === null) {
      return null;
    }

    const availableSet = new Set(availableKinds);
    return parsed.filter((kind, index, array) => availableSet.has(kind) && array.indexOf(kind) === index);
  }

  function writeStoredContentSourceKinds(selectedKinds) {
    writeStringArrayStorage(contentSourceStorageKey, selectedKinds);
  }

  function readStringArrayStorage(key) {
    try {
      const rawValue = localStorage.getItem(key);

      if (rawValue === null) {
        return null;
      }

      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
    } catch {
      return null;
    }
  }

  function writeStringArrayStorage(key, values) {
    try {
      localStorage.setItem(key, JSON.stringify(values));
    } catch {
      // Storage write failures should not block the shell from continuing to work.
    }
  }

  function refreshCurrentContentSourceView() {
    return navigateShellPage(window.location.pathname + window.location.search, { pushHistory: false, force: true });
  }

  function isContentPathname(pathname) {
    return pathname === "/" || pathname === "/ai-new" || pathname === "/ai-hot";
  }

  function syncContentSourceCheckboxes(filter, selectedKinds) {
    const selectedSet = new Set(selectedKinds);

    for (const checkbox of filter.querySelectorAll("input[type='checkbox'][data-source-kind]")) {
      if (!(checkbox instanceof HTMLInputElement)) {
        continue;
      }

      checkbox.checked = selectedSet.has(checkbox.dataset.sourceKind || "");
    }
  }

  function readRenderedSourceKinds(filter = root.querySelector("[data-content-source-filter]")) {
    if (!(filter instanceof HTMLElement)) {
      return [];
    }

    return [...filter.querySelectorAll("input[type='checkbox'][data-source-kind]")]
      .map((checkbox) => checkbox.getAttribute("data-source-kind") || "")
      .filter(Boolean);
  }

  function readSelectedSourceKindsFromFilter(filter) {
    const rawValue = filter.dataset.selectedSourceKinds || "";

    return rawValue
      .split(",")
      .map((kind) => kind.trim())
      .filter(Boolean);
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

  function readContentFeedbackPayload(form) {
    const formData = new FormData(form);

    return {
      freeText: String(formData.get("freeText") || ""),
      suggestedEffect: normalizeNullableValue(formData.get("suggestedEffect")),
      strengthLevel: normalizeNullableValue(formData.get("strengthLevel")),
      positiveKeywords: parseKeywordInput(String(formData.get("positiveKeywords") || "")),
      negativeKeywords: parseKeywordInput(String(formData.get("negativeKeywords") || ""))
    };
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
    // Theme boot reads persisted preference first and falls back to the shell's light default.
    const savedTheme = readStoredTheme();
    setTheme(savedTheme || "light", false);
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
        headers: buildShellFetchHeaders(targetUrl),
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
