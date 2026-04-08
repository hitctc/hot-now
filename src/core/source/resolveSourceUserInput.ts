import { createHash } from "node:crypto";
import { readFeedMetadata } from "./readFeedMetadata.js";
import { registerWechatBridgeSource } from "../wechat/registerWechatBridgeSource.js";
import type { WechatBridgeRuntimeConfig } from "../wechat/wechatBridgeTypes.js";

type InputFetch = typeof fetch;

export type SourceUserInput =
  | {
      mode: "create";
      sourceType: "rss";
      rssUrl: string;
      isEnabled?: boolean;
      showAllWhenSelected?: boolean;
    }
  | {
      mode: "update";
      sourceType: "rss";
      kind: string;
      rssUrl: string;
      isEnabled?: boolean;
      showAllWhenSelected?: boolean;
    }
  | {
      mode: "create";
      sourceType: "wechat_bridge";
      wechatName: string;
      articleUrl?: string;
      isEnabled?: boolean;
      showAllWhenSelected?: boolean;
    }
  | {
      mode: "update";
      sourceType: "wechat_bridge";
      kind: string;
      wechatName: string;
      articleUrl?: string;
      isEnabled?: boolean;
      showAllWhenSelected?: boolean;
    };

export type ResolvedSourceUserInput = {
  mode: "create" | "update";
  sourceType: "rss" | "wechat_bridge";
  kind: string;
  name: string;
  siteUrl: string;
  rssUrl: string;
  bridgeKind: "wechat2rss" | null;
  bridgeConfigJson: string | null;
  isEnabled?: boolean;
  showAllWhenSelected?: boolean;
};

// The settings page only asks for user-facing fields, so this resolver turns those small inputs
// into the fully-populated source record shape the persistence layer already understands.
export async function resolveSourceUserInput(
  input: SourceUserInput,
  deps: {
    wechatBridge: WechatBridgeRuntimeConfig | null;
    fetch?: InputFetch;
  }
): Promise<ResolvedSourceUserInput> {
  if (input.sourceType === "rss") {
    return resolveRssInput(input, deps.fetch);
  }

  return resolveWechatInput(input, deps);
}

async function resolveRssInput(
  input: Extract<SourceUserInput, { sourceType: "rss" }>,
  fetchFn: InputFetch = fetch
): Promise<ResolvedSourceUserInput> {
  const rssUrl = normalizeHttpUrl(input.rssUrl);
  const metadata = await readFeedMetadata(rssUrl, fetchFn);
  const kind = input.mode === "update" ? normalizeKind(input.kind) : buildRssKind(metadata.title, rssUrl);

  return {
    mode: input.mode,
    sourceType: "rss",
    kind,
    name: metadata.title,
    siteUrl: metadata.siteUrl,
    rssUrl,
    bridgeKind: null,
    bridgeConfigJson: null,
    isEnabled: input.isEnabled,
    showAllWhenSelected: input.showAllWhenSelected
  };
}

async function resolveWechatInput(
  input: Extract<SourceUserInput, { sourceType: "wechat_bridge" }>,
  deps: {
    wechatBridge: WechatBridgeRuntimeConfig | null;
    fetch?: InputFetch;
  }
): Promise<ResolvedSourceUserInput> {
  const name = normalizeDisplayName(input.wechatName);
  const registered = await registerWechatBridgeSource(
    input.articleUrl
      ? {
          bridgeKind: "wechat2rss",
          inputMode: "article_url",
          articleUrl: normalizeHttpUrl(input.articleUrl)
        }
      : {
          bridgeKind: "wechat2rss",
          inputMode: "name_lookup",
          wechatName: name
        },
    deps
  );

  return {
    mode: input.mode,
    sourceType: "wechat_bridge",
    kind: input.mode === "update" ? normalizeKind(input.kind) : buildWechatKind(name),
    name,
    siteUrl: "https://mp.weixin.qq.com/",
    rssUrl: registered.rssUrl,
    bridgeKind: "wechat2rss",
    bridgeConfigJson: registered.bridgeConfigJson,
    isEnabled: input.isEnabled,
    showAllWhenSelected: input.showAllWhenSelected
  };
}

function buildRssKind(title: string, rssUrl: string): string {
  const titleSlug = slugify(title);

  if (titleSlug) {
    return titleSlug;
  }

  const url = new URL(rssUrl);
  const hostSlug = slugify(url.hostname.replace(/^www\./, ""));
  const pathSlug = slugify(url.pathname);
  return normalizeKind([hostSlug, pathSlug].filter(Boolean).join("_") || "custom_rss");
}

function buildWechatKind(name: string): string {
  const nameSlug = slugify(name);

  if (nameSlug) {
    return normalizeKind(`wechat_${nameSlug}`);
  }

  const digest = createHash("sha1").update(name).digest("hex").slice(0, 12);
  return `wechat_${digest}`;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function normalizeDisplayName(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("invalid-input");
  }

  return normalized;
}

function normalizeKind(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (!normalized || !/^[a-z0-9_]+$/.test(normalized)) {
    throw new Error("invalid-input");
  }

  return normalized;
}

function normalizeHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("invalid-input");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("invalid-input");
  }

  return url.toString();
}
