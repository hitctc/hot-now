import type {
  AiTimelineEventType,
  AiTimelineImportanceLevel,
  AiTimelineReleaseStatus,
  AiTimelineVisibilityStatus
} from "./aiTimelineTypes.js";

export type ImportantAiTimelineClassification = {
  eventType: AiTimelineEventType;
  importance: number;
  importanceLevel: AiTimelineImportanceLevel;
  releaseStatus: AiTimelineReleaseStatus;
  importanceSummaryZh: string;
  detectedEntities: string[];
  visibilityStatus: AiTimelineVisibilityStatus;
};

type ImportantAiTimelineInput = {
  companyKey: string;
  companyName: string;
  sourceLabel: string;
  defaultEventType: AiTimelineEventType;
  title: string;
  summary?: string | null;
  officialUrl: string;
};

const previewKeywords = ["preview", "roadmap", "coming soon", "early access", "预览", "即将", "前瞻", "内测"];
const releaseActionKeywords = [
  "release",
  "released",
  "launch",
  "launched",
  "introducing",
  "announce",
  "announcing",
  "brand new",
  "上线",
  "发布",
  "推出",
  "开源"
];
const maintenanceKeywords = ["typo", "minor", "documentation", "docs", "bug fix", "fixes", "修复", "文档", "错别字"];
const modelKeywords = ["model", "模型", "weights", "checkpoint", "open model", "foundation model", "基座模型", "权重"];
const developerKeywords = ["api", "sdk", "cli", "github", "developer", "agent", "tool", "command", "开发者", "智能体"];
const businessKeywords = ["pricing", "price", "plan", "enterprise", "availability", "套餐", "价格", "企业", "开放"];
const majorCapabilityKeywords = [
  "image generation",
  "video generation",
  "native 4k",
  "4k",
  "agent",
  "tts",
  "coding",
  "multimodal",
  "open-source",
  "open source",
  "weights",
  "图像生成",
  "视频模型",
  "视频生成",
  "原生画质",
  "开源",
  "多模态",
  "智能体"
];
const headlineModelKeywords = ["gpt-5", "gpt-5.5", "gemini 3", "claude 4", "deepseek", "qwen3"];

const entityPatterns: Array<{ pattern: RegExp; normalize: (match: string) => string }> = [
  { pattern: /\bGPT-\d+(?:\.\d+)?\b/gi, normalize: (match) => match.toUpperCase() },
  { pattern: /\bClaude\s*\d+(?:\.\d+)?\b/gi, normalize: normalizeSpacedEntity },
  { pattern: /\bGemini\s*\d+(?:\.\d+)?\b/gi, normalize: normalizeSpacedEntity },
  { pattern: /\bDeepSeek[-\s]?V?\d+(?:\.\d+)?\b/gi, normalize: normalizeDashedEntity },
  { pattern: /\bQwen\d+(?:\.\d+)?\b/gi, normalize: (match) => match },
  { pattern: /\bKimi[-\s]?K?\d+(?:\.\d+)?\b/gi, normalize: normalizeDashedEntity },
  { pattern: /\bMiMo[-\s]?V?\d+(?:\.\d+)?(?:[-\s]?(?:Pro|Series))?\b/gi, normalize: normalizeMiMoEntity },
  { pattern: /\bKling\s*\d*(?:\.\d+)?\b/gi, normalize: normalizeOptionalVersionEntity },
  { pattern: /\bVeo\s*\d+(?:\.\d+)?\b/gi, normalize: normalizeSpacedEntity },
  { pattern: /\bVoxtral\b/gi, normalize: () => "Voxtral" },
  { pattern: /\bSora\b/gi, normalize: () => "Sora" },
  { pattern: /\bLlama\s*\d+(?:\.\d+)?\b/gi, normalize: normalizeSpacedEntity },
  { pattern: /\bMistral(?:\s+\w+)?\b/gi, normalize: normalizeSpacedEntity },
  { pattern: /\b4K\b/gi, normalize: () => "4K" }
];

