import { parseArticleFeed } from "./parseArticleFeed.js";
import { parseJuyaIssue } from "./parseJuyaIssue.js";
import { BUILTIN_SOURCES } from "./sourceCatalog.js";
import type { BuiltinSourceKind, SourceAdapter } from "./types.js";

// Most built-in feeds are plain article RSS, so one shared wrapper keeps the adapter registry
// aligned with the source catalog without duplicating the same parse call for every source.
function createArticleFeedAdapter(kind: BuiltinSourceKind): SourceAdapter {
  return (feedXml: string) => parseArticleFeed(feedXml, BUILTIN_SOURCES[kind]);
}

export const sourceAdapters = {
  juya: parseJuyaIssue,
  openai: createArticleFeedAdapter("openai"),
  google_ai: createArticleFeedAdapter("google_ai"),
  kr36: createArticleFeedAdapter("kr36"),
  kr36_newsflash: createArticleFeedAdapter("kr36_newsflash"),
  techcrunch_ai: createArticleFeedAdapter("techcrunch_ai"),
  aifanr: createArticleFeedAdapter("aifanr"),
  ithome: createArticleFeedAdapter("ithome"),
  zhihu_daily: createArticleFeedAdapter("zhihu_daily"),
  sspai: createArticleFeedAdapter("sspai"),
  chinaz: createArticleFeedAdapter("chinaz"),
  huxiu: createArticleFeedAdapter("huxiu"),
  dgtle: createArticleFeedAdapter("dgtle"),
  cnblogs: createArticleFeedAdapter("cnblogs"),
  v2ex: createArticleFeedAdapter("v2ex"),
  cyzone: createArticleFeedAdapter("cyzone"),
  geekpark: createArticleFeedAdapter("geekpark"),
  appinn: createArticleFeedAdapter("appinn"),
  wikipedia: createArticleFeedAdapter("wikipedia"),
  guangming_daily: createArticleFeedAdapter("guangming_daily"),
  williamlong_blog: createArticleFeedAdapter("williamlong_blog")
} satisfies Record<BuiltinSourceKind, SourceAdapter>;

// Loader code asks this helper before using the hand-written adapter registry so unknown user
// sources can fall back to the generic RSS parser without pretending to be built-ins.
export function hasBuiltinSourceAdapter(kind: string): kind is BuiltinSourceKind {
  return Object.hasOwn(sourceAdapters, kind);
}
