import cron from "node-cron";
import type { RuntimeConfig } from "../types/appConfig.js";

type ScheduledTask = ReturnType<typeof cron.schedule>;

// The collection scheduler drives the data fetch cadence without waiting for the mail window.
export function startCollectionScheduler(
  config: RuntimeConfig,
  run: () => Promise<void>
): ScheduledTask | null {
  if (!config.collectionSchedule.enabled) {
    return null;
  }

  return cron.schedule(`*/${config.collectionSchedule.intervalMinutes} * * * *`, run);
}

// The mail scheduler stays separate so delivery can run on a different daily clock.
export function startMailScheduler(config: RuntimeConfig, run: () => Promise<void>): ScheduledTask | null {
  if (!config.mailSchedule.enabled) {
    return null;
  }

  const { hour, minute } = parseDailyTime(config.mailSchedule.dailyTime);

  return cron.schedule(`${minute} ${hour} * * *`, run, {
    timezone: config.mailSchedule.timezone
  });
}

// The scheduler only accepts a strict HH:MM value so startup fails fast on malformed config.
function parseDailyTime(dailyTime: string) {
  const match = dailyTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    throw new Error(`Invalid mailSchedule.dailyTime: ${dailyTime}`);
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}
