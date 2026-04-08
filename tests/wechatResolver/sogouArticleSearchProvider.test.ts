import { describe, expect, it, vi } from "vitest";
import {
  createSogouArticleSearchProvider,
  extractWechatArticleMetadata,
  parseSogouArticleSearchResults
} from "../../src/wechatResolver/providers/sogouArticleSearchProvider.js";

const sampleArticleHtml = `
  <meta name="author" content="数字生命卡兹克" />
  <script>
    var nickname = htmlDecode("数字生命卡兹克");
    var user_name = "gh_94dba26f8ca0";
    window.alias = "Rockhazix" || "";
  </script>
`;

const sampleSogouHtml = `
  <div class="txt-box">
    <h3>
      <a id="sogou_vr_11002601_title_0" href="/link?url=demo&type=2&query=Rockhazix">AI, 正在吞噬所有软件</a>
    </h3>
    <p class="txt-info" id="sogou_vr_11002601_summary_0">文章来源于公众号：数字生命卡兹克</p>
    <div class="s-p">
      <span class="all-time-y2">数字生命卡兹克</span>
      <span class="s2"><script>document.write(timeConvert('1775527586'))</script></span>
    </div>
  </div>
  <div class="txt-box">
    <h3>
      <a id="sogou_vr_11002601_title_1" href="/link?url=other&type=2&query=Rockhazix">其他提及文章</a>
    </h3>
    <p class="txt-info" id="sogou_vr_11002601_summary_1">只是在正文里提到了数字生命卡兹克</p>
    <div class="s-p">
      <span class="all-time-y2">别的公众号</span>
      <span class="s2"><script>document.write(timeConvert('1775527000'))</script></span>
    </div>
  </div>
`;

describe("sogouArticleSearchProvider", () => {
  it("extracts nickname, alias and user name from a wechat article page", () => {
    expect(extractWechatArticleMetadata(sampleArticleHtml)).toEqual({
      nickname: "数字生命卡兹克",
      alias: "Rockhazix",
      userName: "gh_94dba26f8ca0",
      biz: null
    });
  });

  it("filters sogou article search results down to the exact source account", () => {
    expect(parseSogouArticleSearchResults(sampleSogouHtml, ["数字生命卡兹克"])).toEqual([
      {
        title: "AI, 正在吞噬所有软件",
        summary: "文章来源于公众号：数字生命卡兹克",
        link: "https://weixin.sogou.com/link?url=demo&type=2&query=Rockhazix",
        sourceName: "数字生命卡兹克",
        publishedAt: new Date(1775527586 * 1000).toUTCString()
      }
    ]);
  });

  it("resolves a local feed url from article metadata and sogou article search", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(sampleArticleHtml, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      )
      .mockResolvedValueOnce(
        new Response(sampleSogouHtml, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        })
      );

    const provider = createSogouArticleSearchProvider({
      resolverBaseUrl: "http://127.0.0.1:4040",
      fetch: fetchMock
    });

    await expect(
      provider.resolveSource({
        wechatName: "数字生命卡兹克",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=demo"
      })
    ).resolves.toEqual({
      rssUrl:
        "http://127.0.0.1:4040/wechat/feed/sogou-articles.xml?query=Rockhazix&sourceName=%E6%95%B0%E5%AD%97%E7%94%9F%E5%91%BD%E5%8D%A1%E5%85%B9%E5%85%8B&articleUrl=https%3A%2F%2Fmp.weixin.qq.com%2Fs%3F__biz%3Ddemo",
      resolvedName: "数字生命卡兹克",
      siteUrl: "https://mp.weixin.qq.com/",
      resolverSummary: "local-sogou-article-search:article-alias"
    });

    await expect(
      provider.renderFeed({
        wechatName: "数字生命卡兹克",
        articleUrl: "https://mp.weixin.qq.com/s?__biz=demo"
      })
    ).resolves.toContain("<title>AI, 正在吞噬所有软件</title>");
  });
});
