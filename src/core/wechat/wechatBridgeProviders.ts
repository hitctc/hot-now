import type { WechatBridgeRuntimeConfig } from "./wechatBridgeTypes.js";

type BridgeFetch = typeof fetch;
type Wechat2rssListItem = {
  name?: unknown;
  link?: unknown;
};

// Wechat2RSS article registration is the only provider path in the first cut, so this helper
// keeps the API contract explicit and isolated from the source mutation repository.
export async function registerWechat2rssArticleUrl(
  articleUrl: string,
  runtime: WechatBridgeRuntimeConfig,
  fetchFn: BridgeFetch = fetch
): Promise<string> {
  const requestUrl = `${runtime.baseUrl.replace(/\/$/, "")}/addurl?url=${encodeURIComponent(articleUrl)}&k=${encodeURIComponent(runtime.token)}`;
  const response = await fetchFn(requestUrl);

  if (response.status !== 200) {
    throw new Error(`Wechat bridge addurl failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    err?: unknown;
    data?: unknown;
  };
  const reason = typeof payload.err === "string" ? payload.err.trim() : "";
  const feedUrl = typeof payload.data === "string" ? payload.data.trim() : "";

  if (reason) {
    throw new Error(reason);
  }

  if (!feedUrl) {
    throw new Error("Wechat bridge did not return a feed url");
  }

  return normalizeHttpUrl(feedUrl);
}

// Name lookup is only used when operators do not provide an article URL, so this helper stays
// intentionally conservative: prefer an exact name match and otherwise take the first valid feed.
export async function lookupWechat2rssFeedByName(
  wechatName: string,
  runtime: WechatBridgeRuntimeConfig,
  fetchFn: BridgeFetch = fetch
): Promise<string> {
  const requestUrl = `${runtime.baseUrl.replace(/\/$/, "")}/list?name=${encodeURIComponent(wechatName)}&k=${encodeURIComponent(runtime.token)}`;
  const response = await fetchFn(requestUrl);

  if (response.status !== 200) {
    throw new Error(`Wechat bridge list failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    err?: unknown;
    data?: unknown;
  };
  const reason = typeof payload.err === "string" ? payload.err.trim() : "";

  if (reason) {
    throw new Error(reason);
  }

  const candidates = Array.isArray(payload.data) ? payload.data : [];
  const exactMatch = candidates.find((item) => matchesWechatName(item, wechatName));
  const fallbackMatch = candidates.find(hasBridgeFeedLink);
  const selected = exactMatch ?? fallbackMatch;

  if (!selected || !hasBridgeFeedLink(selected)) {
    throw new Error("wechat-bridge-not-found");
  }

  return normalizeHttpUrl(selected.link.trim());
}

function normalizeHttpUrl(value: string): string {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Wechat bridge returned an unsupported feed url");
  }

  return url.toString();
}

function matchesWechatName(item: unknown, wechatName: string): item is Wechat2rssListItem {
  return (
    hasBridgeFeedLink(item) &&
    typeof item.name === "string" &&
    item.name.trim().toLowerCase() === wechatName.trim().toLowerCase()
  );
}

function hasBridgeFeedLink(item: unknown): item is Wechat2rssListItem & { link: string } {
  return Boolean(item && typeof item === "object" && typeof (item as Wechat2rssListItem).link === "string");
}
