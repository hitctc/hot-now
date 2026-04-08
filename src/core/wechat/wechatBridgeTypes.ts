export type WechatBridgeRuntimeConfig = {
  baseUrl: string;
  token: string;
};

export type WechatBridgeKind = "wechat2rss";

export type WechatBridgeInput =
  | {
      bridgeKind: "wechat2rss";
      inputMode: "feed_url";
      feedUrl: string;
    }
  | {
      bridgeKind: "wechat2rss";
      inputMode: "article_url";
      articleUrl: string;
    }
  | {
      bridgeKind: "wechat2rss";
      inputMode: "name_lookup";
      wechatName: string;
    };
