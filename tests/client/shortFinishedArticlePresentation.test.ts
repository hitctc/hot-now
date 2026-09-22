import { describe, expect, it } from "vitest";

import {
  SHORT_FINISHED_COLUMNS,
  SHORT_FINISHED_STATUS_OPTIONS,
  calculateWritingDuration,
  formatShortFinishedLocalTime,
  formatTrendBreakdown,
  formatWritingDuration,
  getShortFinishedStatusInfo,
  getTrendBreakdownBars
} from "../../src/client/pages/creative/shortFinishedArticlePresentation.js";

const breakdown = {
  topicPower: 30,
  emotionResonance: 10,
  infoGap: 20,
  socialCurrency: 0,
  timingWindow: 0,
  audienceBreadth: 0
};

describe("短内容成品表格展示模型", () => {
  it("保持状态筛选和列定义的既有顺序", () => {
    expect(SHORT_FINISHED_STATUS_OPTIONS[0]).toEqual({ label: "全部状态", value: "" });
    expect(SHORT_FINISHED_STATUS_OPTIONS.at(-1)).toEqual({ label: "已删除", value: "soft_deleted" });
    expect(SHORT_FINISHED_COLUMNS.map((column) => column.key)).toEqual([
      "idSeq", "title", "coverImage", "status", "sourceName",
      "trend", "similarity", "form", "timeInfo", "actions"
    ]);
  });

  it("按固定颜色顺序生成趋势柱并按分数生成说明", () => {
    expect(formatTrendBreakdown(breakdown)).toBe("话题30 | 信息差20 | 情绪10 | 社交0 | 时效0 | 受众0");
    expect(getTrendBreakdownBars(breakdown)).toEqual([
      { label: "话题30", value: 30, color: "#3b82f6", width: "50%" },
      { label: "信息差20", value: 20, color: "#f59e0b", width: "33%" },
      { label: "情绪10", value: 10, color: "#ef4444", width: "17%" }
    ]);
  });

  it("将无时区 SQLite 时间按 UTC 解析并显示为北京时间", () => {
    const formatted = formatShortFinishedLocalTime("2026-09-22 00:00:00");
    expect(formatted).toContain("2026");
    expect(formatted).toContain("09");
    expect(formatted).toContain("22");
    expect(formatted).toContain("08:00");
    expect(formatShortFinishedLocalTime("invalid")).toBe("-");
  });

  it("根据阶段首尾时间计算并格式化写作耗时", () => {
    expect(calculateWritingDuration([
      { startedAt: "2026-09-22T00:00:00Z" },
      { finishedAt: "2026-09-22T00:01:05Z" }
    ])).toBe(65_000);
    expect(formatWritingDuration(65_000)).toBe("1m05s");
    expect(formatWritingDuration(3_660_000)).toBe("1h01m");
    expect(calculateWritingDuration(null)).toBeNull();
  });

  it("短内容状态优先使用专用文案，其他状态回退共享映射", () => {
    expect(getShortFinishedStatusInfo("ready")).toEqual({ label: "可发布", color: "green" });
    expect(getShortFinishedStatusInfo("needs_review").label).toBe("待审核");
  });
});
