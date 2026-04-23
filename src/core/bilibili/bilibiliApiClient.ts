export type BilibiliFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type BilibiliVideoHit = {
  bvid: string;
  title: string;
  url: string;
  author: string | null;
  mid: string | null;
  publishedAt: string | null;
  description: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  danmakuCount: number | null;
  favoriteCount: number | null;
};

export type SearchBilibiliVideosInput = {
  query: string;
  fetch?: BilibiliFetch;
  pageSize?: number;
};

export type BilibiliSearchResult = { ok: true; hits: BilibiliVideoHit[] } | { ok: false; reason: string };

export const bilibiliSearchEndpoint = "https://api.bilibili.com/x/web-interface/search/type";
export const defaultBilibiliHitsPerPage = 10;

// B 站 API client 只负责把公开视频搜索接口规整成稳定结构，不让 collector 理解原始字段细节。
export async function searchBilibiliVideos(input: SearchBilibiliVideosInput): Promise<BilibiliSearchResult> {
  const query = input.query.trim();

  if (!query) {
    return { ok: false, reason: "query is required" };
  }

  const pageSize = normalizePositiveInteger(input.pageSize, defaultBilibiliHitsPerPage);
  const requestUrl = new URL(bilibiliSearchEndpoint);
  requestUrl.searchParams.set("keyword", query);
  requestUrl.searchParams.set("search_type", "video");
  requestUrl.searchParams.set("order", "pubdate");
  requestUrl.searchParams.set("page", "1");
  requestUrl.searchParams.set("page_size", String(pageSize));

  const fetcher = input.fetch ?? fetch;

  try {
    const response = await fetcher(requestUrl, {
      headers: {
        accept: "application/json",
        referer: "https://search.bilibili.com/"
      }
    });

    if (!response.ok) {
      return { ok: false, reason: `Bilibili search failed with ${response.status}` };
    }

    const payload = (await response.json()) as Record<string, unknown>;

    if (typeof payload.code !== "number" || payload.code !== 0) {
      return { ok: false, reason: readBilibiliErrorMessage(payload) };
    }

    const data = payload.data;

    if (!data || typeof data !== "object") {
      return { ok: false, reason: "Bilibili search returned invalid payload" };
    }

    const result = (data as Record<string, unknown>).result;

    if (!Array.isArray(result)) {
      return { ok: false, reason: "Bilibili search returned invalid payload" };
    }

    return {
      ok: true,
      hits: result.flatMap((item) => normalizeBilibiliVideoHit(item))
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Bilibili search failed"
    };
  }
}

function normalizeBilibiliVideoHit(value: unknown): BilibiliVideoHit[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const hit = value as Record<string, unknown>;
  const bvid = readString(hit.bvid);
  const title = normalizeText(readString(hit.title));

  if (!bvid || !title) {
    return [];
  }

  return [
    {
      bvid,
      title,
      url: `https://www.bilibili.com/video/${bvid}`,
      author: normalizeText(readString(hit.author)),
      mid: readLooseString(hit.mid),
      publishedAt: normalizePublishedAt(hit.pubdate),
      description: normalizeText(readString(hit.description)) ?? title,
      viewCount: readLooseNumber(hit.play),
      likeCount: readLooseNumber(hit.like),
      commentCount: readLooseNumber(hit.review),
      danmakuCount: readLooseNumber(hit.danmaku ?? hit.video_review),
      favoriteCount: readLooseNumber(hit.favorite ?? hit.favorites)
    }
  ];
}

function readBilibiliErrorMessage(payload: Record<string, unknown>): string {
  const message = readString(payload.message) ?? readString(payload.msg);
  return message ? `Bilibili search failed: ${message}` : "Bilibili search returned invalid payload";
}

function normalizePublishedAt(value: unknown): string | null {
  const timestamp = typeof value === "number" && Number.isFinite(value) ? value : null;

  if (timestamp === null || timestamp <= 0) {
    return null;
  }

  return new Date(timestamp * 1000).toISOString();
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : fallback;
}

function normalizeText(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const withoutTags = value.replace(/<[^>]*>/g, " ");
  const decoded = withoutTags
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  const normalized = decoded.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readLooseString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readLooseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const normalized = value.replace(/,/g, "").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
