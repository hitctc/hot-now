export type SourceKind = "juya" | "openai" | "google_ai" | "techcrunch_ai";

export type SourceDefinition = {
  kind: SourceKind;
  name: string;
  siteUrl: string;
  rssUrl: string;
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
