import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../../src/core/types/appConfig.js";
import { createApiAccessToken } from "../../src/core/auth/apiAccessTokenRepository.js";
import { runApiAccessTokenExpiryReminderCycle } from "../../src/core/notifications/runApiAccessTokenExpiryReminderCycle.js";
import type { TestDatabaseHandle } from "../helpers/testDatabase.js";
import { createTestDatabase } from "../helpers/testDatabase.js";

let handle: TestDatabaseHandle;
const config = {
  publicBaseUrl: "https://now.achuan.cc",
  smtp: { user: "sender@example.com", to: "admin@example.com" }
} as RuntimeConfig;

beforeEach(async () => {
  handle = await createTestDatabase();
});

afterEach(() => {
  handle.close();
});

describe("runApiAccessTokenExpiryReminderCycle", () => {
  it("sends each due reminder stage once without including the credential", async () => {
    const created = createApiAccessToken(handle.db, "admin", "MacBook", new Date("2026-10-09T09:00:00.000Z"));
    const sendMail = vi.fn().mockResolvedValue(undefined);

    await runApiAccessTokenExpiryReminderCycle(handle.db, config, sendMail, new Date("2027-09-09T09:00:00.000Z"));
    await runApiAccessTokenExpiryReminderCycle(handle.db, config, sendMail, new Date("2027-09-09T09:05:00.000Z"));
    await runApiAccessTokenExpiryReminderCycle(handle.db, config, sendMail, new Date("2027-09-25T09:00:00.000Z"));
    await runApiAccessTokenExpiryReminderCycle(handle.db, config, sendMail, new Date("2027-10-02T09:00:00.000Z"));

    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(sendMail.mock.calls.map(([message]) => message.subject)).toEqual([
      expect.stringContaining("30 天"),
      expect.stringContaining("14 天"),
      expect.stringContaining("7 天")
    ]);
    expect(sendMail.mock.calls.every(([message]) => !message.html.includes(created.token))).toBe(true);
  });

  it("retries a reminder when email delivery fails", async () => {
    createApiAccessToken(handle.db, "admin", "Retry", new Date("2026-10-09T09:00:00.000Z"));
    const now = new Date("2027-09-09T09:00:00.000Z");
    const sendMail = vi.fn()
      .mockRejectedValueOnce(new Error("SMTP unavailable"))
      .mockResolvedValueOnce(undefined);

    await expect(runApiAccessTokenExpiryReminderCycle(handle.db, config, sendMail, now)).rejects.toThrow("SMTP unavailable");
    await runApiAccessTokenExpiryReminderCycle(handle.db, config, sendMail, now);

    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});
