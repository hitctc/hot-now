import { load } from "cheerio";
import type { ResolveWechatSourceInput, ResolveWechatSourceResult } from "../types.js";

type ProviderFetch = typeof fetch;

type CreateSogouArticleSearchProviderOptions = {
  resolverBaseUrl: string;
  fetch?: ProviderFetch;
  now?: () => number;
  queryCacheTtlMs?: number;
  articleCacheTtlMs?: number;
};

type CachedValue<T> = {
  expiresAt: number;
  value: T;
};

type ExtractedWechatArticleMetadata = {
  nickname: string;
  alias: string | null;
  userName: string | null;
  biz: string | null;
};

type SogouArticleResult = {
  title: string;
  summary: string;
  link: string;
  sourceName: string;
  publishedAt: string | null;
};

const defaultSiteUrl = "https://mp.weixin.qq.com/";
const articleFetchHeaders = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
};

// This provider uses a real article page to learn the account nickname/alias, then queries
// Sogou's public wechat article search and turns the matched account articles into a local feed.
export function createSogouArticleSearchProvider(options: CreateSogouArticleSearchProviderOptions) {
  const fetchFn = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const queryCacheTtlMs = options.queryCacheTtlMs ?? 5 * 60 * 1000;
  const articleCacheTtlMs = options.articleCacheTtlMs ?? 30 * 60 * 1000;
  const normalizedResolverBaseUrl = options.resolverBaseUrl.replace(/\/$/, "");
  const articleCache = new Map<string, CachedValue<ExtractedWechatArticleMetadata>>();
  const searchCache = new Map<string, CachedValue<SogouArticleResult[]>>();

  return {
    async resolveSource(input: ResolveWechatSourceInput): Promise<ResolveWechatSourceResult | null> {
      const articleMetadata = input.articleUrl ? await loadArticleMetadata(input.articleUrl) : null;
      const resolvedName = articleMetadata?.nickname || input.wechatName?.trim() || "";

      if (!resolvedName) {
        return null;
      }

      const query = articleMetadata?.alias || resolvedName;
      const articles = await loadMatchedArticles({
        query,
        expectedNames: buildExpectedNames(input.wechatName, articleMetadata),
        articleUrl: input.articleUrl
      });

      if (articles.length === 0) {
        return null;
      }

      const feedUrl = new URL(`${normalizedResolverBaseUrl}/wechat/feed/sogou-articles.xml`);
      feedUrl.searchParams.set("query", query);
      feedUrl.searchParams.set("sourceName", resolvedName);

      if (input.articleUrl) {
        feedUrl.searchParams.set("articleUrl", input.articleUrl);
      }

      return {
        rssUrl: feedUrl.toString(),
        resolvedName,
        siteUrl: defaultSiteUrl,
        resolverSummary: articleMetadata?.alias
          ? "local-sogou-article-search:article-alias"
          : "local-sogou-article-search:name-lookup"
      };
    },

    async renderFeed(input: ResolveWechatSourceInput): Promise<string | null> {
      const articleMetadata = input.articleUrl ? await loadArticleMetadata(input.articleUrl) : null;
      const resolvedName = articleMetadata?.nickname || input.wechatName?.trim() || "";

      if (!resolvedName) {
        return null;
      }

      const query = articleMetadata?.alias || resolvedName;
      const articles = await loadMatchedArticles({
        query,
        expectedNames: buildExpectedNames(input.wechatName, articleMetadata),
        articleUrl: input.articleUrl
      });

      if (articles.length === 0) {
        return null;
      }

      return buildRssFeed({
        title: `${resolvedName} 最近文章`,
        description: `通过搜狗文章检索聚合 ${resolvedName} 的最近公开文章。`,
        siteUrl: defaultSiteUrl,
        items: articles
      });
    }
  };

  async function loadArticleMetadata(articleUrl: string): Promise<ExtractedWechatArticleMetadata | null> {
    const normalizedArticleUrl = articleUrl.trim();
    const currentTime = now();
    const cached = articleCache.get(normalizedArticleUrl);

    if (cached && cached.expiresAt > currentTime) {
      return cached.value;
    }

    const response = await fetchFn(normalizedArticleUrl, {
      headers: articleFetchHeaders,
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      throw new Error("resolver-unavailable");
    }

    const html = await response.text();
    const metadata = extractWechatArticleMetadata(html);

    if (!metadata) {
      return null;
    }

    articleCache.set(normalizedArticleUrl, {
      value: metadata,
      expiresAt: currentTime + articleCacheTtlMs
    });

    return metadata;
  }

  async function loadMatchedArticles(options: {
    query: string;
    expectedNames: string[];
    articleUrl?: string;
  }): Promise<SogouArticleResult[]> {
    // 搜狗文章检索结果会混入相似公众号，这里把查询词和目标公众号名一起作为缓存键，
    // 避免短时间内重复打索引，也避免把别的公众号结果错复用过来。
    const cacheKey = JSON.stringify({
      query: options.query,
      expectedNames: options.expectedNames,
      articleUrl: options.articleUrl ?? null
    });
    const currentTime = now();
    const cached = searchCache.get(cacheKey);

    if (cached && cached.expiresAt > currentTime) {
      return cached.value;
    }

    const searchUrl = new URL("https://weixin.sogou.com/weixin");
    searchUrl.searchParams.set("type", "2");
    searchUrl.searchParams.set("query", options.query);
    searchUrl.searchParams.set("ie", "utf8");

    const response = await fetchFn(searchUrl.toString(), {
      headers: articleFetchHeaders,
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      throw new Error("resolver-unavailable");
    }

    const html = await response.text();
    const results = parseSogouArticleSearchResults(html, options.expectedNames);

    searchCache.set(cacheKey, {
      value: results,
      expiresAt: currentTime + queryCacheTtlMs
    });

    return results;
  }
}

// 公众号文章页里能比较稳定地拿到 nickname / alias / user_name，这些字段足够给索引检索兜底。
export function extractWechatArticleMetadata(html: string): ExtractedWechatArticleMetadata | null {
  const nickname =
    matchQuotedValue(html, /var nickname = htmlDecode\("([^"]+)"\);/) ??
    matchQuotedValue(html, /<meta name="author" content="([^"]+)"/);

  if (!nickname) {
    return null;
  }

  const alias = matchQuotedValue(html, /window\.alias = "([^"]*)" \|\| "";/);
  const userName = matchQuotedValue(html, /var user_name = "([^"]+)";/);
  const biz = matchQuotedValue(html, /biz: '([^']+)'/);

  return {
    nickname,
    alias: alias || null,
    userName: userName || null,
    biz: biz || null
  };
}

