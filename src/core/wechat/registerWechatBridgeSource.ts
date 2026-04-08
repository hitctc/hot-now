import { lookupWechat2rssFeedByName, registerWechat2rssArticleUrl } from "./wechatBridgeProviders.js";
import type { WechatBridgeInput, WechatBridgeRuntimeConfig } from "./wechatBridgeTypes.js";

type BridgeFetch = typeof fetch;

// Source saves call this helper once so every persisted wechat_bridge row ends up with a final
// rss_url and a small audit trail of the original bridge input.
export async function registerWechatBridgeSource(
  input: WechatBridgeInput,
  deps: {
    wechatBridge: WechatBridgeRuntimeConfig | null;
    fetch?: BridgeFetch;
  }
): Promise<{ rssUrl: string; bridgeConfigJson: string }> {
  if (input.inputMode === "feed_url") {
    const feedUrl = normalizeHttpUrl(input.feedUrl);

    return {
      rssUrl: feedUrl,
      bridgeConfigJson: JSON.stringify({
        inputMode: "feed_url",
        feedUrl
      })
    };
  }

  if (!deps.wechatBridge) {
    throw new Error("wechat-bridge-disabled");
  }

  if (input.inputMode === "article_url") {
    const articleUrl = normalizeHttpUrl(input.articleUrl);
    const rssUrl = await registerWechat2rssArticleUrl(articleUrl, deps.wechatBridge, deps.fetch);

    return {
      rssUrl,
      bridgeConfigJson: JSON.stringify({
        inputMode: "article_url",
        articleUrl,
        resolvedFrom: "wechat2rss"
      })
    };
  }

  const wechatName = normalizeRequiredText(input.wechatName);
  const rssUrl = await lookupWechat2rssFeedByName(wechatName, deps.wechatBridge, deps.fetch);

  return {
    rssUrl,
    bridgeConfigJson: JSON.stringify({
      inputMode: "name_lookup",
      wechatName,
      resolvedFrom: "wechat2rss"
    })
  };
}

function normalizeHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid-input");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("invalid-input");
  }

  return url.toString();
}

function normalizeRequiredText(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("invalid-input");
  }

  return normalized;
}
