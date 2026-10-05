import { describe, expect, it } from "vitest";

import {
  accountFitColor,
  accountFitLabel,
  formatBreakdown,
  formatPublishedAt,
  getBreakdownBars,
  writingStatusColor,
  writingStatusLabel,
} from "../../src/client/components/creative/source-items/sourceItemPresentation.js";

describe("source item presentation", () => {
  it("distinguishes a scored short source awaiting status sync without guessing eligibility", () => {
    expect(writingStatusLabel("pending", 82)).toBe("已评分·待同步");
    expect(writingStatusLabel("pending", 0)).toBe("已评分·待同步");
    expect(writingStatusLabel("pending", null)).toBe("待评估");
    expect(writingStatusLabel("pending")).toBe("待评估");
    expect(writingStatusLabel("done", 82)).toBe("已写作");
  });
  it("keeps the breakdown bar order and percentages stable", () => {
    const bars = getBreakdownBars({
      topicPower: 10,
      emotionResonance: 0,
      infoGap: 20,
      socialCurrency: 0,
      timingWindow: 10,
      audienceBreadth: 0,
    });

    expect(bars.map((bar) => [bar.label, bar.width])).toEqual([
      ["话题10", "25%"],
      ["信息差20", "50%"],
      ["时效10", "25%"],
    ]);
  });

  it("formats tooltip text by score descending", () => {
    expect(formatBreakdown({
      topicPower: 10,
      emotionResonance: 30,
      infoGap: 20,
      socialCurrency: 0,
      timingWindow: 5,
      audienceBreadth: 0,
    })).toBe("情绪30 | 信息差20 | 话题10 | 时效5 | 社交0 | 受众0");
  });

  it("preserves database UTC parsing and invalid fallback", () => {
    expect(formatPublishedAt("not-a-date")).toBe("-");
    expect(formatPublishedAt(null)).toBe("-");
    expect(formatPublishedAt("2026-08-01 00:00:00")).toMatch(/08[/-]01/);
  });

  it("maps status and account fit labels/colors", () => {
    expect(writingStatusLabel("failed")).toBe("技术失败");
    expect(writingStatusColor("failed")).toBe("red");
    expect(accountFitLabel("medium")).toBe("中适配");
    expect(accountFitColor("medium")).toBe("gold");
    expect(accountFitLabel(null)).toBe("未评估");
  });
});
