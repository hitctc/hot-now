import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LatestReportEmailError, type LatestReportEmailErrorReason } from "../core/pipeline/sendLatestReportEmail.js";
import type { BuildContentPageModelOptions } from "../core/content/buildContentPageModel.js";
import type { ContentSortMode, ContentViewSelectionOptions } from "../core/content/buildContentViewSelection.js";
import type { ContentCardView, ContentViewKey } from "../core/content/listContentView.js";
import type { SaveFeedbackPoolEntryInput, SaveFeedbackPoolEntryResult } from "../core/feedback/feedbackPoolRepository.js";
import type {
  SaveProviderSettingsInput,
  SaveProviderSettingsResult,
  UpdateProviderSettingsActivationInput,
  UpdateProviderSettingsActivationResult
} from "../core/llm/providerSettingsRepository.js";
import type { RatingDimension, SaveRatingsResult } from "../core/ratings/ratingRepository.js";
import type { ContentSourceOption } from "../core/source/listContentSources.js";
import type {
  DeleteSourceResult,
  SaveSourceInput,
  SaveSourceResult,
  ToggleSourceResult,
  UpdateSourceDisplayModeResult
} from "../core/source/sourceMutationRepository.js";
import type { NlRuleScope } from "../core/strategy/nlRuleRepository.js";
import type { RunNlEvaluationCycleResult } from "../core/strategy/runNlEvaluationCycle.js";
import type { UpdateStrategyDraftInput, UpdateStrategyDraftResult } from "../core/strategy/strategyDraftRepository.js";
import type { RuntimeConfig } from "../core/types/appConfig.js";
import {
  createSessionToken,
  readSessionCookieToken,
  readSessionToken,
  serializeClearedSessionCookie,
  serializeSessionCookie
} from "../core/auth/session.js";
import {
  renderControlPage,
  renderHistoryPage,
  renderNoticePage
} from "./renderPages.js";
import { findAppShellPage, getAppShellPages, renderAppLayout } from "./renderAppLayout.js";
import { renderContentPage } from "./renderContentPages.js";
import {
  renderProfilePage,
  renderSourcesPage,
  renderViewRulesPage,
  type ProfileView,
  type SourcesSettingsView,
  type ViewRulesWorkbenchView
} from "./renderSystemPages.js";

type ReportSummary = {
  date: string;
  topicCount: number;
  degraded: boolean;
  mailStatus: string;
};
type ParseRatingScoresResult =
  | { ok: true; scores: Record<string, number> }
  | { ok: false; reason: "invalid-ratings-payload" };
type SourceCard = {
  kind: string;
  name: string;
  siteUrl: string;
  rssUrl: string | null;
  isEnabled: boolean;
  isBuiltIn: boolean;
  showAllWhenSelected: boolean;
  sourceType: string;
  bridgeKind: string | null;
  bridgeConfigSummary: string | null;
  bridgeInputMode: "feed_url" | "article_url" | null;
  bridgeInputValue: string | null;
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
type SourcesOperationSummary = {
  lastCollectionRunAt: string | null;
  lastSendLatestEmailAt: string | null;
};
type CurrentUserProfile = {
  username: string;
  displayName: string;
  role: string;
  email: string | null;
};
type ManualCollectResult = { accepted: true; action: "collect" };
type ManualSendLatestEmailResult =
  | { accepted: true; action: "send-latest-email" }
  | { accepted: false; reason: LatestReportEmailErrorReason };
type SaveNlRulesResult = { ok: true; run: RunNlEvaluationCycleResult } | { ok: false; reason: string };
type CancelNlEvaluationResult = { ok: true; accepted: boolean; status: "idle" | "cancelling" };
type CreateDraftFromFeedbackResult = { ok: true; draftId: number } | { ok: false; reason: "not-found" };
type DeleteFeedbackResult = boolean;
type ClearFeedbackResult = number;
type DeleteDraftResult = boolean;
type ContentPageKey = "ai-new" | "ai-hot";
type ContentPageModel = {
  pageKey: ContentPageKey;
  sourceFilter?: {
    options: { kind: string; name: string; showAllWhenSelected: boolean; currentPageVisibleCount: number }[];
    selectedSourceKinds: string[];
  };
  featuredCard: ContentCardView | null;
  cards: ContentCardView[];
  pagination: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
  } | null;
  emptyState: {
    title: string;
    description: string;
    tone: "default" | "degraded" | "filtered";
  } | null;
};

type ServerDeps = {
  clientBuildRoot?: string;
  clientDevOrigin?: string;
  readClientDevEntryHtml?: () => Promise<string | null> | string | null;
  config?: Partial<RuntimeConfig>;
  listReportSummaries?: () => Promise<ReportSummary[]>;
  latestReportDate?: () => Promise<string | null>;
  readReportHtml?: (date: string) => Promise<string>;
  triggerManualRun?: () => Promise<{ accepted: boolean }>;
  triggerManualCollect?: () => Promise<ManualCollectResult>;
  triggerManualSendLatestEmail?: () => Promise<ManualSendLatestEmailResult>;
  isRunning?: () => boolean;
  listContentView?: (
    viewKey: ContentViewKey,
    options?: Pick<ContentViewSelectionOptions, "selectedSourceKinds" | "sortMode">
  ) => Promise<ContentCardView[]> | ContentCardView[];
  listContentSources?: () => Promise<ContentSourceOption[]> | ContentSourceOption[];
  saveContentFeedback?: (
    contentItemId: number,
    input: Omit<SaveFeedbackPoolEntryInput, "contentItemId">
  ) => Promise<SaveFeedbackPoolEntryResult> | SaveFeedbackPoolEntryResult;
  listRatingDimensions?: () => Promise<RatingDimension[]> | RatingDimension[];
  saveRatings?: (contentItemId: number, scores: Record<string, number>) => Promise<SaveRatingsResult> | SaveRatingsResult;
  getViewRulesWorkbenchData?: () => Promise<ViewRulesWorkbenchView> | ViewRulesWorkbenchView;
  saveProviderSettings?: (input: SaveProviderSettingsInput) => Promise<SaveProviderSettingsResult> | SaveProviderSettingsResult;
  updateProviderSettingsActivation?: (
    input: UpdateProviderSettingsActivationInput
  ) => Promise<UpdateProviderSettingsActivationResult> | UpdateProviderSettingsActivationResult;
  deleteProviderSettings?: (providerKind: string) => Promise<boolean> | boolean;
  saveNlRules?: (
    rules: Record<NlRuleScope, { enabled: boolean; ruleText: string }>
  ) => Promise<SaveNlRulesResult> | SaveNlRulesResult;
  cancelNlEvaluation?: () => Promise<CancelNlEvaluationResult> | CancelNlEvaluationResult;
  createDraftFromFeedback?: (feedbackId: number) => Promise<CreateDraftFromFeedbackResult> | CreateDraftFromFeedbackResult;
  deleteFeedbackEntry?: (feedbackId: number) => Promise<DeleteFeedbackResult> | DeleteFeedbackResult;
  clearAllFeedback?: () => Promise<ClearFeedbackResult> | ClearFeedbackResult;
  saveStrategyDraft?: (input: UpdateStrategyDraftInput) => Promise<UpdateStrategyDraftResult> | UpdateStrategyDraftResult;
  deleteStrategyDraft?: (draftId: number) => Promise<DeleteDraftResult> | DeleteDraftResult;
  listSources?: () => Promise<SourceCard[]> | SourceCard[];
  getSourcesOperationSummary?: () => Promise<SourcesOperationSummary> | SourcesOperationSummary;
  createSource?: (input: SaveSourceInput) => Promise<SaveSourceResult> | SaveSourceResult;
  updateSource?: (input: SaveSourceInput) => Promise<SaveSourceResult> | SaveSourceResult;
  deleteSource?: (kind: string) => Promise<DeleteSourceResult> | DeleteSourceResult;
  toggleSource?: (kind: string, enable: boolean) => Promise<ToggleSourceResult> | ToggleSourceResult;
  updateSourceDisplayMode?: (
    kind: string,
    showAllWhenSelected: boolean
  ) => Promise<UpdateSourceDisplayModeResult> | UpdateSourceDisplayModeResult;
  getCurrentUserProfile?: () => Promise<CurrentUserProfile | null> | CurrentUserProfile | null;
  getContentPageModel?: (
    pageKey: ContentPageKey,
    options?: Pick<BuildContentPageModelOptions, "selectedSourceKinds" | "sortMode" | "page" | "searchKeyword">
  ) => Promise<ContentPageModel> | ContentPageModel;
  auth?: {
    requireLogin: boolean;
    sessionSecret: string;
    verifyLogin?: (
      username: string,
      password: string
    ) =>
      | Promise<{ username: string; displayName?: string | null; role?: string | null } | null>
      | { username: string; displayName?: string | null; role?: string | null }
      | null;
    sessionTtlSeconds?: number;
    secureCookie?: boolean;
  };
};

