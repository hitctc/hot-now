import type { AiTimelineEventType } from "./aiTimelineTypes.js";

export type OfficialAiTimelineSourceKind =
  | "rss_feed"
  | "html_update_cards"
  | "html_date_sections"
  | "html_embedded_json_posts"
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
  titlePrefix?: string;
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
  yearHeadingSelector?: string;
  maxSections?: number;
  maxItemsPerSection?: number;
};

export type OfficialAiTimelineHtmlEmbeddedJsonPostsSource = OfficialAiTimelineSourceBase & {
  sourceKind: "html_embedded_json_posts";
  pageUrl: string;
  postsArrayKey: string;
  itemUrlPrefix: string;
  maxItems?: number;
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
  | OfficialAiTimelineHtmlEmbeddedJsonPostsSource
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
    id: "anthropic-platform-release-notes",
    companyKey: "anthropic",
    companyName: "Anthropic",
    sourceLabel: "Claude Platform Release Notes",
    sourceKind: "html_date_sections",
    pageUrl: "https://platform.claude.com/docs/en/release-notes/overview",
    dateHeadingSelector: "main h2",
    sectionItemSelector: "li",
    allowedUrlPrefixes: [
      "https://platform.claude.com/docs/en/release-notes/overview",
      "https://docs.anthropic.com/en/release-notes/overview"
    ],
    defaultEventType: "开发生态",
    publicDescription: "Claude Platform 官方 release notes；按日期标题和条目生成事件。",
    maxSections: 25,
    maxItemsPerSection: 10
  },
  {
    id: "anthropic-news",
    companyKey: "anthropic",
    companyName: "Anthropic",
    sourceLabel: "Anthropic News",
    sourceKind: "html_update_cards",
    pageUrl: "https://www.anthropic.com/news",
    itemSelector: "a:has(time)",
    titleSelector: "h2, h3, h4, [class*='title']",
    dateSelector: "time",
    summarySelector: "p",
    allowedUrlPrefixes: ["https://www.anthropic.com/news/", "https://www.anthropic.com/glasswing", "https://www.anthropic.com/81k-interviews"],
    defaultEventType: "行业动态",
    publicDescription: "Anthropic 官方 Newsroom；按新闻卡片、官方链接和发布时间生成事件。",
    maxItems: 30
  },
  {
    id: "google-deepmind-news",
    companyKey: "google_deepmind",
    companyName: "Google DeepMind",
    sourceLabel: "Google DeepMind News",
    sourceKind: "html_update_cards",
    pageUrl: "https://deepmind.google/blog/",
    itemSelector: "article.card-blog",
    titleSelector: ".card__title",
    dateSelector: "time",
    dateAttribute: "datetime",
    linkSelector: "a.card__overlay-link",
    allowedUrlPrefixes: ["https://deepmind.google/blog/", "https://blog.google/"],
    defaultEventType: "模型发布",
    publicDescription: "Google DeepMind 官方 News 列表；官方列表只提供月份时按当月 1 日入库。",
    maxItems: 20
  },
  {
    id: "mistral-docs-changelog",
    companyKey: "mistral",
    companyName: "Mistral AI",
    sourceLabel: "Mistral Docs Changelog",
    sourceKind: "html_date_sections",
    pageUrl: "https://docs.mistral.ai/getting-started/changelog",
    dateHeadingSelector: "main h2",
    yearHeadingSelector: "main h3",
    sectionItemSelector: "li",
    allowedUrlPrefixes: ["https://docs.mistral.ai/resources/changelogs", "https://docs.mistral.ai/getting-started/changelog"],
    defaultEventType: "开发生态",
    publicDescription: "Mistral 官方 Docs changelog；按年份分组、日期标题和条目生成事件。",
    maxSections: 30,
    maxItemsPerSection: 10
  },
  {
    id: "mistral-news",
    companyKey: "mistral",
    companyName: "Mistral AI",
    sourceLabel: "Mistral News",
    sourceKind: "html_embedded_json_posts",
    pageUrl: "https://mistral.ai/news",
    postsArrayKey: "posts",
    itemUrlPrefix: "https://mistral.ai/news/",
    allowedUrlPrefixes: ["https://mistral.ai/news/"],
    defaultEventType: "行业动态",
    publicDescription: "Mistral 官方 News 页面；从页面内嵌官方 posts 数据读取标题、链接和发布时间。",
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
    id: "microsoft-azure-openai-whats-new",
    companyKey: "microsoft_ai",
    companyName: "Microsoft AI",
    sourceLabel: "Azure OpenAI What's New",
    sourceKind: "html_date_sections",
    pageUrl: "https://learn.microsoft.com/en-us/azure/foundry-classic/openai/whats-new",
    dateHeadingSelector: "main h2",
    sectionItemSelector: "h3",
    allowedUrlPrefixes: ["https://learn.microsoft.com/en-us/azure/foundry-classic/openai/whats-new"],
    defaultEventType: "产品应用",
    publicDescription: "Microsoft Learn 官方 Azure OpenAI What's New；按月份标题和更新小节生成事件。",
    maxSections: 18,
    maxItemsPerSection: 8
  },
  {
    id: "kimi-open-platform-changelog",
    companyKey: "kimi",
    companyName: "Kimi",
    sourceLabel: "Kimi 开放平台更新记录",
    sourceKind: "html_date_sections",
    pageUrl: "https://platform.kimi.com/blog/posts/changelog",
    dateHeadingSelector: "main h2",
    sectionItemSelector: "p, li",
    allowedUrlPrefixes: ["https://platform.kimi.com/blog/posts/changelog", "https://platform.kimi.com/docs/"],
    defaultEventType: "产品应用",
    publicDescription: "Kimi 开放平台官方更新记录；按日期标题和更新条目生成事件。",
    maxSections: 25,
    maxItemsPerSection: 8
  },
  {
    id: "minimax-api-release-notes",
    companyKey: "minimax",
    companyName: "MiniMax",
    sourceLabel: "MiniMax API Release Notes",
    sourceKind: "html_date_sections",
    pageUrl: "https://platform.minimax.io/docs/release-notes/apis",
    dateHeadingSelector: "main h2",
    sectionItemSelector: "p, li",
    allowedUrlPrefixes: ["https://platform.minimax.io/docs/release-notes/apis"],
    defaultEventType: "开发生态",
    publicDescription: "MiniMax 官方 API release notes；按日期标题和更新条目生成事件。",
    maxSections: 20,
    maxItemsPerSection: 8
  },
  {
    id: "bigmodel-new-releases",
    companyKey: "zhipu",
    companyName: "智谱 AI",
    sourceLabel: "BigModel 新品发布",
    sourceKind: "html_update_cards",
    pageUrl: "https://docs.bigmodel.cn/cn/update/new-releases",
    itemSelector: ".update-container",
    titleSelector: "[data-component-part='update-description']",
    dateSelector: "[data-component-part='update-label']",
    summarySelector: "[data-component-part='update-content']",
    linkSelector: "a.link",
    allowedUrlPrefixes: ["https://docs.bigmodel.cn/cn/update/new-releases", "https://docs.bigmodel.cn/cn/guide/models/"],
    defaultEventType: "模型发布",
    publicDescription: "智谱 BigModel 官方新品发布页；按官方更新卡片和发布日期生成事件。",
    maxItems: 25
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
    id: "qwen-github-releases",
    companyKey: "qwen",
    companyName: "Qwen",
    sourceLabel: "Qwen GitHub Releases",
    sourceKind: "rss_feed",
    feedUrl: "https://github.com/QwenLM/Qwen3/releases.atom",
    titlePrefix: "Qwen GitHub Release ",
    allowedUrlPrefixes: ["https://github.com/QwenLM/Qwen3/releases"],
    defaultEventType: "开发生态",
    publicDescription: "Qwen 官方 GitHub releases Atom；无 release 条目时自动为空，不报错。",
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
    id: "deepseek-github-releases",
    companyKey: "deepseek",
    companyName: "DeepSeek",
    sourceLabel: "DeepSeek GitHub Releases",
    sourceKind: "rss_feed",
    feedUrl: "https://github.com/deepseek-ai/DeepSeek-V3/releases.atom",
    titlePrefix: "DeepSeek GitHub Release ",
    allowedUrlPrefixes: ["https://github.com/deepseek-ai/DeepSeek-V3/releases"],
    defaultEventType: "开发生态",
    publicDescription: "DeepSeek 官方 GitHub releases Atom；按 release 更新时间生成事件。",
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
    id: "meta-llama-github-releases",
    companyKey: "meta_ai",
    companyName: "Meta AI",
    sourceLabel: "Meta Llama GitHub Releases",
    sourceKind: "rss_feed",
    feedUrl: "https://github.com/meta-llama/llama-models/releases.atom",
    titlePrefix: "Meta Llama GitHub Release ",
    allowedUrlPrefixes: ["https://github.com/meta-llama/llama-models/releases"],
    defaultEventType: "开发生态",
    publicDescription: "Meta Llama 官方 GitHub releases Atom；按 release 更新时间生成事件。",
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
    id: "mistral-github-releases",
    companyKey: "mistral",
    companyName: "Mistral AI",
    sourceLabel: "Mistral GitHub Releases",
    sourceKind: "rss_feed",
    feedUrl: "https://github.com/mistralai/mistral-common/releases.atom",
    titlePrefix: "Mistral GitHub Release ",
    allowedUrlPrefixes: ["https://github.com/mistralai/mistral-common/releases"],
    defaultEventType: "开发生态",
    publicDescription: "Mistral 官方 GitHub releases Atom；按 release 更新时间生成事件。",
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
  },
  {
    id: "bytedance-seed-github-releases",
    companyKey: "bytedance_seed",
    companyName: "ByteDance Seed",
    sourceLabel: "ByteDance Seed GitHub Releases",
    sourceKind: "rss_feed",
    feedUrl: "https://github.com/ByteDance-Seed/Seed-Coder/releases.atom",
    titlePrefix: "ByteDance Seed GitHub Release ",
    allowedUrlPrefixes: ["https://github.com/ByteDance-Seed/Seed-Coder/releases"],
    defaultEventType: "开发生态",
    publicDescription: "ByteDance Seed 官方 GitHub releases Atom；无 release 条目时自动为空，不报错。",
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
    case "html_embedded_json_posts":
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
    case "html_embedded_json_posts":
      return "官方页面";
    case "huggingface_models":
      return "Hugging Face";
  }
}
