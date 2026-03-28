import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveSourceByKind, upsertContentItems } from "../../src/core/content/contentRepository.js";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { listRatingDimensions, saveRatings } from "../../src/core/ratings/ratingRepository.js";

describe("ratingRepository", () => {
  const databasesToClose: ReturnType<typeof openDatabase>[] = [];

  afterEach(() => {
    while (databasesToClose.length > 0) {
      databasesToClose.pop()?.close();
    }
  });

  it("does not overwrite existing custom dimension fields while ensuring defaults", async () => {
    const db = await createTestDatabase();

    db.prepare(
      `
        INSERT INTO rating_dimensions (key, name, description, weight)
        VALUES ('value', '自定义价值', 'custom-desc', 2.5)
      `
    ).run();

    const dimensions = listRatingDimensions(db);
    const valueDimension = dimensions.find((dimension) => dimension.key === "value");
    const credibilityDimension = dimensions.find((dimension) => dimension.key === "credibility");

    expect(valueDimension).toEqual({
      id: expect.any(Number),
      key: "value",
      name: "自定义价值",
      description: "custom-desc",
      weight: 2.5
    });
    expect(credibilityDimension).toBeDefined();
  });

  it("returns unknown-dimensions when scores contain unsupported keys", async () => {
    const db = await createTestDatabase();
    const contentId = createContentItem(db, "https://example.com/unsupported");

    const result = saveRatings(db, contentId, { value: 4, custom_x: 5 });

    expect(result).toEqual({
      ok: false,
      reason: "unknown-dimensions",
      unknownKeys: ["custom_x"]
    });

    const countRow = db.prepare("SELECT COUNT(*) AS count FROM content_ratings WHERE content_item_id = ?").get(contentId) as {
      count: number;
    };
    expect(countRow.count).toBe(0);
  });

  it("returns average rating after successful save and returns not-found for missing content", async () => {
    const db = await createTestDatabase();
    const contentId = createContentItem(db, "https://example.com/known");

    const successResult = saveRatings(db, contentId, { value: 4, credibility: 2 });
    const notFoundResult = saveRatings(db, 999_999, { value: 3 });

    expect(successResult).toEqual({
      ok: true,
      saved: 2,
      averageRating: 3
    });
    expect(notFoundResult).toEqual({
      ok: false,
      reason: "not-found"
    });
  });

  async function createTestDatabase() {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "hot-now-rating-repo-"));
    const db = openDatabase(path.join(tempDir, "hot-now.sqlite"));
    databasesToClose.push(db);
    runMigrations(db);
    seedInitialData(db, { username: "admin", password: "bootstrap-password" });
    return db;
  }
});

function createContentItem(db: ReturnType<typeof openDatabase>, canonicalUrl: string): number {
  const source = resolveSourceByKind(db, "juya");

  if (!source) {
    throw new Error("juya source not found");
  }

  upsertContentItems(db, {
    sourceId: source.id,
    items: [
      {
        title: "A test article",
        canonicalUrl,
        summary: "short summary",
        bodyMarkdown: "body",
        publishedAt: "2026-03-28T08:00:00.000Z",
        fetchedAt: "2026-03-28T08:01:00.000Z"
      }
    ]
  });

  const row = db.prepare("SELECT id FROM content_items WHERE canonical_url = ? LIMIT 1").get(canonicalUrl) as
    | { id: number }
    | undefined;

  if (!row) {
    throw new Error("content item insert failed");
  }

  return row.id;
}