// This server keeps the old health route intact and layers report pages on top through dependency injection.
export function createServer(deps: ServerDeps = {}) {
  const app = Fastify({ logger: true });
  const authConfig = deps.auth;
  const authEnabled = authConfig?.requireLogin === true;
  const hasUnifiedShellDeps = Boolean(
    deps.listContentView || deps.getViewRulesWorkbenchData || deps.listSources || deps.getCurrentUserProfile
  );
  const siteCss = readSiteCss();
  const siteJs = readSiteJs();
  // Tests can override the client build root so missing-bundle scenarios do not mutate the process cwd.
  const clientBuildRoot = deps.clientBuildRoot ?? path.resolve(process.cwd(), "dist/client");
  const clientIndexPath = path.join(clientBuildRoot, "index.html");
  const clientDevOrigin = normalizeClientDevOrigin(deps.clientDevOrigin ?? null);

  app.get("/health", async () => ({ ok: true }));
  app.get("/assets/site.css", async (_request, reply) => reply.type("text/css; charset=utf-8").send(siteCss));
  app.get("/assets/site.js", async (_request, reply) => reply.type("application/javascript; charset=utf-8").send(siteJs));
  app.get("/client/*", async (request, reply) => {
    const { "*": rawAssetPath = "" } = request.params as { "*": string };
    const normalizedAssetPath = normalizeClientAssetPath(rawAssetPath);

    if (!normalizedAssetPath) {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    const resolvedAssetPath = path.resolve(clientBuildRoot, normalizedAssetPath);
    const clientBuildRootWithSeparator = `${clientBuildRoot}${path.sep}`;

    // The static client endpoint only serves files that remain under dist/client.
    if (!resolvedAssetPath.startsWith(clientBuildRootWithSeparator) && resolvedAssetPath !== clientBuildRoot) {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    const extension = path.extname(resolvedAssetPath).toLowerCase();

    if (extension !== ".js" && extension !== ".css") {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    try {
      const assetBody = readFileSync(resolvedAssetPath, "utf8");
      return reply.type(resolveClientAssetMimeType(extension)).send(assetBody);
    } catch {
      return reply.code(404).type("text/plain; charset=utf-8").send("Not Found");
    }
  });

  app.get("/api/settings/view-rules", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");

    if (session === undefined) {
      return;
    }

    return reply.send(await readSettingsViewRulesApiData(deps));
  });

  app.get("/api/settings/sources", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");

    if (session === undefined) {
      return;
    }

    return reply.send(await readSettingsSourcesApiData(deps));
  });

  app.get("/api/settings/profile", async (request, reply) => {
    const session = readSettingsApiSession(request, reply, authEnabled, authConfig?.sessionSecret ?? "");

    if (session === undefined) {
      return;
    }

    return reply.send({ profile: await readSettingsProfileApiData(deps, session) });
  });

  app.get("/api/content/ai-new", async (request, reply) => {
    return reply.send(await readContentPageModelApiData(deps, request, "ai-new"));
  });

  app.get("/api/content/ai-hot", async (request, reply) => {
    return reply.send(await readContentPageModelApiData(deps, request, "ai-hot"));
  });

  if (authEnabled) {
    app.get("/login", async (request, reply) => {
      const existingSession = readAuthenticatedSession(request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (existingSession) {
        return reply.redirect("/");
      }

      return reply.type("text/html").send(renderLoginPage());
    });

    app.post("/login", async (request, reply) => {
      if (!authConfig?.verifyLogin) {
        return reply.code(503).send({ ok: false, reason: "login-disabled" });
      }

      const body = request.body as { username?: unknown; password?: unknown } | undefined;
      const username = typeof body?.username === "string" ? body.username.trim() : "";
      const password = typeof body?.password === "string" ? body.password : "";

      if (!username || !password) {
        return reply.code(400).send({ ok: false, reason: "invalid-credentials-format" });
      }

      const user = await authConfig.verifyLogin(username, password);

      if (!user) {
        return reply.code(401).send({ ok: false, reason: "invalid-credentials" });
      }

      const sessionToken = createSessionToken(
        {
          username: user.username,
          displayName: user.displayName?.trim() || user.username,
          role: user.role?.trim() || "admin"
        },
        authConfig.sessionSecret,
        { maxAgeSeconds: authConfig.sessionTtlSeconds }
      );

      reply.header(
        "set-cookie",
        serializeSessionCookie(sessionToken, {
          maxAgeSeconds: authConfig.sessionTtlSeconds,
          secure: authConfig.secureCookie
        })
      );

      return reply.redirect("/");
    });

    app.post("/logout", async (request, reply) => {
      reply.header(
        "set-cookie",
        serializeClearedSessionCookie({
          secure: authConfig?.secureCookie
        })
      );

      if (request.headers.accept?.includes("application/json")) {
        return reply.send({ ok: true });
      }

      return reply.redirect("/login");
    });

    for (const page of getAppShellPages()) {
      app.get(page.path, async (request, reply) => {
        const currentPage = findAppShellPage(page.path);

        if (!currentPage) {
          return reply.code(404).type("text/html").send(renderNoticePage("HotNow", "页面不存在"));
        }

        const session = readAuthenticatedSession(request.headers.cookie, authConfig?.sessionSecret ?? "");

        // Content pages stay readable without a session, but system pages still require an authenticated user.
        if (!session && currentPage.section === "system") {
          return reply.redirect("/login");
        }

        if (isClientSettingsPath(currentPage.path)) {
          return await serveClientSettingsShell(reply, clientIndexPath, {
            clientDevOrigin,
            readClientDevEntryHtml: deps.readClientDevEntryHtml
          });
        }

        if (currentPage.section === "content") {
          return await serveClientContentShell(reply, clientIndexPath, {
            clientDevOrigin,
            readClientDevEntryHtml: deps.readClientDevEntryHtml
          });
        }

        const contentHtml = await renderSystemPageForPath(deps, currentPage.path, Boolean(session));

        return reply.type("text/html").send(
          renderAppLayout({
            currentPath: currentPage.path,
            page: currentPage,
            user: session
              ? {
                  username: session.username,
                  displayName: session.displayName,
                  role: session.role
                }
              : undefined,
            showSystemMenu: Boolean(session),
            loginHref: session ? undefined : "/login",
            contentHtml
          })
        );
      });
    }
  } else if (hasUnifiedShellDeps) {
    for (const page of getAppShellPages()) {
      app.get(page.path, async (request, reply) => {
        const currentPage = findAppShellPage(page.path);

        if (!currentPage) {
          return reply.code(404).type("text/html").send(renderNoticePage("HotNow", "页面不存在"));
        }

        if (isClientSettingsPath(currentPage.path)) {
          return await serveClientSettingsShell(reply, clientIndexPath, {
            clientDevOrigin,
            readClientDevEntryHtml: deps.readClientDevEntryHtml
          });
        }

        if (currentPage.section === "content") {
          return await serveClientContentShell(reply, clientIndexPath, {
            clientDevOrigin,
            readClientDevEntryHtml: deps.readClientDevEntryHtml
          });
        }

        const contentHtml = await renderSystemPageForPath(deps, currentPage.path, false);

        return reply.type("text/html").send(
          renderAppLayout({
            currentPath: currentPage.path,
            page: currentPage,
            contentHtml
          })
        );
      });
    }
  } else {
    app.get("/", async (_request, reply) => {
      const latestDate = await deps.latestReportDate?.();

      if (!latestDate) {
        return reply.type("text/html").send(renderNoticePage("HotNow 最新报告", "今日尚未生成报告"));
      }

      if (!deps.readReportHtml) {
        return reply.code(503).type("text/html").send(renderNoticePage("HotNow 最新报告", "报告内容暂不可用"));
      }

      const html = await deps.readReportHtml(latestDate);
      return reply.type("text/html").send(html);
    });
  }

  app.get("/history", async (_request, reply) => {
    if (authEnabled) {
      // Legacy pages stay mounted for compatibility, but unified auth mode requires a valid session first.
      const session = readAuthenticatedSession(_request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (!session) {
        return reply.redirect("/login");
      }
    }

    const summaries = (await deps.listReportSummaries?.()) ?? [];
    return reply.type("text/html").send(renderHistoryPage(summaries));
  });

  app.get("/reports/:date", async (request, reply) => {
    if (authEnabled) {
      const session = readAuthenticatedSession(request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (!session) {
        return reply.redirect("/login");
      }
    }

    if (!deps.readReportHtml) {
      return reply.code(503).type("text/html").send(renderNoticePage("HotNow 报告", "报告内容暂不可用"));
    }

    const { date } = request.params as { date: string };
    const html = await deps.readReportHtml(date);
    return reply.type("text/html").send(html);
  });

  app.get("/control", async (_request, reply) => {
    if (authEnabled) {
      const session = readAuthenticatedSession(_request.headers.cookie, authConfig?.sessionSecret ?? "");

      if (!session) {
        return reply.redirect("/login");
      }
    }

    return reply.type("text/html").send(renderControlPage(deps.config, deps.isRunning?.() ?? false));
  });

  app.post("/actions/run", async (request, reply) => {
    return await handleManualCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualCollect ?? deps.triggerManualRun
    );
  });

  app.post("/actions/collect", async (request, reply) => {
    return await handleManualCollectAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualCollect ?? deps.triggerManualRun
    );
  });

  app.post("/actions/send-latest-email", async (request, reply) => {
    return await handleManualSendLatestEmailAction(
      request,
      reply,
      authEnabled,
      authConfig?.sessionSecret ?? "",
      deps.isRunning?.() ?? false,
      deps.triggerManualSendLatestEmail
    );
  });

  app.post("/actions/content/:id/feedback-pool", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.saveContentFeedback) {
      return reply.code(503).send({ ok: false, reason: "content-feedback-disabled" });
    }

    const contentItemId = parseContentItemId(request.params);

    if (!contentItemId) {
      return reply.code(400).send({ ok: false, reason: "invalid-content-id" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const positiveKeywords = parseStringArray(body?.positiveKeywords);
    const negativeKeywords = parseStringArray(body?.negativeKeywords);

    if (!positiveKeywords.ok || !negativeKeywords.ok) {
      return reply.code(400).send({ ok: false, reason: "invalid-feedback-payload" });
    }

    const input = {
      freeText: typeof body?.freeText === "string" ? body.freeText : null,
      suggestedEffect: isSuggestedEffect(body?.suggestedEffect) ? body.suggestedEffect : null,
      strengthLevel: isStrengthLevel(body?.strengthLevel) ? body.strengthLevel : null,
      positiveKeywords: positiveKeywords.values,
      negativeKeywords: negativeKeywords.values
    } satisfies Omit<SaveFeedbackPoolEntryInput, "contentItemId">;

    const result = await deps.saveContentFeedback(contentItemId, input);

    if (!result.ok) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, contentItemId, entryId: result.entryId });
  });

  app.post("/actions/content/:id/ratings", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.saveRatings) {
      return reply.code(503).send({ ok: false, reason: "content-actions-disabled" });
    }

    const contentItemId = parseContentItemId(request.params);

    if (!contentItemId) {
      return reply.code(400).send({ ok: false, reason: "invalid-content-id" });
    }

    const body = request.body as { scores?: unknown } | undefined;
    const parsedScores = parseRatingScores(body?.scores);

    if (!parsedScores.ok) {
      return reply.code(400).send({ ok: false, reason: "invalid-ratings-payload" });
    }

    const result = await deps.saveRatings(contentItemId, parsedScores.scores);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    if (!result.ok && result.reason === "unknown-dimensions") {
      return reply.code(400).send({ ok: false, reason: "unknown-dimensions", unknownKeys: result.unknownKeys });
    }

    return reply.send({
      ok: true,
      contentItemId,
      saved: result.saved,
      averageRating: result.averageRating
    });
  });

  app.post("/actions/view-rules/provider-settings", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.saveProviderSettings) {
      return reply.code(503).send({ ok: false, reason: "provider-settings-disabled" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const providerKind = typeof body?.providerKind === "string" ? body.providerKind.trim() : "";
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";

    if (!isProviderKind(providerKind) || !apiKey) {
      return reply.code(400).send({ ok: false, reason: "invalid-provider-settings" });
    }

    const result = await deps.saveProviderSettings({
      providerKind,
      apiKey
    });

    if (!result.ok && result.reason === "master-key-required") {
      return reply.code(409).send({ ok: false, reason: "master-key-required" });
    }

    return reply.send({ ok: true, providerKind });
  });

  app.post("/actions/view-rules/provider-settings/activation", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.updateProviderSettingsActivation) {
      return reply.code(503).send({ ok: false, reason: "provider-settings-disabled" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const providerKind = typeof body?.providerKind === "string" ? body.providerKind.trim() : "";
    const enable = typeof body?.enable === "boolean" ? body.enable : null;

    if (!isProviderKind(providerKind) || enable === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-provider-activation" });
    }

    const result = await deps.updateProviderSettingsActivation({
      providerKind,
      enable
    });

    if (!result.ok && result.reason === "not-found") {
      return reply.code(409).send({ ok: false, reason: "provider-settings-not-found" });
    }

    return reply.send({ ok: true, providerKind, isEnabled: enable });
  });

  app.post("/actions/view-rules/provider-settings/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.deleteProviderSettings) {
      return reply.code(503).send({ ok: false, reason: "provider-settings-disabled" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const providerKind = typeof body?.providerKind === "string" ? body.providerKind.trim() : "";

    if (!isProviderKind(providerKind)) {
      return reply.code(400).send({ ok: false, reason: "invalid-provider-settings" });
    }

    await deps.deleteProviderSettings(providerKind);
    return reply.send({ ok: true });
  });

  app.post("/actions/view-rules/nl-rules", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.saveNlRules) {
      return reply.code(503).send({ ok: false, reason: "nl-rules-disabled" });
    }

    const body = request.body as { rules?: unknown } | undefined;

    if (!isPlainObject(body?.rules)) {
      return reply.code(400).send({ ok: false, reason: "invalid-nl-rules-payload" });
    }

    const rules = {
      base: readNlGatePayload(body.rules.base),
      ai_new: readNlGatePayload(body.rules.ai_new),
      ai_hot: readNlGatePayload(body.rules.ai_hot)
    } satisfies Record<NlRuleScope, { enabled: boolean; ruleText: string }>;

    const result = await deps.saveNlRules(rules);

    if (!result.ok) {
      return reply.code(409).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, run: result.run });
  });

  app.post("/actions/view-rules/nl-rules/cancel", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.cancelNlEvaluation) {
      return reply.code(503).send({ ok: false, reason: "nl-rules-disabled" });
    }

    return reply.send(await deps.cancelNlEvaluation());
  });

  app.post("/actions/feedback-pool/:id/create-draft", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.createDraftFromFeedback) {
      return reply.code(503).send({ ok: false, reason: "feedback-pool-disabled" });
    }

    const feedbackId = parseNumericRouteId(request.params, "id");

    if (!feedbackId) {
      return reply.code(400).send({ ok: false, reason: "invalid-feedback-id" });
    }

    const result = await deps.createDraftFromFeedback(feedbackId);

    if (!result.ok) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, draftId: result.draftId });
  });

  app.post("/actions/feedback-pool/:id/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.deleteFeedbackEntry) {
      return reply.code(503).send({ ok: false, reason: "feedback-pool-disabled" });
    }

    const feedbackId = parseNumericRouteId(request.params, "id");

    if (!feedbackId) {
      return reply.code(400).send({ ok: false, reason: "invalid-feedback-id" });
    }

    const deleted = await deps.deleteFeedbackEntry(feedbackId);

    if (!deleted) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, feedbackId });
  });

  app.post("/actions/feedback-pool/clear", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.clearAllFeedback) {
      return reply.code(503).send({ ok: false, reason: "feedback-pool-disabled" });
    }

    const cleared = await deps.clearAllFeedback();
    return reply.send({ ok: true, cleared });
  });

  app.post("/actions/strategy-drafts/:id/save", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.saveStrategyDraft) {
      return reply.code(503).send({ ok: false, reason: "strategy-drafts-disabled" });
    }

    const draftId = parseNumericRouteId(request.params, "id");

    if (!draftId) {
      return reply.code(400).send({ ok: false, reason: "invalid-draft-id" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const positiveKeywords = parseStringArray(body?.positiveKeywords);
    const negativeKeywords = parseStringArray(body?.negativeKeywords);

    if (!positiveKeywords.ok || !negativeKeywords.ok || typeof body?.draftText !== "string") {
      return reply.code(400).send({ ok: false, reason: "invalid-draft-payload" });
    }

    const result = await deps.saveStrategyDraft({
      id: draftId,
      draftText: body.draftText,
      suggestedScope: isStrategyDraftScope(body?.suggestedScope) ? body.suggestedScope : "unspecified",
      draftEffectSummary: typeof body?.draftEffectSummary === "string" ? body.draftEffectSummary : null,
      positiveKeywords: positiveKeywords.values,
      negativeKeywords: negativeKeywords.values
    });

    if (!result.ok) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, draftId });
  });

  app.post("/actions/strategy-drafts/:id/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.deleteStrategyDraft) {
      return reply.code(503).send({ ok: false, reason: "strategy-drafts-disabled" });
    }

    const draftId = parseNumericRouteId(request.params, "id");

    if (!draftId) {
      return reply.code(400).send({ ok: false, reason: "invalid-draft-id" });
    }

    const deleted = await deps.deleteStrategyDraft(draftId);

    if (!deleted) {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, draftId });
  });

  app.post("/actions/sources/toggle", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.toggleSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const body = request.body as { kind?: unknown; enable?: unknown } | undefined;
    const kind = typeof body?.kind === "string" ? body.kind.trim() : "";
    const enable = typeof body?.enable === "boolean" ? body.enable : null;

    if (!kind) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-kind" });
    }

    if (enable === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-enable" });
    }

    const result = await deps.toggleSource(kind, enable);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, kind, enable });
  });

  app.post("/actions/sources/create", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.createSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const payload = parseSourceSavePayload(request.body);

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-payload" });
    }

    const result = await deps.createSource({ ...payload, mode: "create" });
    return sendSourceSaveResult(reply, result);
  });

  app.post("/actions/sources/update", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.updateSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const payload = parseSourceSavePayload(request.body);

    if (!payload) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-payload" });
    }

    const result = await deps.updateSource({ ...payload, mode: "update" });
    return sendSourceSaveResult(reply, result);
  });

  app.post("/actions/sources/delete", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.deleteSource) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const body = request.body as { kind?: unknown } | undefined;
    const kind = typeof body?.kind === "string" ? body.kind.trim() : "";

    if (!kind) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-payload" });
    }

    const result = await deps.deleteSource(kind);

    if (!result.ok) {
      if (result.reason === "not-found") {
        return reply.code(404).send({ ok: false, reason: "not-found" });
      }

      return reply.code(409).send({ ok: false, reason: result.reason });
    }

    return reply.send({ ok: true, kind: result.kind });
  });

  app.post("/actions/sources/display-mode", async (request, reply) => {
    if (!ensureStateActionAuthorized(request, reply, authEnabled, authConfig?.sessionSecret ?? "")) {
      return;
    }

    if (!deps.updateSourceDisplayMode) {
      return reply.code(503).send({ ok: false, reason: "sources-disabled" });
    }

    const body = request.body as { kind?: unknown; showAllWhenSelected?: unknown } | undefined;
    const kind = typeof body?.kind === "string" ? body.kind.trim() : "";
    const showAllWhenSelected = typeof body?.showAllWhenSelected === "boolean" ? body.showAllWhenSelected : null;

    if (!kind) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-kind" });
    }

    if (showAllWhenSelected === null) {
      return reply.code(400).send({ ok: false, reason: "invalid-source-display-mode" });
    }

    const result = await deps.updateSourceDisplayMode(kind, showAllWhenSelected);

    if (!result.ok && result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    return reply.send({ ok: true, kind, showAllWhenSelected });
  });

  return app;
}