export function classifyImportantAiTimelineEvent(input: ImportantAiTimelineInput): ImportantAiTimelineClassification {
  const combinedText = `${input.title}\n${input.summary ?? ""}`;
  const normalizedText = combinedText.toLowerCase();
  const detectedEntities = detectEntities(combinedText);
  const releaseStatus: AiTimelineReleaseStatus = includesAny(normalizedText, previewKeywords)
    ? "official_preview"
    : "released";
  const hasReleaseAction = includesAny(normalizedText, releaseActionKeywords);
  const hasModelSignal = includesAny(normalizedText, modelKeywords);
  const hasDeveloperSignal = includesAny(normalizedText, developerKeywords);
  const hasBusinessSignal = includesAny(normalizedText, businessKeywords);
  const hasMajorCapability = includesAny(normalizedText, majorCapabilityKeywords);
  const hasHeadlineModelSignal = includesAny(normalizedText, headlineModelKeywords);
  const isMaintenanceOnly =
    includesAny(normalizedText, maintenanceKeywords) && !hasReleaseAction && detectedEntities.length === 0 && !hasMajorCapability;
  const eventType = resolveEventType(input.defaultEventType, {
    releaseStatus,
    hasModelSignal,
    hasDeveloperSignal,
    hasBusinessSignal,
    hasMajorCapability,
    hasHeadlineModelSignal
  });
  const importanceLevel = resolveImportanceLevel({
    detectedEntities,
    releaseStatus,
    hasReleaseAction,
    hasModelSignal,
    hasDeveloperSignal,
    hasBusinessSignal,
    hasMajorCapability,
    hasHeadlineModelSignal,
    isMaintenanceOnly
  });

  return {
    eventType,
    importance: importanceScoreByLevel(importanceLevel),
    importanceLevel,
    releaseStatus,
    importanceSummaryZh: buildChineseImportanceSummary({
      companyName: input.companyName,
      eventType,
      importanceLevel,
      releaseStatus,
      detectedEntities,
      hasMajorCapability,
      hasDeveloperSignal,
      hasBusinessSignal
    }),
    detectedEntities,
    visibilityStatus: "auto_visible"
  };
}

function resolveEventType(
  defaultEventType: AiTimelineEventType,
  signals: {
    releaseStatus: AiTimelineReleaseStatus;
    hasModelSignal: boolean;
    hasDeveloperSignal: boolean;
    hasBusinessSignal: boolean;
    hasMajorCapability: boolean;
    hasHeadlineModelSignal: boolean;
  }
): AiTimelineEventType {
  if (signals.releaseStatus === "official_preview") {
    return "官方前瞻";
  }

  if (signals.hasHeadlineModelSignal) {
    return "要闻";
  }

  if (signals.hasModelSignal || signals.hasMajorCapability) {
    return "模型发布";
  }

  if (signals.hasDeveloperSignal) {
    return "开发生态";
  }

  if (signals.hasBusinessSignal) {
    return "行业动态";
  }

  return defaultEventType;
}

function resolveImportanceLevel(input: {
  detectedEntities: string[];
  releaseStatus: AiTimelineReleaseStatus;
  hasReleaseAction: boolean;
  hasModelSignal: boolean;
  hasDeveloperSignal: boolean;
  hasBusinessSignal: boolean;
  hasMajorCapability: boolean;
  hasHeadlineModelSignal: boolean;
  isMaintenanceOnly: boolean;
}): AiTimelineImportanceLevel {
  if (input.isMaintenanceOnly) {
    return "C";
  }

  const hasFlagshipEntity = input.detectedEntities.some((entity) =>
    /^(GPT-|Claude|Gemini|DeepSeek|Qwen|Kimi|MiMo|Kling|Veo|Sora|Llama|Mistral|4K)/i.test(entity)
  );

  if (
    input.hasHeadlineModelSignal ||
    (hasFlagshipEntity && (input.hasReleaseAction || input.releaseStatus === "official_preview")) ||
    input.hasMajorCapability
  ) {
    return "S";
  }

  if (input.hasModelSignal || input.hasDeveloperSignal || input.hasBusinessSignal) {
    return "A";
  }

  return "B";
}

