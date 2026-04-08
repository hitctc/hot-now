type ResolverFetch = typeof fetch;

export type WechatResolverRuntimeConfig = {
  baseUrl: string;
  token: string;
};

export type ResolvedWechatSource = {
  rssUrl: string;
  resolvedName: string;
  siteUrl: string;
  resolverSummary: string;
};

// The local app should only know how to call one internal resolver contract; provider fallback
// and third-party bridge details stay behind that relay boundary.
export async function resolveWechatSourceViaRelay(
  input: { wechatName?: string; articleUrl?: string },
  runtime: WechatResolverRuntimeConfig,
  fetchFn: ResolverFetch = fetch
): Promise<ResolvedWechatSource> {
  try {
    const response = await fetchFn(`${runtime.baseUrl.replace(/\/$/, "")}/wechat/resolve-source`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${runtime.token}`
      },
      body: JSON.stringify(buildResolverPayload(input))
    });
    const payload = await readResolverPayload(response);

    if (!response.ok || !isResolverSuccessPayload(payload)) {
      throw new Error(mapResolverFailureReason(readResolverFailureReason(payload)));
    }

    return {
      rssUrl: normalizeHttpUrl(payload.rssUrl, "resolver-unavailable"),
      resolvedName: normalizeRequiredText(payload.resolvedName, "resolver-unavailable"),
      siteUrl: normalizeHttpUrl(payload.siteUrl, "resolver-unavailable"),
      resolverSummary: normalizeRequiredText(payload.resolverSummary, "resolver-unavailable")
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "wechat-resolver-not-found" ||
        error.message === "resolver-unavailable" ||
        error.message === "invalid-input")
    ) {
      throw error;
    }

    throw new Error("resolver-unavailable");
  }
}

function buildResolverPayload(input: { wechatName?: string; articleUrl?: string }) {
  const payload: { wechatName?: string; articleUrl?: string } = {};

  if (typeof input.wechatName === "string" && input.wechatName.trim()) {
    payload.wechatName = input.wechatName.trim();
  }

  if (typeof input.articleUrl === "string" && input.articleUrl.trim()) {
    payload.articleUrl = input.articleUrl.trim();
  }

  return payload;
}

async function readResolverPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("resolver-unavailable");
  }

  return await response.json();
}

function readResolverFailureReason(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "resolver_unavailable";
  }

  const reason = "reason" in payload ? (payload as { reason?: unknown }).reason : undefined;
  return typeof reason === "string" ? reason.trim() : "resolver_unavailable";
}

function mapResolverFailureReason(reason: string): "wechat-resolver-not-found" | "resolver-unavailable" | "invalid-input" {
  if (reason === "not_found") {
    return "wechat-resolver-not-found";
  }

  if (reason === "invalid_article_url") {
    return "invalid-input";
  }

  return "resolver-unavailable";
}

function isResolverSuccessPayload(
  payload: unknown
): payload is {
  ok: true;
  rssUrl: string;
  resolvedName: string;
  siteUrl: string;
  resolverSummary: string;
} {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      (payload as { ok?: unknown }).ok === true &&
      typeof (payload as { rssUrl?: unknown }).rssUrl === "string" &&
      typeof (payload as { resolvedName?: unknown }).resolvedName === "string" &&
      typeof (payload as { siteUrl?: unknown }).siteUrl === "string" &&
      typeof (payload as { resolverSummary?: unknown }).resolverSummary === "string"
  );
}

function normalizeRequiredText(value: string, reason: "resolver-unavailable" | "invalid-input"): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(reason);
  }

  return normalized;
}

function normalizeHttpUrl(value: string, reason: "resolver-unavailable" | "invalid-input"): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(reason);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(reason);
  }

  return url.toString();
}