function parseSourceSavePayload(body: unknown): SaveSourceInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const sourceType = typeof payload.sourceType === "string" ? payload.sourceType.trim() : "";
  const kind = typeof payload.kind === "string" ? payload.kind.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const siteUrl = typeof payload.siteUrl === "string" ? payload.siteUrl.trim() : "";

  if (!kind || !name || !siteUrl) {
    return null;
  }

  if (sourceType === "rss") {
    const rssUrl = typeof payload.rssUrl === "string" ? payload.rssUrl.trim() : "";

    if (!rssUrl) {
      return null;
    }

    return {
      mode: "create",
      sourceType: "rss",
      kind,
      name,
      siteUrl,
      rssUrl
    };
  }

  if (sourceType !== "wechat_bridge") {
    return null;
  }

  const bridgeKind = typeof payload.bridgeKind === "string" ? payload.bridgeKind.trim() : "";
  const inputMode = typeof payload.inputMode === "string" ? payload.inputMode.trim() : "";

  if (bridgeKind !== "wechat2rss") {
    return null;
  }

  if (inputMode === "feed_url") {
    const feedUrl = typeof payload.feedUrl === "string" ? payload.feedUrl.trim() : "";

    if (!feedUrl) {
      return null;
    }

    return {
      mode: "create",
      sourceType: "wechat_bridge",
      kind,
      name,
      siteUrl,
      bridgeKind: "wechat2rss",
      inputMode: "feed_url",
      feedUrl
    };
  }

  if (inputMode === "article_url") {
    const articleUrl = typeof payload.articleUrl === "string" ? payload.articleUrl.trim() : "";

    if (!articleUrl) {
      return null;
    }

    return {
      mode: "create",
      sourceType: "wechat_bridge",
      kind,
      name,
      siteUrl,
      bridgeKind: "wechat2rss",
      inputMode: "article_url",
      articleUrl
    };
  }

  return null;
}

