import { load } from "cheerio";
import type { ResolveWechatSourceInput, ResolveWechatSourceResult } from "../types.js";

type ProviderFetch = typeof fetch;

type Wechat2RssPublicIndexProviderOptions = {
  listUrl?: string;
  cacheTtlMs?: number;
  fetch?: ProviderFetch;
  now?: () => number;
};

type IndexedWechatFeed = {
  name: string;
  normalizedName: string;
  rssUrl: string;
};

type CachedIndex = {
  expiresAt: number;
  entries: IndexedWechatFeed[];
};

const defaultListUrl = "https://wechat2rss.xlab.app/list/list";
const defaultCacheTtlMs = 5 * 60 * 1000;
const defaultSiteUrl = "https://mp.weixin.qq.com/";
const browserLikeHeaders = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
};

// Public-index resolution is the smallest local sidecar strategy: fetch one curated page,
// cache it briefly, and turn the public feed anchors into normalized source matches.
export function createWechat2RssPublicIndexProvider(options: Wechat2RssPublicIndexProviderOptions = {}) {
  const listUrl = options.listUrl ?? defaultListUrl;
  const cacheTtlMs = options.cacheTtlMs ?? defaultCacheTtlMs;
  const fetchFn = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let cachedIndex: CachedIndex | null = null;

  return {
    async resolveSource(input: ResolveWechatSourceInput): Promise<ResolveWechatSourceResult | null> {
      const normalizedName = normalizeWechatName(input.wechatName);

      if (!normalizedName) {
        return null;
      }

      const entries = await loadIndexedFeeds();
      const matchedEntry = matchIndexedFeed(entries, normalizedName);

      if (!matchedEntry) {
        return null;
      }

      return {
        rssUrl: matchedEntry.rssUrl,
        resolvedName: matchedEntry.name,
        siteUrl: defaultSiteUrl,
        resolverSummary: input.articleUrl
          ? "local-wechat2rss-public-index:article-url-hint"
          : "local-wechat2rss-public-index:name-lookup"
      };
    }
  };

  async function loadIndexedFeeds(): Promise<IndexedWechatFeed[]> {
    const currentTime = now();

    if (cachedIndex && cachedIndex.expiresAt > currentTime) {
      return cachedIndex.entries;
    }

    const response = await fetchFn(listUrl, {
      headers: browserLikeHeaders,
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      throw new Error("resolver-unavailable");
    }

    const html = await response.text();
    const entries = parseWechat2RssPublicIndex(html);
    cachedIndex = {
      entries,
      expiresAt: currentTime + cacheTtlMs
    };

    return entries;
  }
}

// Parsing stays small on purpose: the public index only needs the anchor text and feed URL.
export function parseWechat2RssPublicIndex(html: string): IndexedWechatFeed[] {
  const document = load(html);
  const dedupedEntries = new Map<string, IndexedWechatFeed>();

  document("a[href*='wechat2rss.xlab.app/feed/']").each((_, element) => {
    const href = document(element).attr("href");
    const name = document(element).text().trim();

    if (!href || !name) {
      return;
    }

    let rssUrl: string;
    try {
      rssUrl = new URL(href, defaultListUrl).toString();
    } catch {
      return;
    }

    const normalizedName = normalizeWechatName(name);

    if (!normalizedName) {
      return;
    }

    if (!dedupedEntries.has(normalizedName)) {
      dedupedEntries.set(normalizedName, {
        name,
        normalizedName,
        rssUrl
      });
    }
  });

  return [...dedupedEntries.values()];
}

function matchIndexedFeed(entries: IndexedWechatFeed[], normalizedName: string): IndexedWechatFeed | null {
  const exactMatch = entries.find((entry) => entry.normalizedName === normalizedName);

  if (exactMatch) {
    return exactMatch;
  }

  const partialMatch = entries.find(
    (entry) => entry.normalizedName.includes(normalizedName) || normalizedName.includes(entry.normalizedName)
  );

  return partialMatch ?? null;
}

function normalizeWechatName(value: string | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
}
