import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SaveFeedbackPoolEntryInput, SaveFeedbackPoolEntryResult } from "../../core/feedback/feedbackPoolRepository.js";
import type { SaveRatingsResult } from "../../core/ratings/ratingRepository.js";
type ParseRatingScoresResult = { ok: true; scores: Record<string, number> } | { ok: false; reason: "invalid-ratings-payload" };
export type ContentFeedbackRouteOptions = { authorizeStateAction: (request: FastifyRequest, reply: FastifyReply) => boolean; saveContentFeedback?: (id: number, input: Omit<SaveFeedbackPoolEntryInput, "contentItemId">) => Promise<SaveFeedbackPoolEntryResult> | SaveFeedbackPoolEntryResult; saveRatings?: (id: number, scores: Record<string, number>) => Promise<SaveRatingsResult> | SaveRatingsResult; deleteFeedbackEntry?: (id: number) => Promise<boolean> | boolean; clearAllFeedback?: () => Promise<number> | number; };
/** 注册内容反馈、人工评分和反馈池维护接口。 */
export function registerContentFeedbackRoutes(app: FastifyInstance, options: ContentFeedbackRouteOptions): void {
    app.post("/actions/content/:id/feedback-pool", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.saveContentFeedback) {
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

      const result = await options.saveContentFeedback(contentItemId, input);

      if (!result.ok) {
        return reply.code(404).send({ ok: false, reason: "not-found" });
      }

      return reply.send({ ok: true, contentItemId, entryId: result.entryId });
    });

    app.post("/actions/content/:id/ratings", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.saveRatings) {
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

      const result = await options.saveRatings(contentItemId, parsedScores.scores);

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

    app.post("/actions/feedback-pool/:id/delete", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.deleteFeedbackEntry) {
        return reply.code(503).send({ ok: false, reason: "feedback-pool-disabled" });
      }

      const feedbackId = parseNumericRouteId(request.params, "id");

      if (!feedbackId) {
        return reply.code(400).send({ ok: false, reason: "invalid-feedback-id" });
      }

      const deleted = await options.deleteFeedbackEntry(feedbackId);

      if (!deleted) {
        return reply.code(404).send({ ok: false, reason: "not-found" });
      }

      return reply.send({ ok: true, feedbackId });
    });

    app.post("/actions/feedback-pool/clear", async (request, reply) => {
      if (!options.authorizeStateAction(request, reply)) {
        return;
      }

      if (!options.clearAllFeedback) {
        return reply.code(503).send({ ok: false, reason: "feedback-pool-disabled" });
      }

      const cleared = await options.clearAllFeedback();
      return reply.send({ ok: true, cleared });
    });

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

function parseStringArray(value: unknown): { ok: true; values: string[] } | { ok: false } {
  if (!Array.isArray(value)) {
    return { ok: false };
  }

  const values = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return values.length === value.length ? { ok: true, values } : { ok: false };
}

