import { describe, expect, it } from "vitest";

import {
  formatTableDayLabel,
  isTableDayStart,
  toShanghaiDayKey,
} from "../../src/client/components/creative/tableDayGroups.js";

describe("creative table day groups", () => {
  const now = new Date("2026-09-22T04:00:00.000Z");

  it("按北京时间划分日期并生成今天、昨天和历史日期标签", () => {
    expect(toShanghaiDayKey("2026-09-21T16:30:00.000Z")).toBe("2026-09-22");
    expect(formatTableDayLabel("2026-09-22T01:00:00.000Z", now)).toBe("今天 · 9月22日");
    expect(formatTableDayLabel("2026-09-21T01:00:00.000Z", now)).toBe("昨天 · 9月21日");
    expect(formatTableDayLabel("2026-09-20T01:00:00.000Z", now)).toBe("9月20日 · 星期日");
  });

  it("仅把当前页首条记录和日期变化后的首条记录标记为分组起点", () => {
    const rows = [
      { createdAt: "2026-09-22T03:00:00.000Z" },
      { createdAt: "2026-09-21T18:00:00.000Z" },
      { createdAt: "2026-09-21T03:00:00.000Z" },
    ];

    expect(isTableDayStart(rows, 0, (row) => row.createdAt)).toBe(true);
    expect(isTableDayStart(rows, 1, (row) => row.createdAt)).toBe(false);
    expect(isTableDayStart(rows, 2, (row) => row.createdAt)).toBe(true);
  });

  it("时间缺失或无效时不渲染日期分隔标签", () => {
    expect(toShanghaiDayKey(null)).toBeNull();
    expect(formatTableDayLabel("not-a-date", now)).toBe("");
    expect(isTableDayStart([{ createdAt: null }], 0, (row) => row.createdAt)).toBe(false);
  });
});
