export const CODE_IMAGE_CARD_VARIANTS = ["2.5:1", "1:1", "3:4"] as const;

export type CodeImageCardVariant = typeof CODE_IMAGE_CARD_VARIANTS[number];
export type CodeImageCardStatus = "pending" | "running" | "succeeded" | "failed" | "stale";

export type CodeImageCard = {
  variant: CodeImageCardVariant;
  url: string | null;
  width: number;
  height: number;
  status: CodeImageCardStatus;
  generatedAt: string | null;
  sourceFingerprint: string | null;
  fileSize: number | null;
  error: string | null;
};

/** 读取数据库中的代码制图片元数据，坏数据按空数组处理以保证历史文章仍可打开。 */
export function parseCodeImageCards(raw: unknown): CodeImageCard[] {
  if (!raw) return [];
  const parsed = typeof raw === "string" ? parseJson(raw) : raw;
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry) => normalizeCodeImageCard(entry));
}

/** 按固定比例顺序返回元数据，避免页面和封面逻辑各自定义顺序。 */
export function orderCodeImageCards(cards: CodeImageCard[]): CodeImageCard[] {
  return CODE_IMAGE_CARD_VARIANTS.map((variant) => cards.find((card) => card.variant === variant)).filter(
    (card): card is CodeImageCard => Boolean(card),
  );
}

/** 根据比例读取单张代码制图片状态，调用方不需要处理数组下标。 */
export function findCodeImageCard(cards: CodeImageCard[], variant: CodeImageCardVariant): CodeImageCard | undefined {
  return cards.find((card) => card.variant === variant);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeCodeImageCard(value: unknown): CodeImageCard[] {
  if (!value || typeof value !== "object") return [];
  const entry = value as Record<string, unknown>;
  if (!isCodeImageCardVariant(entry.variant)) return [];
  return [{
    variant: entry.variant,
    url: typeof entry.url === "string" && entry.url.trim() ? entry.url : null,
    width: typeof entry.width === "number" ? entry.width : 0,
    height: typeof entry.height === "number" ? entry.height : 0,
    status: isCodeImageCardStatus(entry.status) ? entry.status : "pending",
    generatedAt: typeof entry.generatedAt === "string" ? entry.generatedAt : null,
    sourceFingerprint: typeof entry.sourceFingerprint === "string" ? entry.sourceFingerprint : null,
    fileSize: typeof entry.fileSize === "number" ? entry.fileSize : null,
    error: typeof entry.error === "string" ? entry.error : null,
  }];
}

function isCodeImageCardVariant(value: unknown): value is CodeImageCardVariant {
  return typeof value === "string" && (CODE_IMAGE_CARD_VARIANTS as readonly string[]).includes(value);
}

function isCodeImageCardStatus(value: unknown): value is CodeImageCardStatus {
  return value === "pending" || value === "running" || value === "succeeded" || value === "failed" || value === "stale";
}
