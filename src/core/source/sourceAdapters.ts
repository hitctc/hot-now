import { parseArticleFeed } from "./parseArticleFeed.js";
import { parseJuyaIssue } from "./parseJuyaIssue.js";
import { BUILTIN_SOURCES } from "./sourceCatalog.js";
import type { SourceAdapter, SourceKind } from "./types.js";

export const sourceAdapters = {
  juya: parseJuyaIssue,
  openai: (feedXml: string) => parseArticleFeed(feedXml, BUILTIN_SOURCES.openai),
  google_ai: (feedXml: string) => parseArticleFeed(feedXml, BUILTIN_SOURCES.google_ai),
  techcrunch_ai: (feedXml: string) => parseArticleFeed(feedXml, BUILTIN_SOURCES.techcrunch_ai)
} satisfies Record<SourceKind, SourceAdapter>;
