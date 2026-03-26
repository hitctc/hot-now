import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseJuyaIssue } from "../../src/core/source/parseJuyaIssue.js";

describe("parseJuyaIssue", () => {
  it("extracts ranked items from content:encoded", async () => {
    const xml = await readFile("tests/fixtures/juya-rss.xml", "utf8");
    const issue = await parseJuyaIssue(xml);

    expect(issue.date).toBe("2026-03-26");
    expect(issue.items).toEqual([
      expect.objectContaining({
        rank: 1,
        category: "要闻",
        title: "谷歌推出 Lyria 3 Pro 音乐模型",
        sourceUrl: "https://blog.google/lyria"
      }),
      expect.objectContaining({
        rank: 6,
        category: "开发生态"
      })
    ]);
  });
});
