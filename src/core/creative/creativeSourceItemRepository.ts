/**
 * 素材仓储的兼容出口。
 * 读取、写入和共享类型已按稳定职责拆分，既有调用方继续使用本路径。
 */
export {
  findCreativeSourceItemByExternalId,
  findCreativeSourceItemById,
  listCreativeSourceItems,
} from "./creativeSourceItemReadRepository.js";
export {
  insertCreativeSourceItem,
  toggleSourceItemWritable,
  updateCreativeSourceItemAccountFit,
  updateCreativeSourceItemFields,
  updateCreativeSourceItemLinkedArticle,
  updateCreativeSourceItemTrendScore,
  updateCreativeSourceItemWritingStatus,
} from "./creativeSourceItemWriteRepository.js";
export type {
  AccountFitDetails,
  AccountFitLevel,
  CreativeSourceItemRecord,
  CreativeSourceItemWritingStopDetails,
  InsertCreativeSourceItemInput,
  ListCreativeSourceItemsFilters,
  ListCreativeSourceItemsResult,
  TracedSource,
  TrendBreakdown,
  UpdateCreativeSourceItemAccountFitInput,
} from "./creativeSourceItemTypes.js";
