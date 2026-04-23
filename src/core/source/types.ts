export type BuiltinSourceKind =
  | "juya"
  | "openai"
  | "google_ai"
  | "techcrunch_ai"
  | "kr36"
  | "kr36_newsflash"
  | "aifanr"
  | "ithome"
  | "zhihu_daily"
  | "sspai"
  | "chinaz"
  | "huxiu"
  | "dgtle"
  | "cnblogs"
  | "v2ex"
  | "cyzone"
  | "geekpark"
  | "appinn"
  | "wikipedia"
  | "guangming_daily"
  | "williamlong_blog";

export type SourceKind = BuiltinSourceKind | (string & {});

export type SourceDefinition = {
  kind: SourceKind;
  name: string;
  siteUrl: string;
  rssUrl: string;
  navigationViews: Array<"hot" | "articles" | "ai">;
  category: string;
  sourceType: "official" | "media" | "aggregator";
  sourcePriority: number;
};

export type CandidateItem = {
  rank: number;
  category: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  externalId: string;
  publishedAt?: string;
  summary?: string;
  metadataJson?: string;
};

export type LoadedIssue = {
  date: string;
  issueUrl: string;
  sourceKind: SourceKind;
  sourceType: SourceDefinition["sourceType"];
  sourcePriority: number;
  items: CandidateItem[];
};

export type SourceAdapter = (feedXml: string) => Promise<LoadedIssue>;
