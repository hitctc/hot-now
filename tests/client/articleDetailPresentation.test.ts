import { describe, expect, it } from "vitest";

import {
  charCount,
  formatAnomalyReason,
  formatReviewReason,
  parseJsonArray,
  titleRiskLabel,
} from "../../src/client/components/creative/article-detail/articleDetailPresentation.js";
import { getDisplayTitle } from "../../src/client/components/creative/articleStatusShared.js";

describe("article detail presentation", () => {
  it("keeps malformed historical arrays safe", () => {
    expect(parseJsonArray("not-json")).toEqual([]);
    expect(parseJsonArray('["标题一", "标题二"]')).toEqual(["标题一", "标题二"]);
  });

  it("getDisplayTitle 优先取发布标题并兜底", () => {
    expect(getDisplayTitle(null, 0)).toBe("无标题");
    expect(getDisplayTitle('["备选A", "发布B"]', 1)).toBe("发布B");
    expect(getDisplayTitle('["备选A", "发布B"]', 0)).toBe("备选A");
    // titleIndex 越界时回退第一项
    expect(getDisplayTitle('["备选A", "发布B"]', 5)).toBe("备选A");
    // titleIndex 缺省视为 0
    expect(getDisplayTitle('["备选A", "发布B"]', null)).toBe("备选A");
  });

  it("keeps anomaly and review labels readable while retaining codes", () => {
    expect(formatAnomalyReason("image_prompt_missing: IMAGE2")).toBe("图片提示词缺失（image_prompt_missing）——IMAGE2");
    expect(formatReviewReason("similarity_high")).toContain("相似度过高");
    expect(titleRiskLabel("medium")).toBe("中");
    expect(charCount("一 A\n ")).toBe(2);
  });
});