function importanceScoreByLevel(level: AiTimelineImportanceLevel): number {
  switch (level) {
    case "S":
      return 95;
    case "A":
      return 82;
    case "B":
      return 60;
    case "C":
      return 35;
  }
}

function buildChineseImportanceSummary(input: {
  companyName: string;
  eventType: AiTimelineEventType;
  importanceLevel: AiTimelineImportanceLevel;
  releaseStatus: AiTimelineReleaseStatus;
  detectedEntities: string[];
  hasMajorCapability: boolean;
  hasDeveloperSignal: boolean;
  hasBusinessSignal: boolean;
}): string {
  const companyName = localizeCompanyName(input.companyName);
  const entityText = input.detectedEntities.length > 0 ? `，其中最值得关注的是 ${input.detectedEntities.join("、")}` : "";

  if (input.releaseStatus === "official_preview") {
    return `这是 ${companyName} 的官方前瞻信息，尚未正式发布${entityText}。为什么重要：它来自官方渠道，并且指向下一阶段模型、产品或开发能力的变化，适合提前关注但不能当成已上线能力。`;
  }

  if (input.eventType === "模型发布" && input.hasMajorCapability) {
    return `这是 ${companyName} 在模型或多模态能力上的重要发布${entityText}。为什么重要：它可能直接改变图像、视频、代码、智能体或开源模型的可用能力边界，对用户体验和开发者选型都有影响。`;
  }

  if (input.eventType === "模型发布") {
    return `这是 ${companyName} 的一次重要模型发布${entityText}。为什么重要：模型版本变化通常会影响产品能力、API 选择和后续生态适配，值得放进主时间线持续跟踪。`;
  }

  if (input.eventType === "开发生态" || input.hasDeveloperSignal) {
    return `这是 ${companyName} 面向开发者生态的重要更新${entityText}。为什么重要：API、SDK、工具链或 Agent 能力的变化，会直接影响开发者接入成本和产品构建方式。`;
  }

  if (input.eventType === "行业动态" || input.hasBusinessSignal) {
    return `这是 ${companyName} 在商业化、开放范围或行业合作上的重要动态${entityText}。为什么重要：价格、套餐、企业能力和可用范围会影响真实采用成本和落地节奏。`;
  }

  return `这是 ${companyName} 的重要 AI 官方发布${entityText}。为什么重要：它来自官方一手来源，并且达到了 ${input.importanceLevel} 级关注度，说明这不是普通小更新。`;
}

function detectEntities(text: string): string[] {
  const entities = new Set<string>();

  for (const entry of entityPatterns) {
    for (const match of text.matchAll(entry.pattern)) {
      const normalized = entry.normalize(match[0]).trim();
      if (normalized) {
        entities.add(normalized);
      }
    }
  }

  return [...entities];
}

function includesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function normalizeSpacedEntity(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeDashedEntity(value: string): string {
  return value.replace(/\s+/g, "-").replace(/-v/i, "-V").trim();
}

function normalizeMiMoEntity(value: string): string {
  return value
    .replace(/\s+/g, "-")
    .replace(/mimo/i, "MiMo")
    .replace(/-v/i, "-V")
    .replace(/-pro/i, "-Pro")
    .replace(/-series/i, "-Series")
    .trim();
}

function normalizeOptionalVersionEntity(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return /^kling$/i.test(normalized) ? "Kling" : normalized.replace(/^kling/i, "Kling");
}

function localizeCompanyName(companyName: string): string {
  if (/xiaomi/i.test(companyName)) {
    return companyName.replace(/Xiaomi/i, "小米");
  }

  if (/kling/i.test(companyName)) {
    return companyName.replace(/Kling/i, "可灵");
  }

  return companyName;
}
