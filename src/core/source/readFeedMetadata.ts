import Parser from "rss-parser";

const parser = new Parser();

type FeedFetch = typeof fetch;

export type FeedMetadata = {
  title: string;
  siteUrl: string;
};

// RSS source creation only needs a readable title and homepage, so this helper keeps the
// metadata lookup tiny and fails fast when the URL is not a valid feed.
export async function readFeedMetadata(feedUrl: string, fetchFn: FeedFetch = fetch): Promise<FeedMetadata> {
  const normalizedFeedUrl = normalizeHttpUrl(feedUrl);
  const response = await fetchFn(normalizedFeedUrl);

  if (response.status !== 200) {
    throw new Error("invalid-rss-feed");
  }

  const feedXml = await response.text();

  try {
    const feed = await parser.parseString(feedXml);
    const title = feed.title?.trim() || deriveTitleFromUrl(normalizedFeedUrl);

    if (!title) {
      throw new Error("invalid-rss-feed");
    }

    return {
      title,
      siteUrl: normalizeSiteUrl(feed.link?.trim(), normalizedFeedUrl)
    };
  } catch {
    throw new Error("invalid-rss-feed");
  }
}

function normalizeHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("invalid-rss-feed");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("invalid-rss-feed");
  }

  return url.toString();
}

function normalizeSiteUrl(siteUrl: string | undefined, feedUrl: string): string {
  if (siteUrl) {
    return normalizeHttpUrl(siteUrl);
  }

  const fallback = new URL(feedUrl);
  return `${fallback.origin}/`;
}

function deriveTitleFromUrl(feedUrl: string): string {
  const url = new URL(feedUrl);
  const hostLabel = url.hostname.replace(/^www\./, "").split(".")[0] ?? "";

  return hostLabel
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
}
