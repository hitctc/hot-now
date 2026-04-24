import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { createWechatRssSources } from "../../src/core/wechatRss/wechatRssSourceRepository.js";
import { runWechatRssCollection } from "../../src/core/wechatRss/runWechatRssCollection.js";

const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AI 公众号</title>
    <link>https://mp.weixin.qq.com/</link>
    <item>
      <title>OpenAI 发布新模型</title>
      <link>https://mp.weixin.qq.com/s/openai-model</link>
      <guid>openai-model</guid>
      <pubDate>Fri, 24 Apr 2026 08:00:00 GMT</pubDate>
      <description>OpenAI model update</description>
    </item>
    <item>
      <title>Claude 推出新功能</title>
      <link>https://mp.weixin.qq.com/s/claude-feature</link>
      <guid>claude-feature</guid>
      <pubDate>Fri, 24 Apr 2026 07:00:00 GMT</pubDate>
      <description>Anthropic feature update</description>
    </item>
  </channel>
</rss>`;

describe("runWechatRssCollection", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("returns a readable reason when no RSS source exists", async () => {
    const handle = await createTestDatabase("hot-now-wechat-rss-run-empty-");
    handles.push(handle);

    await expect(runWechatRssCollection(handle.db)).resolves.toEqual({
      accepted: false,
      reason: "no-enabled-wechat-rss-sources"
    });
  });

  it("persists RSS items into the hidden aggregate source with source metadata", async () => {
    const handle = await createTestDatabase("hot-now-wechat-rss-run-collect-");
    handles.push(handle);
    const created = createWechatRssSources(handle.db, { rssUrls: "https://rss.example.com/wechat.xml" });
    const sourceId = created.ok ? created.created[0].id : 0;
    const fetchMock = vi.fn(async () => new Response(feedXml, { status: 200 }));
    const fetchArticleMock = vi.fn(async (url: string) => ({
      ok: true as const,
      url,
      title: "",
      text: `正文：${url}`
    }));

    const result = await runWechatRssCollection(handle.db, {
      fetch: fetchMock,
      fetchArticle: fetchArticleMock,
      now: new Date("2026-04-24T09:00:00.000Z")
    });

    expect(result).toEqual({
      accepted: true,
      action: "collect-wechat-rss",
      enabledSourceCount: 1,
      fetchedItemCount: 2,
      persistedContentItemCount: 2,
      failureCount: 0
    });

    const rows = handle.db
      .prepare(
        `
          SELECT cs.kind AS source_kind, ci.external_id, ci.canonical_url, ci.title, ci.metadata_json
          FROM content_items ci
          JOIN content_sources cs ON cs.id = ci.source_id
          WHERE cs.kind = 'wechat_rss'
          ORDER BY ci.published_at DESC
        `
      )
      .all() as Array<{
      source_kind: string;
      external_id: string;
      canonical_url: string;
      title: string;
      metadata_json: string | null;
    }>;
    const statusRow = handle.db
      .prepare("SELECT display_name, last_fetched_at, last_success_at, last_result FROM wechat_rss_sources WHERE id = ?")
      .get(sourceId) as {
      display_name: string | null;
      last_fetched_at: string | null;
      last_success_at: string | null;
      last_result: string | null;
    };

    expect(rows.map((row) => ({
      source_kind: row.source_kind,
      external_id: row.external_id,
      canonical_url: row.canonical_url,
      title: row.title
    }))).toEqual([
      {
        source_kind: "wechat_rss",
        external_id: `wechat-rss:${sourceId}:openai-model`,
        canonical_url: "https://mp.weixin.qq.com/s/openai-model",
        title: "OpenAI 发布新模型"
      },
      {
        source_kind: "wechat_rss",
        external_id: `wechat-rss:${sourceId}:claude-feature`,
        canonical_url: "https://mp.weixin.qq.com/s/claude-feature",
        title: "Claude 推出新功能"
      }
    ]);
    expect(JSON.parse(rows[0].metadata_json ?? "{}")).toMatchObject({
      collector: {
        kind: "wechat_rss",
        sourceId,
        rssUrl: "https://rss.example.com/wechat.xml",
        displayName: "AI 公众号"
      }
    });
    expect(statusRow).toMatchObject({
      display_name: "AI 公众号",
      last_fetched_at: "2026-04-24T09:00:00.000Z",
      last_success_at: "2026-04-24T09:00:00.000Z",
      last_result: "本次 RSS 抓取成功，获得 2 条候选内容。"
    });
    expect(fetchArticleMock).toHaveBeenCalledTimes(2);
  });
});
