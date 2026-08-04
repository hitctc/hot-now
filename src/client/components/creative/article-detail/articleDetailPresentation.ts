import type { CreativeFinishedArticle } from "../../../services/creativeApi.js";

const anomalyReasonMap: Record<string, string> = {
  originality_risk_high: "原创风险过高",
  c_mode_word_count_insufficient: "C 模式字数不足",
  image_prompt_missing: "图片提示词缺失",
  image_prompt_count_mismatch: "图片提示词数量不匹配",
  image_prompt_parse_failed: "图片提示词解析失败",
};

const reviewReasonMap: Record<string, string> = {
  originality_risk_high: "原创风险过高（originality_risk_high）",
  similarity_high: "相似度过高（similarity_high）",
  first_person_risk: "第一人称风险（first_person_risk）",
  c_mode_word_count_insufficient: "C 模式字数不足（c_mode_word_count_insufficient）",
};

const modeMap: Record<string, string> = {
  A: "模式A · 短篇观点文",
  B: "模式B · 短篇观察随笔",
};

/** 安全解析历史 JSON 数组字段，坏数据按空数组展示。 */
export function parseJsonArray(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** v2 文章显示读者任务，历史文章继续显示既有 A/B 模式。 */
export function pipelineLabel(article: CreativeFinishedArticle): string {
  if (article.originType === "manual") return "手动创作";
  if (article.pipelineVersion === "v2") return `v2 · ${article.readerTask || "读者任务未标注"}`;
  if (!article.mode) return "模式 -";
  return modeMap[article.mode] ?? `模式${article.mode}`;
}

/** 摘要和标题展示使用的净字符数，忽略空白字符。 */
export function charCount(text: string | null | undefined): number {
  if (!text) return 0;
  return text.replace(/[\s\n]/g, "").length;
}

/** 计算中文字数；英文按单词计数。 */
export function countWords(text: string): number {
  const chinese = text.match(/[一-鿿㐀-䶿]/g);
  const chineseCount = chinese ? chinese.length : 0;
  const englishWords = text.replace(/[一-鿿㐀-䶿]/g, " ").match(/[a-zA-Z0-9]+/g);
  return chineseCount + (englishWords ? englishWords.length : 0);
}

/** 格式化数据库中的 UTC 时间为上海时区文本。 */
export function formatLocalTime(value: string): string {
  const fixed = /^[0-9]{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/[Zz+\-]\d{0,4}$/.test(value)
    ? value.replace(" ", "T") + "Z"
    : value;
  const date = new Date(fixed);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 展示异常原因时补充中文解释，但保留原始代码方便追踪。 */
export function formatAnomalyReason(raw: string): string {
  for (const [key, label] of Object.entries(anomalyReasonMap)) {
    if (raw === key) return `${label}（${key}）`;
    if (raw.startsWith(`${key}:`) || raw.startsWith(`${key} - `)) {
      const rest = raw.slice(key.length).replace(/^[: -]+/, "");
      return `${label}（${key}）${rest ? `——${rest}` : ""}`;
    }
  }
  return raw;
}

/** 将审核原因枚举转换为用户可理解的说明。 */
export function formatReviewReason(raw: string): string {
  return reviewReasonMap[raw] ?? raw;
}

/** 把标题风险枚举映射为编辑人员可直接理解的中文。 */
export function titleRiskLabel(risk?: string): string {
  return ({ low: "低", medium: "中", high: "高" } as Record<string, string>)[risk ?? ""] ?? "未评估";
}

/** 相似度风险使用既有红黄绿视觉语义。 */
export function riskDimClass(level: string | undefined): string {
  if (level === "high") return "text-red-500";
  if (level === "medium") return "text-yellow-600";
  return "text-green-600";
}

/** 保存成功提示的相对时间文案。 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

/** 读者评论和作者回复的复制文本。 */
export function formatCommentPair(comment: { reader: string; author_reply: string }): string {
  return `读者：${comment.reader}\n作者回复：${comment.author_reply}`;
}