function sendSourceSaveResult(reply: FastifyReply, result: SaveSourceResult) {
  if (!result.ok) {
    if (result.reason === "not-found") {
      return reply.code(404).send({ ok: false, reason: "not-found" });
    }

    if (result.reason === "wechat-bridge-disabled") {
      return reply.code(503).send({ ok: false, reason: "wechat-bridge-disabled" });
    }

    if (result.reason === "bridge-registration-failed") {
      return reply.code(502).send({ ok: false, reason: "bridge-registration-failed" });
    }

    return reply.code(409).send({ ok: false, reason: result.reason });
  }

  return reply.send({ ok: true, kind: result.kind });
}

function readAuthenticatedSession(cookieHeader: string | undefined, sessionSecret: string) {
  // Session parsing is centralized so every protected route shares one validation path.
  const sessionToken = readSessionCookieToken(cookieHeader);

  if (!sessionToken || !sessionSecret) {
    return null;
  }

  return readSessionToken(sessionToken, sessionSecret);
}

function readSettingsApiSession(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string
) {
  // The read API mirrors the page-level auth rule, but API callers receive JSON 401 instead of a redirect.
  const session = readAuthenticatedSession(request.headers.cookie, sessionSecret);

  if (authEnabled && !session) {
    reply.code(401).send({ ok: false, reason: "unauthorized" });
    return undefined;
  }

  return session;
}

