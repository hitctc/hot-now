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
      showStatus(card, "收藏操作失败，请稍后再试。");
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
      showStatus(card, "反馈提交失败，请稍后再试。");
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
      showStatus(card, "评分保存失败，请稍后再试。");
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

  function showStatus(card, message) {
    // Per-card status text keeps feedback local to the item the user just interacted with.
    const statusNode = card.querySelector('[data-role="action-status"]');

    if (statusNode) {
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
})();
