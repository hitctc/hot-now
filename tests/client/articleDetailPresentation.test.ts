import { describe, expect, it } from "vitest";

import {
  charCount,
  formatAnomalyReason,
  formatReviewReason,
  getFirstTitle,
  parseJsonArray,
  titleRiskLabel,
} from "../../src/client/components/creative/article-detail/articleDetailPresentation.js";

describe("article detail presentation", () => {
  it("keeps malformed historical arrays safe", () => {
    expect(parseJsonArray("not-json")).toEqual([]);
    expect(parseJsonArray('["标题一", "标题二"]')).toEqual(["标题一", "标题二"]);
    expect(getFirstTitle(null)).toBe("无标题");
  });

  it("keeps anomaly and review labels readable while retaining codes", () => {
    expect(formatAnomalyReason("image_prompt_missing: IMAGE2")).toBe("图片提示词缺失（image_prompt_missing）——IMAGE2");
    expect(formatReviewReason("similarity_high")).toContain("相似度过高");
    expect(titleRiskLabel("medium")).toBe("中");
    expect(charCount("一 A\n ")).toBe(2);
  });
});
