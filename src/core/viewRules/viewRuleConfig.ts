type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ViewRuleKey = "hot" | "articles" | "ai";

export type ViewRuleConfigValues = {
  limit: number;
  freshnessWindowDays: number;
  freshnessWeight: number;
  sourceWeight: number;
  completenessWeight: number;
  aiWeight: number;
  heatWeight: number;
};

export type ViewRuleFieldDefinition = {
  name: keyof ViewRuleConfigValues;
  label: string;
  description: string;
  step: string;
  min: string;
  inputMode: "numeric" | "decimal";
};

type DefaultViewRuleDefinition = {
  ruleKey: ViewRuleKey;
  displayName: string;
  config: ViewRuleConfigValues;
  seedConfig: Record<string, JsonValue>;
};

export const viewRuleFieldDefinitions: ViewRuleFieldDefinition[] = [
  {
    name: "limit",
    label: "条数限制",
    description: "每个页面最多展示多少条内容。",
    step: "1",
    min: "1",
    inputMode: "numeric"
  },
  {
    name: "freshnessWindowDays",
    label: "新鲜度窗口（天）",
    description: "在这个天数内的内容更容易得到新鲜度加分。",
    step: "1",
    min: "1",
    inputMode: "numeric"
  },
  {
    name: "freshnessWeight",
    label: "新鲜度权重",
    description: "决定发布时间新近程度的影响强度。",
    step: "0.01",
    min: "0",
    inputMode: "decimal"
  },
  {
    name: "sourceWeight",
    label: "来源权重",
    description: "决定来源可信度或来源偏好的影响强度。",
    step: "0.01",
    min: "0",
    inputMode: "decimal"
  },
  {
    name: "completenessWeight",
    label: "完整度权重",
    description: "决定标题、摘要、正文完整度的影响强度。",
    step: "0.01",
    min: "0",
    inputMode: "decimal"
  },
  {
    name: "aiWeight",
    label: "AI 权重",
    description: "决定 AI 相关信号的影响强度。",
    step: "0.01",
    min: "0",
    inputMode: "decimal"
  },
  {
    name: "heatWeight",
    label: "热点权重",
    description: "决定热度、讨论度和传播迹象的影响强度。",
    step: "0.01",
    min: "0",
    inputMode: "decimal"
  }
];

export const defaultViewRuleDefinitions: DefaultViewRuleDefinition[] = [
  {
    ruleKey: "hot",
    displayName: "热点策略",
    config: {
      limit: 20,
      freshnessWindowDays: 3,
      freshnessWeight: 0.35,
      sourceWeight: 0.1,
      completenessWeight: 0.1,
      aiWeight: 0.05,
      heatWeight: 0.4
    },
    seedConfig: {
      limit: 20,
      freshnessWindowDays: 3,
      freshnessWeight: 0.35,
      sourceWeight: 0.1,
      completenessWeight: 0.1,
      aiWeight: 0.05,
      heatWeight: 0.4
    }
  },
  {
    ruleKey: "articles",
    displayName: "文章策略",
    config: {
      limit: 20,
      freshnessWindowDays: 7,
      freshnessWeight: 0.15,
      sourceWeight: 0.3,
      completenessWeight: 0.35,
      aiWeight: 0.05,
      heatWeight: 0.15
    },
    seedConfig: {
      limit: 20,
      freshnessWindowDays: 7,
      freshnessWeight: 0.15,
      sourceWeight: 0.3,
      completenessWeight: 0.35,
      aiWeight: 0.05,
      heatWeight: 0.15
    }
  },
  {
    ruleKey: "ai",
    displayName: "AI 策略",
    config: {
      limit: 20,
      freshnessWindowDays: 5,
      freshnessWeight: 0.1,
      sourceWeight: 0.1,
      completenessWeight: 0.15,
      aiWeight: 0.5,
      heatWeight: 0.15
    },
    seedConfig: {
      limit: 20,
      freshnessWindowDays: 5,
      freshnessWeight: 0.1,
      sourceWeight: 0.1,
      completenessWeight: 0.15,
      aiWeight: 0.5,
      heatWeight: 0.15
    }
  }
];

const defaultViewRuleByKey = new Map(defaultViewRuleDefinitions.map((rule) => [rule.ruleKey, rule] as const));

// 内容排序仍保留这一组固定内部默认值，但不再暴露给设置页编辑。
export function getInternalViewRuleConfig(ruleKey: string): ViewRuleConfigValues {
  return defaultViewRuleByKey.get(isViewRuleKey(ruleKey) ? ruleKey : "hot")?.config ?? defaultViewRuleDefinitions[0].config;
}

export function isViewRuleKey(value: string): value is ViewRuleKey {
  return value === "hot" || value === "articles" || value === "ai";
}

export function getDefaultViewRuleConfig(ruleKey: string): ViewRuleConfigValues {
  return defaultViewRuleByKey.get(isViewRuleKey(ruleKey) ? ruleKey : "hot")?.config ?? defaultViewRuleDefinitions[0].config;
}

export function normalizeViewRuleConfig(ruleKey: string, config: unknown): ViewRuleConfigValues {
  const defaults = getDefaultViewRuleConfig(ruleKey);

  if (!isJsonObject(config)) {
    return defaults;
  }

  return {
    limit: readPositiveInteger(config.limit, defaults.limit),
    freshnessWindowDays: readPositiveInteger(config.freshnessWindowDays, defaults.freshnessWindowDays),
    freshnessWeight: readNonNegativeNumber(config.freshnessWeight, defaults.freshnessWeight),
    sourceWeight: readNonNegativeNumber(config.sourceWeight, defaults.sourceWeight),
    completenessWeight: readNonNegativeNumber(config.completenessWeight, defaults.completenessWeight),
    aiWeight: readNonNegativeNumber(config.aiWeight, defaults.aiWeight),
    heatWeight: readNonNegativeNumber(config.heatWeight, defaults.heatWeight)
  };
}

function readPositiveInteger(value: unknown, fallback: number): number {
  const parsed = parseNumber(value);

  if (parsed === null) {
    return fallback;
  }

  const normalized = Math.floor(parsed);
  return normalized >= 1 ? normalized : fallback;
}

function readNonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = parseNumber(value);

  if (parsed === null || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