async function readSettingsViewRulesApiData(deps: ServerDeps): Promise<ViewRulesWorkbenchView> {
  // The API reuses the exact workbench model the page renderer consumes so the Vue client does not need duplicate mapping.
  const workbench = deps.getViewRulesWorkbenchData ? await deps.getViewRulesWorkbenchData() : null;

  if (!workbench) {
    return {
      providerSettings: [],
      providerCapability: {
        hasMasterKey: false,
        featureAvailable: false,
        message: "当前没有可读取的策略工作台数据。"
      },
      nlRules: defaultNlRules(),
      feedbackPool: [],
      strategyDrafts: [],
      latestEvaluationRun: null,
      isEvaluationRunning: false,
      isEvaluationStopRequested: false
    };
  }

  return workbench;
}

async function readSettingsSourcesApiData(deps: ServerDeps): Promise<SourcesSettingsView> {
  // Sources workbench uses独立来源统计，不再依赖内容页当前筛选上下文。
  const sources = ((await deps.listSources?.()) ?? []) as SourceCard[];
  const operationSummary = deps.getSourcesOperationSummary
    ? await deps.getSourcesOperationSummary()
    : { lastCollectionRunAt: null, lastSendLatestEmailAt: null };

  return {
    sources,
    operations: {
      lastCollectionRunAt: operationSummary.lastCollectionRunAt,
      lastSendLatestEmailAt: operationSummary.lastSendLatestEmailAt,
      canTriggerManualCollect: typeof (deps.triggerManualCollect ?? deps.triggerManualRun) === "function",
      canTriggerManualSendLatestEmail: typeof deps.triggerManualSendLatestEmail === "function",
      isRunning: deps.isRunning?.() ?? false
    }
  };
}

async function readSettingsProfileApiData(
  deps: ServerDeps,
  session: ReturnType<typeof readAuthenticatedSession> | null
): Promise<ProfileView | null> {
  // Profile uses the same single-user DB row as the page renderer, but strips HTML concerns out of the response.
  const profile = deps.getCurrentUserProfile ? await deps.getCurrentUserProfile() : null;

  if (!profile) {
    return null;
  }

  return {
    username: profile.username,
    displayName: profile.displayName,
    role: profile.role,
    email: profile.email,
    loggedIn: Boolean(session)
  };
}

async function readClientEntryHtml(
  clientIndexPath: string,
  options: {
    clientDevOrigin: string | null;
    readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined;
  }
): Promise<string> {
  const devClientEntryHtml = await tryReadClientDevEntryHtml(options.clientDevOrigin, options.readClientDevEntryHtml);

  if (devClientEntryHtml) {
    return devClientEntryHtml;
  }

  // Unified shell routes prefer the built client entry, but still need a readable fallback when the frontend bundle is absent.
  try {
    return readFileSync(clientIndexPath, "utf8");
  } catch {
    // Missing frontend assets should fail loudly with a readable hint instead of referencing fake bundle names.
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HotNow 客户端资源未准备好</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: #eef3ff;
        background: #111722;
      }
      main {
        max-width: 560px;
        padding: 24px 28px;
        border: 1px solid rgba(126, 162, 255, 0.28);
        border-radius: 18px;
        background: rgba(23, 31, 44, 0.92);
        box-shadow: 0 24px 48px rgba(3, 8, 18, 0.48);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0;
        line-height: 1.7;
        color: #c4cedf;
      }
      code {
        font-family: "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
        color: #7ea2ff;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>客户端资源未准备好</h1>
      <p>请先运行 <code>npm run build:client</code>，或者重新执行 <code>npm run dev</code> / <code>npm run dev:local</code> 后再刷新。</p>
    </main>
  </body>
</html>
`;
  }
}

// 本地开发时允许 3030 页面直接借用 Vite dev server 的 HTML，这样入口路径不变也能拿到 HMR 和 Vue DevTools。
async function tryReadClientDevEntryHtml(
  clientDevOrigin: string | null,
  readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined
): Promise<string | null> {
  if (!clientDevOrigin) {
    return null;
  }

  const rawClientDevEntryHtml = readClientDevEntryHtml
    ? await readClientDevEntryHtml()
    : await fetchClientDevEntryHtml(clientDevOrigin);

  if (!rawClientDevEntryHtml?.trim()) {
    return null;
  }

  return rewriteClientDevEntryHtml(rawClientDevEntryHtml, clientDevOrigin);
}

// 这里只探测 Vite dev server 的根 HTML；失败时会自动回退到 dist/client，不把开发辅助能力变成硬依赖。
async function fetchClientDevEntryHtml(clientDevOrigin: string): Promise<string | null> {
  try {
    const response = await fetch(`${clientDevOrigin}/client/`, {
      headers: {
        Accept: "text/html"
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

// 开发态 HTML 会继续挂在 3030 域名下，所以这里把 /client/... 资源改写成 5173 绝对地址，避免还去命中构建产物。
function rewriteClientDevEntryHtml(clientEntryHtml: string, clientDevOrigin: string): string {
  const normalizedClientDevAssetBase = `${clientDevOrigin}/client/`;

  return clientEntryHtml
    .replaceAll('="/client/', `="${normalizedClientDevAssetBase}`)
    .replaceAll("='/client/", `='${normalizedClientDevAssetBase}`);
}

// 开发态入口只接受 origin 级配置，尾部斜杠统一在这里收掉，后面拼接 /client/ 时就不会重复。
function normalizeClientDevOrigin(clientDevOrigin: string | null): string | null {
  const normalizedClientDevOrigin = clientDevOrigin?.trim().replace(/\/+$/, "") ?? "";

  return normalizedClientDevOrigin ? normalizedClientDevOrigin : null;
}

function isClientSettingsPath(pathname: string) {
  // Settings routes still need a dedicated branch because legacy pages remain server-rendered.
  return pathname.startsWith("/settings/");
}

async function serveClientSettingsShell(
  reply: FastifyReply,
  clientIndexPath: string,
  options: {
    clientDevOrigin: string | null;
    readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined;
  }
) {
  // System pages should always render the latest available client entry.
  return reply.type("text/html; charset=utf-8").send(await readClientEntryHtml(clientIndexPath, options));
}

async function serveClientContentShell(
  reply: FastifyReply,
  clientIndexPath: string,
  options: {
    clientDevOrigin: string | null;
    readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined;
  }
) {
  // Content routes use the same live client entry and recover as soon as a client build exists.
  return reply.type("text/html; charset=utf-8").send(await readClientEntryHtml(clientIndexPath, options));
}

function normalizeClientAssetPath(rawAssetPath: string): string | null {
  // Static asset requests are normalized once so path traversal checks can operate on a clean relative path.
  const trimmedPath = rawAssetPath.trim().replace(/\\/g, "/");

  if (!trimmedPath) {
    return null;
  }

  const normalizedPath = path.posix.normalize(trimmedPath).replace(/^\/+/, "");

  if (!normalizedPath || normalizedPath === "." || normalizedPath.startsWith("..")) {
    return null;
  }

  return normalizedPath;
}

function resolveClientAssetMimeType(extension: string): string {
  // The client bundle only exposes CSS and JS in this phase, so a two-branch mime map is enough.
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }

  return "application/javascript; charset=utf-8";
}

