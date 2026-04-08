export type ResolveWechatSourceInput = {
  wechatName?: string;
  articleUrl?: string;
};

export type ResolveWechatSourceResult = {
  rssUrl: string;
  resolvedName: string;
  siteUrl: string;
  resolverSummary: string;
};
