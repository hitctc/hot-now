import type { AiTimelineEventType } from "./aiTimelineTypes.js";

export type OfficialAiTimelineSourceKind =
  | "rss_feed"
  | "html_update_cards"
  | "html_date_sections"
  | "huggingface_models";

type OfficialAiTimelineSourceBase = {
  id: string;
  companyKey: string;
  companyName: string;
  sourceLabel: string;
  sourceKind: OfficialAiTimelineSourceKind;
  allowedUrlPrefixes: readonly string[];
  defaultEventType: AiTimelineEventType;
  publicDescription: string;
};

export type OfficialAiTimelineRssSource = OfficialAiTimelineSourceBase & {
  sourceKind: "rss_feed";
  feedUrl: string;
  maxItems?: number;
};

export type OfficialAiTimelineHtmlUpdateCardsSource = OfficialAiTimelineSourceBase & {
  sourceKind: "html_update_cards";
  pageUrl: string;
  itemSelector: string;
  titleSelector: string;
  dateSelector: string;
  summarySelector?: string;
  linkSelector?: string;
  dateAttribute?: string;
  titlePrefix?: string;
  maxItems?: number;
};

export type OfficialAiTimelineHtmlDateSectionsSource = OfficialAiTimelineSourceBase & {
  sourceKind: "html_date_sections";
  pageUrl: string;
  dateHeadingSelector: string;
  sectionItemSelector: string;
  maxSections?: number;
  maxItemsPerSection?: number;
};

export type OfficialAiTimelineHuggingFaceModelsSource = OfficialAiTimelineSourceBase & {
  sourceKind: "huggingface_models";
  apiUrl: string;
  orgUrl: string;
  orgName: string;
  maxItems?: number;
};

export type OfficialAiTimelineSource =
  | OfficialAiTimelineRssSource
  | OfficialAiTimelineHtmlUpdateCardsSource
  | OfficialAiTimelineHtmlDateSectionsSource
  | OfficialAiTimelineHuggingFaceModelsSource;

export type PublicOfficialAiTimelineSource = {
  id: string;
  companyName: string;
  sourceLabel: string;
  sourceKindLabel: string;
  sourceUrl: string;
  allowedScope: string;
};

