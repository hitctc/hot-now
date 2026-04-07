import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildContentPageModel } from "../../src/core/content/buildContentPageModel.js";
import { createTestDatabase } from "../helpers/testDatabase.js";

describe("buildContentPageModel", () => {
  const handles: Array<Awaited<ReturnType<typeof createTestDatabase>>> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T04:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();

    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("slices ai-new cards into 50-item pages and falls back overflow pages to the last page", async () => {
    const handle = await createTestDatabase("hot-now-content-page-model-");
    handles.push(handle);

    for (let index = 0; index < 120; index += 1) {
      const minuteOffset = index % 60;
      const hourOffset = Math.floor(index / 60);
      const publishedAt = new Date(Date.UTC(2026, 2, 31, 3 - hourOffset, 59 - minuteOffset, 0)).toISOString();
      const fetchedAt = new Date(Date.UTC(2026, 2, 31, 3 - hourOffset, 59 - minuteOffset, 5)).toISOString();

      insertPagedAiNewItem(handle.db, index + 1, publishedAt, fetchedAt);
    }

    const pageTwo = buildContentPageModel(handle.db, "ai-new", { page: 2 });
    const overflowPage = buildContentPageModel(handle.db, "ai-new", { page: 9 });

    expect(pageTwo.pagination).toEqual({
      page: 2,
      pageSize: 50,
      totalResults: 120,
      totalPages: 3
    });
    expect(pageTwo.cards).toHaveLength(50);
    expect(pageTwo.cards[0]?.title).toBe("Paged 51");
    expect(overflowPage.pagination).toEqual({
      page: 3,
      pageSize: 50,
      totalResults: 120,
      totalPages: 3
    });
    expect(overflowPage.cards).toHaveLength(20);
    expect(overflowPage.cards[0]?.title).toBe("Paged 101");
  });

  it("uses the 24-hour ai-new window before pagination and keeps hot pages unbounded by that window", async () => {
    const handle = await createTestDatabase("hot-now-content-page-window-");
    handles.push(handle);

    insertPagedAiNewItem(handle.db, 1, "2026-03-31T03:00:00.000Z", "2026-03-31T03:00:05.000Z");
    insertPagedAiNewItem(handle.db, 2, "2026-03-29T00:00:00.000Z", "2026-03-29T00:00:05.000Z");

    const aiNewPage = buildContentPageModel(handle.db, "ai-new", { page: 1 });
    const aiHotPage = buildContentPageModel(handle.db, "ai-hot", { page: 1 });

    expect(aiNewPage.pagination?.totalResults).toBe(1);
    expect(aiNewPage.cards.map((card) => card.title)).toEqual(["Paged 1"]);
    expect(aiHotPage.cards.map((card) => card.title)).toContain("Paged 2");
  });
});

function insertPagedAiNewItem(
  db: Awaited<ReturnType<typeof createTestDatabase>>["db"],
  index: number,
  publishedAt: string,
  fetchedAt: string
) {
  db.prepare(
    `
      INSERT INTO content_items (
        source_id,
        title,
        canonical_url,
        summary,
        body_markdown,
        published_at,
        fetched_at
      )
      SELECT
        id,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      FROM content_sources
      WHERE kind = 'openai'
    `
  ).run(
    `Paged ${index}`,
    `https://example.com/paged-${index}`,
    `Summary ${index}`,
    `Body ${index}`,
    publishedAt,
    fetchedAt
  );
}
