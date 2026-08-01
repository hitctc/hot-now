/**
 * 成品文章仓储的兼容出口。
 * 读取、写入与共享类型已按稳定职责拆分，既有调用方继续使用本路径。
 */
export {
  findCreativeFinishedArticleById,
  findCreativeFinishedArticleBySourceItemId,
  listCreativeFinishedArticles,
} from "./creativeFinishedArticleReadRepository.js";
export {
  checkPublishConditions,
  editCreativeFinishedArticle,
  insertCreativeFinishedArticle,
  restoreFinishedArticle,
  saveArticlePerformanceFeedback,
  softDeleteFinishedArticle,
  togglePinnedFinishedArticle,
  togglePublishable,
  toggleWechatPublished,
  validateStatusTransition,
} from "./creativeFinishedArticleWriteRepository.js";
export type {
  ArticleRewriteLevel,
  CreativeFinishedArticleRecord,
  EditCreativeFinishedArticleInput,
  InsertCreativeFinishedArticleInput,
  ListCreativeFinishedArticlesFilters,
  ListCreativeFinishedArticlesResult,
  SaveArticlePerformanceFeedbackInput,
  StepTraceEntry,
  TitleCandidate,
} from "./creativeFinishedArticleTypes.js";
