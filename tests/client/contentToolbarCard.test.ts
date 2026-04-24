import { flushPromises, mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { describe, expect, it } from "vitest";

import ContentToolbarCard from "../../src/client/components/content/ContentToolbarCard.vue";

describe("ContentToolbarCard", () => {
  it("starts collapsed and keeps the source panel open after selection changes", async () => {
    const wrapper = mount(ContentToolbarCard, {
      props: {
        options: [
          { kind: "openai", name: "OpenAI", currentPageVisibleCount: 3 },
          { kind: "twitter_accounts", name: "Twitter 账号", currentPageVisibleCount: 2 },
          { kind: "twitter_keyword_search", name: "Twitter 关键词搜索", currentPageVisibleCount: 1 },
          { kind: "wechat_rss", name: "微信公众号 RSS", currentPageVisibleCount: 2 },
          { kind: "ithome", name: "IT之家", currentPageVisibleCount: 1 },
          { kind: "36kr", name: "36氪", currentPageVisibleCount: 2 }
        ],
        selectedSourceKinds: [],
        twitterAccountFilter: {
          options: [
            { id: 1, label: "OpenAI", username: "openai" },
            { id: 2, label: "Sam Altman", username: "sama" }
          ],
          selectedAccountIds: [1, 2]
        },
        twitterKeywordFilter: {
          options: [
            { id: 11, label: "Image2" },
            { id: 12, label: "GPT-4o" }
          ],
          selectedKeywordIds: [11, 12]
        },
        wechatRssFilter: {
          options: [
            { id: 21, label: "AI 公众号 RSS", rssUrl: "https://rss.example.com/a.xml" },
            { id: 22, label: "开发者公众号 RSS", rssUrl: "https://rss.example.com/b.xml" }
          ],
          selectedSourceIds: [21, 22]
        },
        visibleResultCount: 7,
        sortMode: "published_at",
        keyword: ""
      },
      global: {
        plugins: [Antd]
      }
    });

    expect(wrapper.get("[data-content-toolbar-card]").classes()).toEqual(
      expect.arrayContaining([
        "editorial-spotlight-card",
        "rounded-editorial-lg",
        "lg:rounded-editorial-xl",
        "px-3",
        "py-2",
        "lg:px-4",
        "lg:py-3",
        "border",
        "border-editorial-border-strong"
      ])
    );
    expect(wrapper.findAll("[data-content-toolbar-main-row]").length).toBe(1);
    const mainRow = wrapper.get("[data-content-toolbar-main-row]");
    expect(wrapper.find("[data-content-toolbar-stage]").exists()).toBe(false);
    expect(mainRow.find("[data-content-toolbar-summary]").exists()).toBe(true);
    expect(mainRow.find("[data-content-sort-control]").exists()).toBe(true);
    expect(mainRow.find("[data-content-search-control]").exists()).toBe(true);
    expect(wrapper.get("[data-content-toolbar-summary]").classes()).toEqual(
      expect.arrayContaining(["items-center", "py-2"])
    );
    expect(wrapper.get("[data-content-toolbar-mobile-controls]").classes()).toEqual(
      expect.arrayContaining(["grid", "lg:hidden"])
    );
    expect(wrapper.get("[data-content-toolbar-summary]").text()).toContain("来源：未选择");
    expect(wrapper.get("[data-content-toolbar-summary]").attributes("aria-expanded")).toBe("false");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("展开来源");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").attributes("aria-expanded")).toBe("false");
    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("none");
    expect(wrapper.get("[data-content-sort-control]").classes()).toContain("bg-editorial-panel/70");
    expect(wrapper.get("[data-content-search-control]").classes()).toContain("w-full");

    await wrapper.get("[data-content-toolbar-summary]").trigger("click");
    await flushPromises();

    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("收起来源");
    expect(wrapper.get("[data-content-toolbar-summary]").attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").attributes("aria-expanded")).toBe("true");

    await wrapper.get("[data-content-toolbar-source-toggle]").trigger("click");
    await flushPromises();

    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("none");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("展开来源");
    expect(wrapper.get("[data-content-toolbar-summary]").attributes("aria-expanded")).toBe("false");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").attributes("aria-expanded")).toBe("false");

    await wrapper.get("[data-content-toolbar-summary]").trigger("click");
    await flushPromises();

    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("收起来源");

    await wrapper.get("[data-content-sort-mode='content_score']").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("changeSort")?.at(-1)).toEqual(["content_score"]);

    await wrapper.get("[data-content-search-input]").setValue("  agent  ");
    await flushPromises();
    await wrapper.get("[data-content-search-submit]").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("search")?.at(-1)).toEqual(["agent"]);

    await wrapper.get("[data-source-kind='openai']").setValue(true);
    await flushPromises();
    expect(wrapper.emitted("changeSource")?.at(-1)).toEqual([["openai"]]);
    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("");

    await wrapper.setProps({
      selectedSourceKinds: ["openai"]
    });
    await flushPromises();

    expect(wrapper.get("[data-content-toolbar-summary]").text()).toContain("来源：OpenAI");
    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("");

    await wrapper.setProps({
      selectedSourceKinds: ["openai", "ithome", "36kr"]
    });
    await flushPromises();

    expect(wrapper.get("[data-content-toolbar-summary]").text()).toContain("来源：OpenAI、IT之家 +1");
    expect((wrapper.get("[data-content-toolbar-source-panel]").element as HTMLElement).style.display).toBe("");
    expect(wrapper.get("[data-content-toolbar-source-toggle]").text()).toContain("收起来源");

    await wrapper.setProps({
      selectedSourceKinds: ["twitter_accounts", "twitter_keyword_search", "wechat_rss"]
    });
    await flushPromises();

    expect(wrapper.find("[data-content-entity-filter='twitter-accounts']").exists()).toBe(true);
    expect(wrapper.find("[data-content-entity-filter='twitter-keywords']").exists()).toBe(true);
    expect(wrapper.find("[data-content-entity-filter='wechat-rss']").exists()).toBe(true);
    const wechatRssFilterText = wrapper.get("[data-content-entity-filter='wechat-rss']").text();
    expect(wechatRssFilterText).toContain("AI 公众号 RSS");
    expect(wechatRssFilterText).toContain("开发者公众号 RSS");
    expect(wechatRssFilterText).not.toContain("https://rss.example.com/a.xml");
    expect(wechatRssFilterText).not.toContain("https://rss.example.com/b.xml");

    await wrapper.get("[data-entity-id='twitter-accounts:2']").setValue(false);
    await flushPromises();
    expect(wrapper.emitted("changeTwitterAccounts")?.at(-1)).toEqual([[1]]);

    await wrapper.get("[data-content-filter-action='twitter-keywords-toggle-all']").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("changeTwitterKeywords")?.at(-1)).toEqual([[]]);

    await wrapper.get("[data-entity-id='wechat-rss:22']").setValue(false);
    await flushPromises();
    expect(wrapper.emitted("changeWechatRss")?.at(-1)).toEqual([[21]]);
  });
});
