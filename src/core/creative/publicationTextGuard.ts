import { createHash } from "node:crypto";

/** 检查实际选用的标题及正式正文；匹配当前正文的专项否决也须阻断，编辑后不沿用旧结论。 */
export function findArticlePublicationTextIssue(article: {
  titles?: string[] | null; titleIndex?: number | null;
  humanMarkdown?: string | null; contentMarkdown?: string | null;
  stepTrace?: { meta?: Record<string, unknown> | null }[] | null;
}): string | null {
  const index = Math.max(0, Math.min(article.titleIndex ?? 0, (article.titles?.length ?? 1) - 1));
  const body = article.humanMarkdown ?? article.contentMarkdown ?? "";
  const issue = findPublicationTextIssue({ "发布标题": article.titles?.[index], "正式正文": body });
  if (issue) return issue;
  // 系统补的固定短稿结语不算人工修稿，不能使已否决正文的回执自动失效。
  const hash = createHash("sha256").update(body.replace(/\s*跪求点赞、关注。\s*$/, "").trim()).digest("hex");
  const titleHash = createHash("sha256").update(article.titles?.[index]?.trim() ?? "").digest("hex");
  for (const step of [...(article.stepTrace ?? [])].reverse()) {
    const report = step.meta?.publicationCheck as {
      policy?: string; bodyHash?: string; titleHashes?: string[]; passed?: boolean; issues?: { field?: string }[];
    } | undefined;
    if (report?.policy !== "reader-facing-v1") continue;
    const bodyMatches = report.bodyHash === hash;
    if (report.passed === true && bodyMatches) return null;
    if (report.passed !== false) continue;
    // 评论等未发送附属字段不能误伤干净的正文；标题修正也不要求额外改正文来使旧否决失效。
    const issues = report.issues?.length ? report.issues : [{ field: "body" }];
    const blocked = issues.some(issue => {
      if (/^body(?:$|[\[.])/.test(issue.field ?? "")) return bodyMatches;
      if (!/^titles?(?:$|[\[.])/.test(issue.field ?? "")) return false;
      const position = issue.field?.match(/^titles\[(\d+)\]/);
      return position ? report.titleHashes?.[Number(position[1])] === titleHash : report.titleHashes?.includes(titleHash);
    });
    if (blocked) return "发布稿语境未通过：当前正式稿仍包含专项复核否决的字段，请修正文案后再推送";
  }
  return null;
}

// 与 Hermes publication_guard.py 的窄规则及回归用例保持一致，不封禁正常技术/司法报道的单个词。
const patterns = [
  /(?:(?:现有|现在|目前|当前|本次|手头)的?)?(?:证据|依据|材料)[^。！？\n]{0,8}(?:只是|仅|来自|源自|只有|取自)[^。！？\n]{0,25}(?:搜索(?:页面|摘要|结果页)|抓取(?:内容|材料|结果))/,
  /原链接[^。！？\n]{0,8}未(?:取得|获取|抓到)[^。！？\n]{0,10}(?:正文|原文)/,
  /(?:本稿|这篇稿件|当前正文|当前稿件)[^。！？\n]{0,16}(?:提示词|质检|审改|事实包|检查点|评分|采集|核验过程|回退)/,
];

/** 检查选定发布字段及嵌套文案，返回首个定位原因；只归一化检测副本，不删除或改写成稿。 */
export function findPublicationTextIssue(fields: Record<string, unknown>): string | null {
  /** 递归读取实际发布文字，保持数组位置供编辑定位；不检查调用方未传入的审计记录。 */
  function visit(value: unknown, path: string): string | null {
    if (typeof value === "string") {
      const text = value.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff*`_#]/g, "").replace(/\s+/g, "");
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return `发布稿语境未通过：${path}含内部流程说明「${match[0].slice(0, 160)}」，请修正文案后再推送`;
      }
    } else if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        const issue = visit(value[index], `${path}[${index}]`);
        if (issue) return issue;
      }
    } else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        const issue = visit(item, path ? `${path}.${key}` : key);
        if (issue) return issue;
      }
    }
    return null;
  }
  return visit(fields, "");
}
