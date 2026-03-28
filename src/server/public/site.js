(function () {
  const root = document;

  root.addEventListener("click", async (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
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

    if (target.dataset.systemAction === "activate-source") {
      event.preventDefault();
      await handleActivateSource(target);
      return;
    }

    if (target.dataset.systemAction === "manual-collection-run") {
      event.preventDefault();
      await handleManualCollectionRun(target);
      return;
    }

    if (target.dataset.contentAction !== "ratings") {
      return;
    }

    const card = target.closest("[data-content-id]");

    if (!(card instanceof HTMLElement)) {
      return;
    }

    const contentId = Number(card.dataset.contentId);

    if (!Number.isInteger(contentId) || contentId <= 0) {
      return;
    }

    event.preventDefault();
    await handleRatings(card, target, contentId);
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

  async function handleRatings(card, form, contentId) {
    // Ratings submit only filled dimensions and leave unselected dimensions untouched.
    const formData = new FormData(form);
    const scores = {};

    for (const [rawKey, rawValue] of formData.entries()) {
      if (typeof rawKey !== "string" || typeof rawValue !== "string") {
        continue;
      }

      if (!rawValue) {
        continue;
      }

      const parsedScore = Number(rawValue);

      if (!Number.isFinite(parsedScore)) {
        continue;
      }

      scores[rawKey] = parsedScore;
    }

    if (Object.keys(scores).length === 0) {
      showStatus(card, "请至少选择一个评分项。");
      return;
    }

    const response = await postJson(`/actions/content/${contentId}/ratings`, { scores });

    if (!response.ok) {
      showStatus(card, await readActionError(response, "评分保存失败，请稍后再试。"));
      return;
    }

    const payload = await safeJson(response);

    if (payload && typeof payload.averageRating === "number") {
      const averageNode = card.querySelector('[data-role="average-rating"]');

      if (averageNode) {
        averageNode.textContent = payload.averageRating.toFixed(2);
      }
    }

    showStatus(card, "评分已保存。");
  }

  async function handleViewRuleSave(form) {
    // Rule save parses textarea JSON first so malformed payloads fail before hitting server.
    const ruleKey = (form.dataset.ruleKey || "").trim();

    if (!ruleKey) {
      showFormStatus(form, "规则标识缺失，无法保存。");
      return;
    }

    const textarea = form.querySelector('[data-role="view-rule-config"]');

    if (!(textarea instanceof HTMLTextAreaElement)) {
      showFormStatus(form, "未找到配置输入框。");
      return;
    }

    let parsedConfig;

    try {
      parsedConfig = JSON.parse(textarea.value);
    } catch {
      showFormStatus(form, "JSON 格式错误，请先修正再保存。");
      return;
    }

    if (!isPlainObject(parsedConfig)) {
      showFormStatus(form, "配置必须是 JSON 对象。");
      return;
    }

    const response = await postJson(`/actions/view-rules/${encodeURIComponent(ruleKey)}`, { config: parsedConfig });

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "保存失败，请稍后再试。"));
      return;
    }

    showFormStatus(form, "规则已保存。");
  }

  async function handleActivateSource(form) {
    // Activating a source updates all source cards locally so users see the new single-active state immediately.
    const sourceKind = (form.dataset.sourceKind || "").trim();

    if (!sourceKind) {
      showFormStatus(form, "source kind 缺失，无法切换。");
      return;
    }

    const response = await postJson("/actions/sources/activate", { kind: sourceKind });

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "切换失败，请稍后再试。"));
      return;
    }

    const sourceCards = root.querySelectorAll('[data-system-card="source"]');

    for (const sourceCard of sourceCards) {
      if (!(sourceCard instanceof HTMLElement)) {
        continue;
      }

      const kind = (sourceCard.dataset.sourceKind || "").trim();
      const isActive = kind === sourceKind;
      const statusNode = sourceCard.querySelector('[data-role="source-active-state"]');
      const actionButton = sourceCard.querySelector('[data-role="activate-button"]');

      if (statusNode instanceof HTMLElement) {
        statusNode.textContent = isActive ? "当前启用" : "未启用";
      }

      if (actionButton instanceof HTMLButtonElement) {
        actionButton.disabled = isActive;
        actionButton.textContent = isActive ? "当前启用" : "设为当前启用";
      }
    }

    showFormStatus(form, "已切换当前启用 source。");
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

    if (payload?.reason === "unknown-dimensions" && Array.isArray(payload.unknownKeys) && payload.unknownKeys.length > 0) {
      return `评分项不存在：${payload.unknownKeys.join(", ")}`;
    }

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
      return "规则配置不合法，请检查 JSON 内容。";
    }

    if (payload?.reason === "invalid-source-kind") {
      return "source 参数不合法。";
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

  async function safeJson(response) {
    // Some action responses may intentionally be empty, so JSON parsing must stay best-effort.
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function isPlainObject(value) {
    // The frontend enforces object payloads so accidental scalar JSON cannot hit rule-save route.
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
})();
