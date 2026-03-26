import cron from "node-cron";
import type { RuntimeConfig } from "../types/appConfig.js";

type ScheduledTask = ReturnType<typeof cron.schedule>;

// This only starts the cron job when scheduling is enabled in config.
export function startScheduler(config: RuntimeConfig, run: () => Promise<void>): ScheduledTask | null {
  if (!config.schedule.enabled) {
    return null;
  }

  const { hour, minute } = parseDailyTime(config.schedule.dailyTime);

  return cron.schedule(`${minute} ${hour} * * *`, run, {
    timezone: config.schedule.timezone
  });
}

// The scheduler only accepts a strict HH:MM value so startup fails fast on malformed config.
function parseDailyTime(dailyTime: string) {
  const match = dailyTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    throw new Error(`Invalid schedule.dailyTime: ${dailyTime}`);
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}
