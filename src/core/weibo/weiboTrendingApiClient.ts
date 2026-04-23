import { createHash } from "node:crypto";

export type WeiboFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type WeiboTrendingTopic = {
  id: string;
  title: string;
  url: string;
  rank: number | null;
  hotValue: number | null;
  label: string | null;
  wordScheme: string | null;
};

export type FetchWeiboTrendingInput = {
  fetch?: WeiboFetch;
};

export type WeiboTrendingResult = { ok: true; topics: WeiboTrendingTopic[] } | { ok: false; reason: string };

export const weiboTrendingEndpoint = "https://weibo.com/ajax/side/hotSearch";

// 微博热搜接口字段很飘，这里先统一成 collector 可直接消费的稳定结构。
export async function fetchWeiboTrending(input: FetchWeiboTrendingInput = {}): Promise<WeiboTrendingResult> {
  const fetcher = input.fetch ?? fetch;

  try {
    const response = await fetcher(weiboTrendingEndpoint, {
      headers: {
        accept: "application/json",
        referer: "https://weibo.com/",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      return { ok: false, reason: `Weibo trending failed with ${response.status}` };
    }

    const payload = (await response.json()) as Record<string, unknown>;

    if (payload.ok !== 1 || !payload.data || typeof payload.data !== "object") {
      return { ok: false, reason: "Weibo trending returned invalid payload" };
    }

    const realtime = (payload.data as Record<string, unknown>).realtime;

    if (!Array.isArray(realtime)) {
      return { ok: false, reason: "Weibo trending returned invalid payload" };
    }

    return {
      ok: true,
      topics: realtime.flatMap((value) => normalizeWeiboTrendingTopic(value))
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Weibo trending failed"
    };
  }
}

function normalizeWeiboTrendingTopic(value: unknown): WeiboTrendingTopic[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const topic = value as Record<string, unknown>;
  const title = readString(topic.note) ?? readString(topic.word);

  if (!title) {
    return [];
  }

  const wordScheme = readString(topic.word_scheme);
  const queryText = wordScheme ?? title;
  const url = new URL("https://s.weibo.com/weibo");
  url.searchParams.set("q", queryText);

  return [
    {
      id: buildTopicId(queryText),
      title,
      url: url.toString(),
      rank: readLooseNumber(topic.realpos) ?? readLooseNumber(topic.rank),
      hotValue: readLooseNumber(topic.num),
      label: readString(topic.small_icon_desc) ?? readString(topic.label_name) ?? readString(topic.icon_desc),
      wordScheme
    }
  ];
}

function buildTopicId(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readLooseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
