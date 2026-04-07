import type { WechatBridgeRuntimeConfig } from "./wechatBridgeTypes.js";

type BridgeFetch = typeof fetch;

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

function normalizeHttpUrl(value: string): string {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Wechat bridge returned an unsupported feed url");
  }

  return url.toString();
}
