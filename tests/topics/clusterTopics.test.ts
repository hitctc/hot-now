import { describe, expect, it } from "vitest";
import { clusterTopics } from "../../src/core/topics/clusterTopics.js";
import { summarizeTopic } from "../../src/core/topics/summarizeTopic.js";

describe("clusterTopics", () => {
  it("groups entries with the same core entity and keeps failed article items in the bucket", () => {
    const topics = clusterTopics([
      {
        rank: 1,
        category: "要闻",
        title: "谷歌推出 Lyria 3 Pro 音乐模型",
        sourceUrl: "https://blog.google/lyria",
        article: {
          ok: true,
          url: "https://blog.google/lyria",
          title: "Lyria 3 Pro",
          text: "Google 发布新的音乐模型。"
        }
      },
      {
        rank: 2,
        category: "模型发布",
        title: "Google 发布 Lyria 3 Clip",
        sourceUrl: "https://ai.google.dev/music",
        article: {
          ok: true,
          url: "https://ai.google.dev/music",
          title: "Lyria 3 Clip",
          text: "Lyria 3 Clip 面向快速生成。"
        }
      },
      {
        rank: 9,
        category: "产品应用",
        title: "Claude 移动端新增工作相关功能",
        sourceUrl: "https://x.com/claudeai/status/1",
        article: {
          ok: false,
          url: "https://x.com/claudeai/status/1",
          title: "",
          text: "",
          error: "403"
        }
      }
    ]);

    expect(topics[0].topicKey).toBe("lyria");
    expect(topics[0].items).toHaveLength(2);
    expect(topics[1].topicKey).toBe("claude");
    expect(topics[1].items).toHaveLength(1);
  });

  it("builds a fixed-field summary from the highest ranked item", () => {
    const [topic] = clusterTopics([
      {
        rank: 1,
        category: "要闻",
        title: "谷歌推出 Lyria 3 Pro 音乐模型",
        sourceUrl: "https://blog.google/lyria",
        article: {
          ok: true,
          url: "https://blog.google/lyria",
          title: "Lyria 3 Pro",
          text: "Google 发布新的音乐模型。"
        }
      }
    ]);

    const summary = summarizeTopic(topic);

    expect(summary).toEqual({
      title: "谷歌推出 Lyria 3 Pro 音乐模型",
      category: "要闻",
      whyItMatters: expect.stringContaining("最高源内排序为 #1"),
      summary: expect.stringContaining("Google 发布新的音乐模型。"),
      keywords: expect.arrayContaining(["谷歌", "推出"]),
      relatedCount: 1
    });
  });
});
