import type { ContentPageModel, ReadContentPageOptions } from "../../services/contentApi";

export type ContentFeedPageConfig = {
  authErrorMessage: string;
  emptyDefaultDescription: string;
  emptyDefaultTitle: string;
  emptyFilteredDescription: string;
  emptyFilteredTitle: string;
  loadErrorMessage: string;
  pageKey: ContentPageModel["pageKey"];
  showFeaturedCard: boolean;
  skeletonRows: number;
  stageAccent: "cyan" | "blue";
  stageBadge: string;
  stageDescription: string;
  stageKicker: string;
  stageStrategyLabel: string;
  stageTitle: string;
};

export type ContentFeedPageReader = (options?: ReadContentPageOptions) => Promise<ContentPageModel>;