function readSiteCss() {
  // CSS is loaded from the source tree so both tsx dev and built runtime can serve one shared stylesheet.
  try {
    return readFileSync(new URL("./public/site.css", import.meta.url), "utf8");
  } catch {
    try {
      return readFileSync(path.resolve(process.cwd(), "src/server/public/site.css"), "utf8");
    } catch {
      return "body{font-family:sans-serif;background:#f8fafc;color:#0f172a;}";
    }
  }
}

function readSiteJs() {
  // The browser helper stays optional at runtime, but the server still serves a safe fallback script.
  try {
    return readFileSync(new URL("./public/site.js", import.meta.url), "utf8");
  } catch {
    try {
      return readFileSync(path.resolve(process.cwd(), "src/server/public/site.js"), "utf8");
    } catch {
      return "(() => {})();";
    }
  }
}

function mapPathToContentViewKey(pathname: string): ContentViewKey | null {
  // Content menu paths map to one canonical view key so ranking logic stays inside content modules.
  if (pathname === "/" || pathname === "/ai-new") {
    return "ai";
  }

  if (pathname === "/ai-hot") {
    return "hot";
  }

  return null;
}

async function readContentPageModelApiData(
  deps: ServerDeps,
  request: FastifyRequest,
  pageKey: ContentPageKey
): Promise<ContentPageModel> {
  if (deps.getContentPageModel) {
    const selectedSourceKinds = readSelectedSourceKindsHeader(request.headers["x-hot-now-source-filter"]);
    const sortMode = readContentSortModeHeader(request.headers["x-hot-now-content-sort"]);
    const searchKeyword = readContentSearchHeader(request.headers["x-hot-now-content-search"]);
    const page = readContentPageQueryPage(request);
    return deps.getContentPageModel(
      pageKey,
      selectedSourceKinds === undefined && sortMode === undefined && searchKeyword === undefined && page === 1
        ? undefined
        : {
            selectedSourceKinds,
            sortMode,
            page,
            searchKeyword
          }
    );
  }

  return buildContentPageModelFromDependencies(deps, request, pageKey);
}

async function buildContentPageModelFromDependencies(
  deps: ServerDeps,
  request: FastifyRequest,
  pageKey: ContentPageKey
): Promise<ContentPageModel> {
  const viewKey = pageKey === "ai-hot" ? "hot" : "ai";

  if (!deps.listContentView) {
    return {
      pageKey,
      featuredCard: null,
      cards: [],
      pagination: null,
      emptyState: {
        title: pageKey === "ai-hot" ? "暂无 AI 热点" : "暂无 AI 新讯",
        description: "可以稍后刷新，或先检查数据源采集状态。",
        tone: "default"
      }
    };
  }

  try {
    const sourceOptions = ((await deps.listContentSources?.()) ?? []).filter((source) => source.isEnabled);
    const selectedSourceKinds = readContentPageSelectedSourceKinds(request.headers["x-hot-now-source-filter"], sourceOptions);
    const effectiveSelectedSourceKinds = selectedSourceKinds ?? deriveDefaultSelectedSourceKinds(sourceOptions);
    const sortMode = readContentSortModeHeader(request.headers["x-hot-now-content-sort"]) ?? "published_at";
    const searchKeyword = readContentSearchHeader(request.headers["x-hot-now-content-search"]);
    const requestedPage = readContentPageQueryPage(request);
    const allCards = await deps.listContentView(viewKey, {
      selectedSourceKinds: effectiveSelectedSourceKinds,
      sortMode
    });
    const filteredCards = filterCardsByTitleKeyword(allCards, searchKeyword);
    const pagination = paginateContentCards(filteredCards, requestedPage);
    const currentPageVisibleCountsBySourceKind = countCurrentPageVisibleCardsBySourceKind(pagination.cards);

    return {
      pageKey,
      sourceFilter: sourceOptions.length > 0
        ? {
            options: sourceOptions.map((source) => ({
              kind: source.kind,
              name: source.name,
              showAllWhenSelected: source.showAllWhenSelected,
              currentPageVisibleCount: currentPageVisibleCountsBySourceKind[source.kind] ?? 0
            })),
            selectedSourceKinds: effectiveSelectedSourceKinds
          }
        : undefined,
      // AI 新讯和 AI 热点都统一成标准卡流，保留 featuredCard 仅作兼容空字段。
      featuredCard: null,
      cards: pagination.cards,
      pagination: pagination.meta,
      emptyState:
        effectiveSelectedSourceKinds.length === 0
          ? {
              title: "当前未选择任何数据源",
              description: "重新全选后即可恢复内容结果。",
              tone: "filtered"
            }
          : hasSearchKeyword(searchKeyword) && pagination.meta.totalResults === 0
            ? {
                title: "没有找到匹配的内容",
                description: "可以换个关键词，或清空搜索后查看全部结果。",
                tone: "filtered"
              }
          : pagination.meta.totalResults === 0
            ? {
                title: pageKey === "ai-new" ? "当前 24 小时内暂无 AI 新讯" : "暂无 AI 热点",
                description: pageKey === "ai-new"
                  ? "可以稍后刷新，或者检查最近 24 小时内是否有新的 AI 内容进入内容池。"
                  : "可以稍后刷新，或先检查数据源采集状态。",
                tone: "default"
              }
            : null
    };
  } catch (error) {
    if (!isMalformedContentStoreError(error)) {
      throw error;
    }

    return {
      pageKey,
      featuredCard: null,
      cards: [],
      pagination: null,
      emptyState: {
        title: "内容暂不可用",
        description: "检测到本地内容库读取失败，请修复或重建 data/hot-now.sqlite 后再刷新。",
        tone: "degraded"
      }
    };
  }
}

function countCurrentPageVisibleCardsBySourceKind(cards: ContentCardView[]) {
  // fallback 内容接口直接按当前请求已经返回的卡片分布计算来源数量，避免再跑一套独立稳定口径。
  const counts = new Map<string, number>();

  for (const card of cards) {
    if (!card.sourceKind) {
      continue;
    }

    counts.set(card.sourceKind, (counts.get(card.sourceKind) ?? 0) + 1);
  }

  return Object.fromEntries(counts.entries());
}