// 官方源白名单只放“能直接拿到官方发布时间”的入口；容易被登录、反爬或 rate limit 阻断的来源先不放进生产采集。
export const officialAiTimelineSources = [
  {
    id: "openai-news-rss",
    companyKey: "openai",
    companyName: "OpenAI",
    sourceLabel: "OpenAI News",
    sourceKind: "rss_feed",
    feedUrl: "https://openai.com/news/rss.xml",
    allowedUrlPrefixes: ["https://openai.com/"],
    defaultEventType: "产品应用",
    publicDescription: "OpenAI 官方新闻 RSS；当前保留，但不再把它当作唯一 OpenAI 来源。",
    maxItems: 30
  },
  {
    id: "google-ai-blog-rss",
    companyKey: "google_ai",
    companyName: "Google AI",
    sourceLabel: "Google AI Blog",
    sourceKind: "rss_feed",
    feedUrl: "https://blog.google/technology/ai/rss/",
    allowedUrlPrefixes: ["https://blog.google/technology/ai/"],
    defaultEventType: "行业动态",
    publicDescription: "Google 官方 AI 博客 RSS。",
    maxItems: 30
  },
  {
    id: "google-gemini-api-release-notes",
    companyKey: "google_ai",
    companyName: "Google AI",
    sourceLabel: "Gemini API Release Notes",
    sourceKind: "html_date_sections",
    pageUrl: "https://ai.google.dev/gemini-api/docs/changelog?hl=en",
    dateHeadingSelector: ".devsite-article-body h2",
    sectionItemSelector: "li",
    allowedUrlPrefixes: ["https://ai.google.dev/gemini-api/docs/changelog", "https://ai.google.dev/gemini-api/docs/"],
    defaultEventType: "模型发布",
    publicDescription: "Gemini API 官方 Release notes；按日期标题和条目生成事件。",
    maxSections: 20,
    maxItemsPerSection: 8
  },
  {
    id: "anthropic-claude-code-changelog",
    companyKey: "anthropic",
    companyName: "Anthropic",
    sourceLabel: "Claude Code Changelog",
    sourceKind: "html_update_cards",
    pageUrl: "https://code.claude.com/docs/en/changelog",
    itemSelector: ".update-container",
    titleSelector: "[data-component-part='update-label']",
    dateSelector: "[data-component-part='update-description']",
    summarySelector: "[data-component-part='update-content']",
    linkSelector: "a[href^='#']",
    titlePrefix: "Claude Code ",
    allowedUrlPrefixes: ["https://code.claude.com/docs/en/changelog"],
    defaultEventType: "开发生态",
    publicDescription: "Claude Code 官方 changelog；按版本卡片和发布日期生成事件。",
    maxItems: 30
  },
  {
    id: "qwen-blog",
    companyKey: "qwen",
    companyName: "Qwen",
    sourceLabel: "Qwen Blog",
    sourceKind: "html_update_cards",
    pageUrl: "https://qwenlm.github.io/blog/",
    itemSelector: "article.post-entry",
    titleSelector: ".entry-header h2",
    dateSelector: ".entry-footer span[title]",
    dateAttribute: "title",
    summarySelector: ".entry-content",
    linkSelector: "a.entry-link",
    allowedUrlPrefixes: ["https://qwenlm.github.io/blog/"],
    defaultEventType: "模型发布",
    publicDescription: "Qwen 官方博客列表；按文章卡片、链接和发布时间生成事件。",
    maxItems: 20
  },
  {
    id: "qwen-huggingface-models",
    companyKey: "qwen",
    companyName: "Qwen",
    sourceLabel: "Hugging Face Qwen",
    sourceKind: "huggingface_models",
    apiUrl: "https://huggingface.co/api/models?author=Qwen&sort=createdAt&direction=-1&limit=20",
    orgUrl: "https://huggingface.co/Qwen",
    orgName: "Qwen",
    allowedUrlPrefixes: ["https://huggingface.co/Qwen/"],
    defaultEventType: "模型发布",
    publicDescription: "Qwen 官方 Hugging Face 组织模型列表；按模型 createdAt 生成事件。",
    maxItems: 20
  },
  {
    id: "deepseek-huggingface-models",
    companyKey: "deepseek",
    companyName: "DeepSeek",
    sourceLabel: "Hugging Face deepseek-ai",
    sourceKind: "huggingface_models",
    apiUrl: "https://huggingface.co/api/models?author=deepseek-ai&sort=createdAt&direction=-1&limit=20",
    orgUrl: "https://huggingface.co/deepseek-ai",
    orgName: "deepseek-ai",
    allowedUrlPrefixes: ["https://huggingface.co/deepseek-ai/"],
    defaultEventType: "模型发布",
    publicDescription: "DeepSeek 官方 Hugging Face 组织模型列表；按模型 createdAt 生成事件。",
    maxItems: 20
  },
  {
    id: "meta-llama-huggingface-models",
    companyKey: "meta_ai",
    companyName: "Meta AI",
    sourceLabel: "Hugging Face meta-llama",
    sourceKind: "huggingface_models",
    apiUrl: "https://huggingface.co/api/models?author=meta-llama&sort=createdAt&direction=-1&limit=20",
    orgUrl: "https://huggingface.co/meta-llama",
    orgName: "meta-llama",
    allowedUrlPrefixes: ["https://huggingface.co/meta-llama/"],
    defaultEventType: "模型发布",
    publicDescription: "Meta Llama 官方 Hugging Face 组织模型列表；按模型 createdAt 生成事件。",
    maxItems: 20
  },
  {
    id: "mistral-huggingface-models",
    companyKey: "mistral",
    companyName: "Mistral AI",
    sourceLabel: "Hugging Face mistralai",
    sourceKind: "huggingface_models",
    apiUrl: "https://huggingface.co/api/models?author=mistralai&sort=createdAt&direction=-1&limit=20",
    orgUrl: "https://huggingface.co/mistralai",
    orgName: "mistralai",
    allowedUrlPrefixes: ["https://huggingface.co/mistralai/"],
    defaultEventType: "模型发布",
    publicDescription: "Mistral AI 官方 Hugging Face 组织模型列表；按模型 createdAt 生成事件。",
    maxItems: 20
  },
  {
    id: "bytedance-seed-huggingface-models",
    companyKey: "bytedance_seed",
    companyName: "ByteDance Seed",
    sourceLabel: "Hugging Face ByteDance-Seed",
    sourceKind: "huggingface_models",
    apiUrl: "https://huggingface.co/api/models?author=ByteDance-Seed&sort=createdAt&direction=-1&limit=20",
    orgUrl: "https://huggingface.co/ByteDance-Seed",
    orgName: "ByteDance-Seed",
    allowedUrlPrefixes: ["https://huggingface.co/ByteDance-Seed/"],
    defaultEventType: "模型发布",
    publicDescription: "ByteDance Seed 官方 Hugging Face 组织模型列表；按模型 createdAt 生成事件。",
    maxItems: 20
  }
] as const satisfies readonly OfficialAiTimelineSource[];

export const publicOfficialAiTimelineSources = officialAiTimelineSources.map((source) => ({
  id: source.id,
  companyName: source.companyName,
  sourceLabel: source.sourceLabel,
  sourceKindLabel: toSourceKindLabel(source.sourceKind),
  sourceUrl: getOfficialAiTimelineSourceUrl(source),
  allowedScope: source.publicDescription
})) as readonly PublicOfficialAiTimelineSource[];

export function getOfficialAiTimelineSourceUrl(source: OfficialAiTimelineSource): string {
  switch (source.sourceKind) {
    case "rss_feed":
      return source.feedUrl;
    case "html_update_cards":
    case "html_date_sections":
      return source.pageUrl;
    case "huggingface_models":
      return source.orgUrl;
  }
}

function toSourceKindLabel(sourceKind: OfficialAiTimelineSourceKind): string {
  switch (sourceKind) {
    case "rss_feed":
      return "RSS";
    case "html_update_cards":
      return "官方页面";
    case "html_date_sections":
      return "官方 Release notes";
    case "huggingface_models":
      return "Hugging Face";
  }
}
