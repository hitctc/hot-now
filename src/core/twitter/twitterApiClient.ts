export type TwitterApiFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type TwitterApiAuthor = {
  id: string | null;
  username: string | null;
  name: string | null;
  followers: number | null;
  verified: boolean | null;
};

export type TwitterApiTweet = {
  id: string;
  url: string | null;
  text: string;
  createdAt: string | null;
  author: TwitterApiAuthor;
  metrics: Record<string, number>;
};

export type TwitterUserLastTweetsResult =
  | {
      ok: true;
      tweets: TwitterApiTweet[];
      hasNextPage: boolean;
      nextCursor: string | null;
    }
  | { ok: false; reason: string };

export type FetchUserLastTweetsInput = {
  apiKey: string;
  userName?: string | null;
  userId?: string | null;
  cursor?: string | null;
  includeReplies?: boolean;
  fetch?: TwitterApiFetch;
};

export type TwitterSearchQueryType = "Latest" | "Top";

export type TwitterAdvancedSearchResult =
  | {
      ok: true;
      tweets: TwitterApiTweet[];
      hasNextPage: boolean;
      nextCursor: string | null;
    }
  | { ok: false; reason: string };

export type FetchAdvancedSearchTweetsInput = {
  apiKey: string;
  query: string;
  queryType?: TwitterSearchQueryType;
  cursor?: string | null;
  fetch?: TwitterApiFetch;
};

const endpoint = "https://api.twitterapi.io/twitter/user/last_tweets";
const advancedSearchEndpoint = "https://api.twitterapi.io/twitter/tweet/advanced_search";

// The client keeps TwitterAPI.io response quirks out of the collector so tests can pin one shape.
export async function fetchUserLastTweets(input: FetchUserLastTweetsInput): Promise<TwitterUserLastTweetsResult> {
  const apiKey = input.apiKey.trim();
  const userId = input.userId?.trim();
  const userName = input.userName?.trim();

  if (!apiKey) {
    return { ok: false, reason: "TWITTER_API_KEY is not configured" };
  }

  if (!userId && !userName) {
    return { ok: false, reason: "userId or userName is required" };
  }

  const requestUrl = new URL(endpoint);

  if (userId) {
    requestUrl.searchParams.set("userId", userId);
  } else if (userName) {
    requestUrl.searchParams.set("userName", userName);
  }

  if (input.cursor?.trim()) {
    requestUrl.searchParams.set("cursor", input.cursor.trim());
  }

  if (input.includeReplies === true) {
    requestUrl.searchParams.set("includeReplies", "true");
  }

  const fetcher = input.fetch ?? fetch;

  try {
    const response = await fetcher(requestUrl, {
      headers: {
        "X-API-Key": apiKey
      }
    });

    if (!response.ok) {
      return { ok: false, reason: `TwitterAPI.io request failed with ${response.status}` };
    }

    const payload = await response.json() as Record<string, unknown>;
    const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";

    if (status === "error") {
      return { ok: false, reason: readString(payload.message) ?? "TwitterAPI.io returned error" };
    }

    const rawTweets = Array.isArray(payload.tweets) ? payload.tweets : [];

    return {
      ok: true,
      tweets: rawTweets.flatMap((tweet) => normalizeTweet(tweet)),
      hasNextPage: payload.has_next_page === true,
      nextCursor: readString(payload.next_cursor)
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "TwitterAPI.io request failed" };
  }
}

// 关键词搜索和账号时间线共用一套 tweet 归一化，避免 collector 关心第三方字段命名差异。
export async function fetchAdvancedSearchTweets(
  input: FetchAdvancedSearchTweetsInput
): Promise<TwitterAdvancedSearchResult> {
  const apiKey = input.apiKey.trim();
  const query = input.query.trim();

  if (!apiKey) {
    return { ok: false, reason: "TWITTER_API_KEY is not configured" };
  }

  if (!query) {
    return { ok: false, reason: "query is required" };
  }

  const requestUrl = new URL(advancedSearchEndpoint);
  requestUrl.searchParams.set("query", query);
  requestUrl.searchParams.set("queryType", input.queryType ?? "Latest");

  if (input.cursor?.trim()) {
    requestUrl.searchParams.set("cursor", input.cursor.trim());
  }

  const fetcher = input.fetch ?? fetch;

  try {
    const response = await fetcher(requestUrl, {
      headers: {
        "X-API-Key": apiKey
      }
    });

    if (!response.ok) {
      return { ok: false, reason: `TwitterAPI.io request failed with ${response.status}` };
    }

    const payload = await response.json() as Record<string, unknown>;
    const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";

    if (status === "error") {
      return { ok: false, reason: readString(payload.message) ?? "TwitterAPI.io returned error" };
    }

    const rawTweets = Array.isArray(payload.tweets) ? payload.tweets : [];

    return {
      ok: true,
      tweets: rawTweets.flatMap((tweet) => normalizeTweet(tweet)),
      hasNextPage: payload.has_next_page === true,
      nextCursor: readString(payload.next_cursor)
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "TwitterAPI.io request failed" };
  }
}

function normalizeTweet(value: unknown): TwitterApiTweet[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const tweet = value as Record<string, unknown>;
  const id = readString(tweet.id) ?? readString(tweet.tweet_id) ?? readString(tweet.tweetId);
  const text = readString(tweet.text) ?? readString(tweet.full_text) ?? readString(tweet.content);

  if (!id || !text) {
    return [];
  }

  const author = normalizeAuthor(tweet.author);

  return [
    {
      id,
      url: readString(tweet.url),
      text,
      createdAt: readString(tweet.createdAt) ?? readString(tweet.created_at),
      author,
      metrics: normalizeMetrics(tweet)
    }
  ];
}

function normalizeAuthor(value: unknown): TwitterApiAuthor {
  if (!value || typeof value !== "object") {
    return { id: null, username: null, name: null, followers: null, verified: null };
  }

  const author = value as Record<string, unknown>;

  return {
    id: readString(author.id) ?? readString(author.user_id),
    username: readString(author.userName) ?? readString(author.username) ?? readString(author.screen_name),
    name: readString(author.name),
    followers: readNumber(author.followers) ?? readNumber(author.followers_count),
    verified: readBoolean(author.isBlueVerified) ?? readBoolean(author.verified)
  };
}

function normalizeMetrics(tweet: Record<string, unknown>): Record<string, number> {
  const metricKeys = [
    "retweetCount",
    "replyCount",
    "likeCount",
    "quoteCount",
    "viewCount",
    "bookmarkCount",
    "retweet_count",
    "reply_count",
    "favorite_count",
    "quote_count",
    "view_count",
    "bookmark_count"
  ];
  const metrics: Record<string, number> = {};

  for (const key of metricKeys) {
    const value = readNumber(tweet[key]);

    if (value !== null) {
      metrics[key] = value;
    }
  }

  return metrics;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