function readContentPageQueryPage(request: FastifyRequest) {
  const query = request.query as { page?: string | number | undefined };
  const parsed = Number(query.page);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  const normalized = Math.floor(parsed);
  return normalized >= 1 ? normalized : 1;
}

// fallback API 也要保持和核心模型一致：关键词只匹配标题，匹配前先做 trim + lowercase。
function filterCardsByTitleKeyword(cards: ContentCardView[], keyword: string | undefined) {
  const normalizedKeyword = normalizeSearchKeyword(keyword);

  if (!normalizedKeyword) {
    return cards;
  }

  return cards.filter((card) => card.title.toLowerCase().includes(normalizedKeyword));
}

function paginateContentCards(cards: ContentCardView[], requestedPage: number) {
  // 内容 API fallback 也要和核心模型保持一致，统一按 50 条分页并在越界时回退到最后一页。
  const pageSize = 50;
  const totalResults = cards.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    cards: cards.slice(startIndex, startIndex + pageSize),
    meta: {
      page,
      pageSize,
      totalResults,
      totalPages
    }
  };
}

async function renderContentForView(
  deps: ServerDeps,
  request: FastifyRequest,
  viewKey: ContentViewKey
): Promise<string | undefined> {
  // Task 1 only changes route semantics, so content pages keep the existing SSR body until the Vue modules land in Task 3.
  if (!deps.listContentView) {
    return undefined;
  }

  try {
    const sourceOptions = ((await deps.listContentSources?.()) ?? []).filter((source) => source.isEnabled);
    const selectedSourceKinds = readContentPageSelectedSourceKinds(request.headers["x-hot-now-source-filter"], sourceOptions);
    const effectiveSelectedSourceKinds = selectedSourceKinds ?? deriveDefaultSelectedSourceKinds(sourceOptions);
    const sortMode = readContentSortModeHeader(request.headers["x-hot-now-content-sort"]) ?? "published_at";
    const cards = await deps.listContentView(viewKey, {
      selectedSourceKinds: effectiveSelectedSourceKinds,
      sortMode
    });

    return renderContentPage({
      viewKey,
      cards,
      sourceFilter: sourceOptions.length > 0
        ? {
            options: sourceOptions.map((source) => ({
              kind: source.kind,
              name: source.name,
              showAllWhenSelected: source.showAllWhenSelected
            })),
            selectedSourceKinds: effectiveSelectedSourceKinds
          }
        : undefined,
      emptyState:
        effectiveSelectedSourceKinds.length === 0
          ? {
              title: "当前未选择任何数据源",
              description: "重新全选后即可恢复内容结果。",
              tone: "filtered"
            }
          : undefined
    });
  } catch (error) {
    if (!isMalformedContentStoreError(error)) {
      throw error;
    }

    return renderContentPage({
      viewKey,
      cards: [],
      emptyState: {
        title: "内容暂不可用",
        description: "检测到本地内容库读取失败，请修复或重建 data/hot-now.sqlite 后再刷新。",
        tone: "degraded"
      }
    });
  }
}

function readContentPageSelectedSourceKinds(
  headerValue: string | string[] | undefined,
  sourceOptions: ContentSourceOption[]
) {
  const selectedSourceKinds = readSelectedSourceKindsHeader(headerValue);

  if (selectedSourceKinds === undefined) {
    return undefined;
  }

  return normalizeSelectedSourceKindsForOptions(selectedSourceKinds, sourceOptions);
}

function readSelectedSourceKindsHeader(headerValue: string | string[] | undefined) {
  if (typeof headerValue === "undefined") {
    return undefined;
  }

  const rawValue = Array.isArray(headerValue) ? headerValue.join(",") : headerValue ?? "";

  if (rawValue === "") {
    return [];
  }

  return rawValue
    .split(",")
    .map((kind) => kind.trim())
    .filter(Boolean);
}

function normalizeSelectedSourceKindsForOptions(
  selectedSourceKinds: string[] | undefined,
  sourceOptions: ContentSourceOption[]
) {
  if (selectedSourceKinds === undefined) {
    return undefined;
  }

  const enabledSourceKinds = new Set(sourceOptions.map((source) => source.kind));

  return selectedSourceKinds.filter((kind, index, array) => {
    return enabledSourceKinds.has(kind) && array.indexOf(kind) === index;
  });
}

function deriveDefaultSelectedSourceKinds(sourceOptions: ContentSourceOption[]): string[] {
  // First-visit defaults intentionally leave full-display sources unchecked so users do not land on
  // an unexpectedly long feed before opting into that behavior.
  return sourceOptions.filter((source) => !source.showAllWhenSelected).map((source) => source.kind);
}

// 搜索 header 先按客户端编码规则解码，再统一规整空白；旧客户端发纯 ASCII 时也能保持兼容。
function readContentSearchHeader(headerValue: string | string[] | undefined) {
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const decodedValue = decodeContentSearchHeaderValue(rawValue);
  const normalizedKeyword = normalizeSearchKeyword(decodedValue);

  return normalizedKeyword === "" ? undefined : decodedValue?.trim();
}

function decodeContentSearchHeaderValue(headerValue: string | undefined) {
  if (typeof headerValue !== "string") {
    return undefined;
  }

  try {
    return decodeURIComponent(headerValue);
  } catch {
    return headerValue;
  }
}

// 这个判断用于空态分支，确保空白关键词不会误触发“搜索无结果”提示。
function hasSearchKeyword(keyword: string | undefined) {
  return normalizeSearchKeyword(keyword) !== "";
}

// 搜索关键词只做最小规范化：trim + lowercase，后续按标题 includes 匹配。
function normalizeSearchKeyword(keyword: string | undefined) {
  if (typeof keyword !== "string") {
    return "";
  }

  return keyword.trim().toLowerCase();
}

function readContentSortModeHeader(headerValue: string | string[] | undefined): ContentSortMode | undefined {
  const rawValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (rawValue === "published_at" || rawValue === "content_score") {
    return rawValue;
  }

  return undefined;
}

async function renderSystemPageForPath(deps: ServerDeps, pathname: string, loggedIn: boolean): Promise<string | undefined> {
  // System pages keep callback wiring in main; routes only decide which renderer to call for the current path.
  if (pathname === "/settings/view-rules") {
    if (!deps.getViewRulesWorkbenchData) {
      return undefined;
    }

    const workbench = await deps.getViewRulesWorkbenchData();
    return renderViewRulesPage(workbench);
  }

  if (pathname === "/settings/sources") {
    if (!deps.listSources) {
      return undefined;
    }

    const sources = await deps.listSources();
    const operationSummary = deps.getSourcesOperationSummary
      ? await deps.getSourcesOperationSummary()
      : { lastCollectionRunAt: null, lastSendLatestEmailAt: null };

    return renderSourcesPage(sources, {
      canTriggerManualCollect: typeof (deps.triggerManualCollect ?? deps.triggerManualRun) === "function",
      canTriggerManualSendLatestEmail: typeof deps.triggerManualSendLatestEmail === "function",
      isRunning: deps.isRunning?.() ?? false,
      lastCollectionRunAt: operationSummary.lastCollectionRunAt,
      lastSendLatestEmailAt: operationSummary.lastSendLatestEmailAt
    });
  }

  if (pathname === "/settings/profile") {
    if (!deps.getCurrentUserProfile) {
      return undefined;
    }

    const profile = await deps.getCurrentUserProfile();

    if (!profile) {
      return renderProfilePage(null);
    }

    return renderProfilePage({
      username: profile.username,
      displayName: profile.displayName,
      role: profile.role,
      email: profile.email,
      loggedIn
    });
  }

  return undefined;
}

