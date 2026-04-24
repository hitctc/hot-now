import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import {
  createWechatRssSources,
  deleteWechatRssSource,
  listWechatRssSources,
  markWechatRssSourceFetchResult,
  updateWechatRssSource
} from "../../src/core/wechatRss/wechatRssSourceRepository.js";

describe("wechatRssSourceRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("batch creates normalized RSS URLs and reports skipped duplicates", async () => {
    const handle = await createTestDatabase("hot-now-wechat-rss-create-");
    handles.push(handle);

    const result = createWechatRssSources(handle.db, {
      rssUrls: [
        " http://rss.example.com/feed.xml#section ",
        "https://rss.example.com/other.xml",
        "http://rss.example.com/feed.xml"
      ]
    });
    const second = createWechatRssSources(handle.db, {
      rssUrls: "https://rss.example.com/other.xml\nhttps://rss.example.com/new.xml"
    });

    expect(result.ok ? result.created.map((source) => source.rssUrl) : []).toEqual([
      "http://rss.example.com/feed.xml",
      "https://rss.example.com/other.xml"
    ]);
    expect(result.ok ? result.skippedDuplicateUrls : []).toEqual(["http://rss.example.com/feed.xml"]);
    expect(second.ok ? second.created.map((source) => source.rssUrl) : []).toEqual([
      "https://rss.example.com/new.xml"
    ]);
    expect(second.ok ? second.skippedDuplicateUrls : []).toEqual(["https://rss.example.com/other.xml"]);
    expect(listWechatRssSources(handle.db).map((source) => source.rssUrl)).toEqual([
      "http://rss.example.com/feed.xml",
      "https://rss.example.com/other.xml",
      "https://rss.example.com/new.xml"
    ]);
  });

  it("rejects empty and invalid RSS inputs", async () => {
    const handle = await createTestDatabase("hot-now-wechat-rss-invalid-");
    handles.push(handle);

    expect(createWechatRssSources(handle.db, { rssUrls: "" })).toEqual({
      ok: false,
      reason: "empty-rss-url-list"
    });
    expect(createWechatRssSources(handle.db, { rssUrls: "notaurl" })).toEqual({
      ok: false,
      reason: "invalid-rss-url"
    });
  });

  it("updates a single RSS source and rejects duplicate edit targets", async () => {
    const handle = await createTestDatabase("hot-now-wechat-rss-update-");
    handles.push(handle);

    const created = createWechatRssSources(handle.db, {
      rssUrls: "https://rss.example.com/feed.xml\nhttps://rss.example.com/other.xml"
    });
    const firstId = created.ok ? created.created[0].id : 0;
    const secondUrl = created.ok ? created.created[1].rssUrl : "";

    const updated = updateWechatRssSource(handle.db, {
      id: firstId,
      displayName: "新的公众号 RSS 名称",
      rssUrl: " https://rss.example.com/updated.xml#hash "
    });
    const duplicate = updateWechatRssSource(handle.db, {
      id: firstId,
      displayName: "重复地址",
      rssUrl: secondUrl
    });

    expect(updated.ok ? updated.source : null).toMatchObject({
      id: firstId,
      displayName: "新的公众号 RSS 名称",
      rssUrl: "https://rss.example.com/updated.xml"
    });
    expect(duplicate).toEqual({ ok: false, reason: "duplicate-rss-url" });
    expect(listWechatRssSources(handle.db).map((source) => source.rssUrl)).toEqual([
      "https://rss.example.com/updated.xml",
      "https://rss.example.com/other.xml"
    ]);
  });

  it("records fetch status and deletes config without touching history", async () => {
    const handle = await createTestDatabase("hot-now-wechat-rss-status-");
    handles.push(handle);
    const created = createWechatRssSources(handle.db, { rssUrls: "https://rss.example.com/feed.xml" });
    const sourceId = created.ok ? created.created[0].id : 0;

    const success = markWechatRssSourceFetchResult(handle.db, {
      id: sourceId,
      fetchedAt: "2026-04-24T08:00:00.000Z",
      success: true,
      displayName: "AI 公众号",
      message: "本次 RSS 抓取成功，获得 2 条候选内容。"
    });
    const failure = markWechatRssSourceFetchResult(handle.db, {
      id: sourceId,
      fetchedAt: "2026-04-24T09:00:00.000Z",
      success: false,
      error: "x".repeat(520)
    });

    expect(success.ok ? success.source : null).toMatchObject({
      displayName: "AI 公众号",
      lastFetchedAt: "2026-04-24T08:00:00.000Z",
      lastSuccessAt: "2026-04-24T08:00:00.000Z",
      lastResult: "本次 RSS 抓取成功，获得 2 条候选内容。"
    });
    expect(failure.ok ? failure.source.lastFetchedAt : null).toBe("2026-04-24T09:00:00.000Z");
    expect(failure.ok ? failure.source.lastSuccessAt : null).toBe("2026-04-24T08:00:00.000Z");
    expect(failure.ok ? failure.source.lastResult?.length : 0).toBe(500);

    expect(deleteWechatRssSource(handle.db, sourceId)).toEqual({ ok: true, id: sourceId });
    expect(deleteWechatRssSource(handle.db, sourceId)).toEqual({ ok: false, reason: "not-found" });
  });
});
