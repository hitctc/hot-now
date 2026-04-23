import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import {
  createTwitterAccount,
  deleteTwitterAccount,
  listTwitterAccounts,
  markTwitterAccountFetchResult,
  toggleTwitterAccount,
  updateTwitterAccount
} from "../../src/core/twitter/twitterAccountRepository.js";

describe("twitterAccountRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("creates normalized accounts with category defaults and stable listing order", async () => {
    const handle = await createTestDatabase("hot-now-twitter-accounts-");
    handles.push(handle);

    const vendor = createTwitterAccount(handle.db, {
      username: "@OpenAI",
      displayName: "OpenAI",
      notes: "AI vendor"
    });
    const person = createTwitterAccount(handle.db, {
      username: "sama",
      displayName: "Sam Altman",
      category: "person",
      includeReplies: true,
      isEnabled: false
    });

    expect(vendor.ok).toBe(true);
    expect(person.ok).toBe(true);
    expect(vendor.ok ? vendor.account : null).toMatchObject({
      username: "openai",
      displayName: "OpenAI",
      category: "official_vendor",
      priority: 90,
      includeReplies: false,
      isEnabled: true,
      notes: "AI vendor"
    });
    expect(person.ok ? person.account : null).toMatchObject({
      username: "sama",
      category: "person",
      priority: 75,
      includeReplies: true,
      isEnabled: false
    });

    expect(listTwitterAccounts(handle.db).map((account) => account.username)).toEqual(["openai", "sama"]);
  });

  it("rejects invalid and duplicate account inputs", async () => {
    const handle = await createTestDatabase("hot-now-twitter-invalid-");
    handles.push(handle);

    expect(createTwitterAccount(handle.db, { username: "" })).toEqual({ ok: false, reason: "invalid-username" });
    expect(createTwitterAccount(handle.db, { username: "name with spaces" })).toEqual({
      ok: false,
      reason: "invalid-username"
    });
    expect(createTwitterAccount(handle.db, { username: "openai", category: "unknown" })).toEqual({
      ok: false,
      reason: "invalid-category"
    });
    expect(createTwitterAccount(handle.db, { username: "openai", priority: 101 })).toEqual({
      ok: false,
      reason: "invalid-priority"
    });

    expect(createTwitterAccount(handle.db, { username: "OpenAI" }).ok).toBe(true);
    expect(createTwitterAccount(handle.db, { username: "@openai" })).toEqual({
      ok: false,
      reason: "duplicate-username"
    });
  });

  it("updates, toggles, and deletes account configuration without touching fetch status", async () => {
    const handle = await createTestDatabase("hot-now-twitter-update-");
    handles.push(handle);
    const created = createTwitterAccount(handle.db, {
      username: "openai",
      displayName: "OpenAI",
      category: "official_vendor"
    });
    const accountId = created.ok ? created.account.id : 0;

    markTwitterAccountFetchResult(handle.db, {
      id: accountId,
      success: false,
      fetchedAt: "2026-04-23T08:00:00.000Z",
      error: "rate limited"
    });

    const updated = updateTwitterAccount(handle.db, {
      id: accountId,
      username: "OpenAI",
      displayName: "OpenAI News",
      category: "product",
      priority: 82,
      includeReplies: true,
      isEnabled: true,
      notes: "official product news"
    });

    expect(updated.ok ? updated.account : null).toMatchObject({
      id: accountId,
      username: "openai",
      displayName: "OpenAI News",
      category: "product",
      priority: 82,
      includeReplies: true,
      isEnabled: true,
      notes: "official product news",
      lastFetchedAt: "2026-04-23T08:00:00.000Z",
      lastError: "rate limited"
    });

    const toggled = toggleTwitterAccount(handle.db, accountId, false);
    expect(toggled.ok ? toggled.account.isEnabled : null).toBe(false);
    expect(deleteTwitterAccount(handle.db, accountId)).toEqual({ ok: true, id: accountId });
    expect(deleteTwitterAccount(handle.db, accountId)).toEqual({ ok: false, reason: "not-found" });
  });

  it("records successful and failed fetch status for source operators", async () => {
    const handle = await createTestDatabase("hot-now-twitter-fetch-status-");
    handles.push(handle);
    const created = createTwitterAccount(handle.db, { username: "sama", category: "person" });
    const accountId = created.ok ? created.account.id : 0;

    const success = markTwitterAccountFetchResult(handle.db, {
      id: accountId,
      success: true,
      fetchedAt: "2026-04-23T09:00:00.000Z",
      userId: "12345"
    });

    expect(success.ok ? success.account : null).toMatchObject({
      userId: "12345",
      lastFetchedAt: "2026-04-23T09:00:00.000Z",
      lastSuccessAt: "2026-04-23T09:00:00.000Z",
      lastError: null
    });

    const failed = markTwitterAccountFetchResult(handle.db, {
      id: accountId,
      success: false,
      fetchedAt: "2026-04-23T10:00:00.000Z",
      error: "x".repeat(520)
    });

    expect(failed.ok ? failed.account : null).toMatchObject({
      userId: "12345",
      lastFetchedAt: "2026-04-23T10:00:00.000Z",
      lastSuccessAt: "2026-04-23T09:00:00.000Z"
    });
    expect(failed.ok ? failed.account.lastError?.length : 0).toBe(500);
  });
});