function ensureStateActionAuthorized(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string
) {
  // State-changing routes return hard 401 in auth mode, which keeps API-style actions script-friendly.
  if (!authEnabled) {
    return true;
  }

  const session = readAuthenticatedSession(request.headers.cookie, sessionSecret);

  if (!session) {
    void reply.code(401).send({ ok: false, reason: "unauthorized" });
    return false;
  }

  return true;
}

function isMalformedContentStoreError(error: unknown): boolean {
  // Only known SQLite file-shape errors degrade to an empty state; other exceptions must still surface for debugging.
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorCode = "code" in error && typeof error.code === "string" ? error.code : "";
  const errorMessage = "message" in error && typeof error.message === "string" ? error.message : "";

  return (
    errorCode === "SQLITE_CORRUPT" ||
    errorCode === "SQLITE_NOTADB" ||
    /database disk image is malformed/i.test(errorMessage) ||
    /file is not a database/i.test(errorMessage)
  );
}

async function handleManualCollectAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualCollect: ServerDeps["triggerManualCollect"] | ServerDeps["triggerManualRun"]
) {
  // Manual collection endpoints share the same auth, lock, and disabled semantics so the legacy alias stays behaviorally identical.
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualCollect) {
    return reply.code(503).send({ accepted: false });
  }

  const result = await triggerManualCollect();
  return reply.code(202).send(result);
}

async function handleManualSendLatestEmailAction(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string,
  isRunning: boolean,
  triggerManualSendLatestEmail: ServerDeps["triggerManualSendLatestEmail"]
) {
  // Resend uses the same action gate as collection, but maps mail-specific pipeline errors to stable HTTP statuses.
  if (!ensureManualActionAuthorized(request, reply, authEnabled, sessionSecret)) {
    return;
  }

  if (isRunning) {
    return reply.code(409).send({ accepted: false, reason: "already-running" });
  }

  if (!triggerManualSendLatestEmail) {
    return reply.code(503).send({ accepted: false });
  }

  try {
    const result = await triggerManualSendLatestEmail();

    if (result.accepted) {
      return reply.code(202).send(result);
    }

    return reply.code(mapLatestEmailReasonToStatus(result.reason)).send(result);
  } catch (error) {
    if (!(error instanceof LatestReportEmailError)) {
      throw error;
    }

    return reply.code(mapLatestEmailReasonToStatus(error.reason)).send({
      accepted: false,
      reason: error.reason
    });
  }
}

function ensureManualActionAuthorized(
  request: FastifyRequest,
  reply: FastifyReply,
  authEnabled: boolean,
  sessionSecret: string
) {
  // Manual job actions return API-style unauthorized payloads instead of redirects so browser forms and scripts see the same contract.
  if (!authEnabled) {
    return true;
  }

  const session = readAuthenticatedSession(request.headers.cookie, sessionSecret);

  if (!session) {
    void reply.code(401).send({ accepted: false, reason: "unauthorized" });
    return false;
  }

  return true;
}

function mapLatestEmailReasonToStatus(reason: LatestReportEmailErrorReason) {
  // The resend endpoint exposes pipeline reason codes directly, so callers can distinguish missing reports from delivery failures.
  if (reason === "not-found") {
    return 404;
  }

  if (reason === "report-unavailable") {
    return 503;
  }

  return 502;
}

function parseContentItemId(params: unknown): number | null {
  // Action routes accept ids from path params only, so we enforce positive integer parsing here once.
  const idCandidate = (params as { id?: unknown } | undefined)?.id;
  const parsedId = Number(idCandidate);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return null;
  }

  return parsedId;
}

function parseNumericRouteId(params: unknown, key: string): number | null {
  const value = (params as Record<string, unknown> | undefined)?.[key];
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function isSuggestedEffect(value: unknown): value is NonNullable<SaveFeedbackPoolEntryInput["suggestedEffect"]> {
  return value === "boost" || value === "penalize" || value === "block" || value === "neutral";
}

function isStrengthLevel(value: unknown): value is NonNullable<SaveFeedbackPoolEntryInput["strengthLevel"]> {
  return value === "low" || value === "medium" || value === "high";
}

function isProviderKind(value: unknown): value is SaveProviderSettingsInput["providerKind"] {
  return value === "deepseek" || value === "minimax" || value === "kimi";
}

function isStrategyDraftScope(value: unknown): value is NonNullable<UpdateStrategyDraftInput["suggestedScope"]> {
  return value === "unspecified" || value === "base" || value === "ai_new" || value === "ai_hot";
}

function readNlGatePayload(value: unknown): { enabled: boolean; ruleText: string } {
  if (!isPlainObject(value)) {
    return { enabled: true, ruleText: "" };
  }

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    ruleText: typeof value.ruleText === "string" ? value.ruleText : ""
  };
}

function defaultNlRules(): ViewRulesWorkbenchView["nlRules"] {
  return [
    { scope: "base", enabled: true, ruleText: "", createdAt: "", updatedAt: "" },
    { scope: "ai_new", enabled: true, ruleText: "", createdAt: "", updatedAt: "" },
    { scope: "ai_hot", enabled: true, ruleText: "", createdAt: "", updatedAt: "" }
  ];
}

function parseRatingScores(value: unknown): ParseRatingScoresResult {
  // Ratings payload is strict: one invalid entry invalidates the full request, so partial writes never happen.
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "invalid-ratings-payload" };
  }

  const parsedScores: Record<string, number> = {};

  for (const [dimensionKey, rawScore] of Object.entries(value)) {
    if (typeof dimensionKey !== "string" || !dimensionKey.trim()) {
      return { ok: false, reason: "invalid-ratings-payload" };
    }

    const score = Number(rawScore);

    if (!Number.isFinite(score) || score < 1 || score > 5) {
      return { ok: false, reason: "invalid-ratings-payload" };
    }

    parsedScores[dimensionKey] = score;
  }

  if (Object.keys(parsedScores).length === 0) {
    return { ok: false, reason: "invalid-ratings-payload" };
  }

  return { ok: true, scores: parsedScores };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  // System action payloads currently rely on JSON object shapes and reject arrays/primitives.
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringArray(value: unknown): { ok: true; values: string[] } | { ok: false } {
  if (!Array.isArray(value)) {
    return { ok: false };
  }

  const values = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return values.length === value.length ? { ok: true, values } : { ok: false };
}

function renderLoginPage() {
  // Login remains a small self-contained page that posts JSON without adding extra Fastify plugins.
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>登录 | HotNow</title>
    <link rel="stylesheet" href="/assets/site.css" />
  </head>
  <body class="login-page">
    <main class="login-shell">
      <section class="login-card">
        <p class="login-kicker">HotNow Workspace</p>
        <h1>登录 HotNow</h1>
        <p class="login-subtitle">统一站点已启用账号校验，请使用管理员账号继续。</p>
        <form id="login-form">
          <label class="field-label" for="username">用户名</label>
          <input id="username" class="field-input" name="username" autocomplete="username" required />
          <label class="field-label" for="password">密码</label>
          <input
            id="password"
            class="field-input"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
          <button class="primary-button" type="submit">登录</button>
        </form>
        <p id="login-error" class="form-error"></p>
      </section>
    </main>
    <script>
      const form = document.getElementById("login-form");
      const errorNode = document.getElementById("login-error");

      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorNode.textContent = "";
        const username = (document.getElementById("username")?.value || "").trim();
        const password = document.getElementById("password")?.value || "";
        const response = await fetch("/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, password })
        });

        if (response.redirected) {
          location.href = response.url;
          return;
        }

        if (response.status === 200 || response.status === 204 || response.status === 302) {
          location.href = "/";
          return;
        }

        errorNode.textContent = "登录失败，请检查用户名和密码。";
      });
    </script>
  </body>
</html>`;
}
