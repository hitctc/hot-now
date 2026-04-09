import type { CollectionScheduleConfig } from "../types/appConfig.js";

type CollectionScheduleLike = Pick<CollectionScheduleConfig, "enabled" | "intervalMinutes"> | null | undefined;

// 根据当前调度配置和当前时刻，返回下一次自动采集真正会触发的分钟边界。
export function readNextCollectionRunAt(schedule: CollectionScheduleLike, now: Date = new Date()): string | null {
  if (!schedule?.enabled) {
    return null;
  }

  const { intervalMinutes } = schedule;

  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
    return null;
  }

  const nextRunAt = new Date(now);

  // 先回到当前分钟所在的触发边界，再统一推到未来一个边界，避免把“当前整点”误当成未来。
  nextRunAt.setSeconds(0, 0);
  nextRunAt.setMinutes(Math.floor(nextRunAt.getMinutes() / intervalMinutes) * intervalMinutes, 0, 0);

  if (nextRunAt.getTime() <= now.getTime()) {
    nextRunAt.setMinutes(nextRunAt.getMinutes() + intervalMinutes);
  }

  return nextRunAt.toISOString();
}
