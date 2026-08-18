
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

    const payload = readContentFeedbackPayload(form);
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
      apiKey
    });

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "厂商配置保存失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, "厂商配置已保存。", "success");
    await refreshCurrentShellPage();
  }

  async function handleProviderSettingsDelete(form) {
    const formData = new FormData(form);
    const providerKind = String(formData.get("providerKind") || "").trim();

    if (!providerKind) {
      showFormStatus(form, "请先选择一个厂商。", "error");
      return;
    }

    if (!window.confirm("确认删除当前厂商配置吗？")) {
      return;
    }

    const response = await postJson("/actions/view-rules/provider-settings/delete", { providerKind });

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "厂商配置删除失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, "厂商配置已删除。", "success");
    await refreshCurrentShellPage();
  }

  async function handleProviderSettingsActivation(form) {
    const formData = new FormData(form);
    const providerKind = String(formData.get("providerKind") || "").trim();
    const enableValue = String(formData.get("enable") || "").trim();

    if (!providerKind || (enableValue !== "true" && enableValue !== "false")) {
      showFormStatus(form, "请先选择厂商和启用状态。", "error");
      return;
    }

    const response = await postJson("/actions/view-rules/provider-settings/activation", {
      providerKind,
      enable: enableValue === "true"
    });

    if (!response.ok) {
      showFormStatus(form, await readSystemActionError(response, "厂商启用状态更新失败，请稍后再试。"), "error");
      return;
    }

    showFormStatus(form, enableValue === "true" ? "厂商已启用。" : "厂商已停用。", "success");
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
