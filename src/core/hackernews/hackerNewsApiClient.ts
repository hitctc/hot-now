export type HackerNewsFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type HackerNewsHit = {
  objectId: string;
  title: string;
  url: string | null;
  author: string | null;
  points: number | null;
  numComments: number | null;
  createdAt: string | null;
  storyText: string | null;
};

export type SearchHackerNewsStoriesInput = {
  query: string;
  now?: Date;
  fetch?: HackerNewsFetch;
  timeWindowDays?: number;
  hitsPerPage?: number;
};

export type HackerNewsSearchResult = { ok: true; hits: HackerNewsHit[] } | { ok: false; reason: string };

export const hackerNewsSearchEndpoint = "https://hn.algolia.com/api/v1/search";
export const defaultHackerNewsTimeWindowDays = 7;
export const defaultHackerNewsHitsPerPage = 10;

// The Algolia client keeps response quirks out of the collector so tests can pin one normalized shape.
export async function searchHackerNewsStories(input: SearchHackerNewsStoriesInput): Promise<HackerNewsSearchResult> {
  const query = input.query.trim();

  if (!query) {
    return { ok: false, reason: "query is required" };
  }

  const now = input.now ?? new Date();
  const sinceTimestamp = Math.floor(now.getTime() / 1000) - normalizePositiveInteger(input.timeWindowDays, defaultHackerNewsTimeWindowDays) * 24 * 60 * 60;
  const hitsPerPage = normalizePositiveInteger(input.hitsPerPage, defaultHackerNewsHitsPerPage);
  const requestUrl = new URL(hackerNewsSearchEndpoint);
  requestUrl.searchParams.set("query", query);
  requestUrl.searchParams.set("tags", "story");
  requestUrl.searchParams.set("hitsPerPage", String(hitsPerPage));
  requestUrl.searchParams.set("numericFilters", `created_at_i>=${sinceTimestamp}`);

  const fetcher = input.fetch ?? fetch;

  try {
    const response = await fetcher(requestUrl);

    if (!response.ok) {
      return { ok: false, reason: `Hacker News search failed with ${response.status}` };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const rawHits = payload.hits;

    if (!Array.isArray(rawHits)) {
      return { ok: false, reason: "Hacker News search returned invalid payload" };
    }

    return {
      ok: true,
      hits: rawHits.flatMap((item) => normalizeHackerNewsHit(item))
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Hacker News search failed"
    };
  }
}

function normalizeHackerNewsHit(value: unknown): HackerNewsHit[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const hit = value as Record<string, unknown>;
  const objectId = readString(hit.objectID);
  const title = readString(hit.title) ?? readString(hit.story_title);

  if (!objectId || !title) {
    return [];
  }

  return [
    {
      objectId,
      title,
      url: readString(hit.url),
      author: readString(hit.author),
      points: readNumber(hit.points),
      numComments: readNumber(hit.num_comments),
      createdAt: normalizeCreatedAt(hit),
      storyText: readString(hit.story_text)
    }
  ];
}

function normalizeCreatedAt(hit: Record<string, unknown>): string | null {
  const createdAt = readString(hit.created_at);

  if (createdAt) {
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const createdAtUnix = readNumber(hit.created_at_i);

  if (createdAtUnix === null) {
    return null;
  }

  return new Date(createdAtUnix * 1000).toISOString();
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : fallback;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