// 搜狗文章搜索经常带出同名或相似公众号，这里只保留和目标公众号名完全归一匹配的结果，
// 否则新增来源时容易把错误公众号接进系统。
export function parseSogouArticleSearchResults(html: string, expectedNames: string[]): SogouArticleResult[] {
  const document = load(html);
  const normalizedExpectedNames = expectedNames.map(normalizeWechatName).filter(Boolean);
  const results: SogouArticleResult[] = [];

  document("a[id^='sogou_vr_11002601_title_']").each((_, element) => {
    const anchor = document(element);
    const id = anchor.attr("id") ?? "";
    const index = id.split("_").at(-1);

    if (!index) {
      return;
    }

    const title = anchor.text().trim();
    const href = anchor.attr("href");
    const container = anchor.closest(".txt-box");
    const summary = document(`#sogou_vr_11002601_summary_${index}`).text().trim();
    const sourceName = container.find(".all-time-y2").first().text().trim();
    const timestampMatch = container.html()?.match(/timeConvert\('(\d+)'\)/);
    const publishedAt = timestampMatch ? new Date(Number(timestampMatch[1]) * 1000).toUTCString() : null;

    if (!title || !href || !sourceName) {
      return;
    }

    const normalizedSourceName = normalizeWechatName(sourceName);

    if (!normalizedExpectedNames.includes(normalizedSourceName)) {
      return;
    }

    results.push({
      title,
      summary,
      link: new URL(href, "https://weixin.sogou.com").toString(),
      sourceName,
      publishedAt
    });
  });

  return dedupeByLink(results).slice(0, 20);
}

function buildExpectedNames(
  inputName: string | undefined,
  articleMetadata: ExtractedWechatArticleMetadata | null
): string[] {
  return [inputName ?? "", articleMetadata?.nickname ?? ""]
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeWechatName(value: string): string {
  return value
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function matchQuotedValue(html: string, pattern: RegExp): string | null {
  const matched = html.match(pattern)?.[1]?.trim();
  return matched ? decodeHtmlEntities(matched) : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function dedupeByLink(results: SogouArticleResult[]) {
  const deduped = new Map<string, SogouArticleResult>();

  for (const result of results) {
    if (!deduped.has(result.link)) {
      deduped.set(result.link, result);
    }
  }

  return [...deduped.values()];
}

function buildRssFeed(input: {
  title: string;
  description: string;
  siteUrl: string;
  items: SogouArticleResult[];
}) {
  const itemsXml = input.items
    .map(
      (item) => `
        <item>
          <title>${escapeXml(item.title)}</title>
          <link>${escapeXml(item.link)}</link>
          <guid isPermaLink="true">${escapeXml(item.link)}</guid>
          <description>${escapeXml(item.summary || item.title)}</description>
          ${item.publishedAt ? `<pubDate>${escapeXml(item.publishedAt)}</pubDate>` : ""}
        </item>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(input.title)}</title>
    <link>${escapeXml(input.siteUrl)}</link>
    <description>${escapeXml(input.description)}</description>
    ${itemsXml}
  </channel>
</rss>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
