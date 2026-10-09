import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";
import { readWriteQueuePreferences, saveWriteQueuePreferences } from "../../src/core/auth/userPreferencesRepository.js";
import type { WriteQueuePreferences } from "../../src/core/auth/userPreferences.js";

let testDatabase: TestDatabaseHandle | null = null;
afterEach(() => {
  testDatabase?.close();
  testDatabase = null;
});

describe("账号文章队列偏好", () => {
  it("首次读取尚未保存的队列偏好时返回空值", async () => {
    testDatabase = await createTestDatabase();

    expect(readWriteQueuePreferences(testDatabase.db)).toBeNull();
  });

  it("保存后可跨读取恢复嵌入、宽度和展开状态", async () => {
    testDatabase = await createTestDatabase();
    const preferences: WriteQueuePreferences = { embedded: true, width: 450, expanded: true };

    saveWriteQueuePreferences(testDatabase.db, preferences);

    expect(readWriteQueuePreferences(testDatabase.db)).toEqual(preferences);
  });

  it("更新队列偏好时保留账号上的其他偏好", async () => {
    testDatabase = await createTestDatabase();
    testDatabase.db.prepare("UPDATE user_profile SET preferences_json = ? WHERE id = 1")
      .run(JSON.stringify({ theme: "dark", other: { compact: true } }));

    saveWriteQueuePreferences(testDatabase.db, { embedded: false, width: 350, expanded: false });

    const row = testDatabase.db.prepare("SELECT preferences_json FROM user_profile WHERE id = 1")
      .get() as { preferences_json: string };
    expect(JSON.parse(row.preferences_json)).toEqual({
      theme: "dark",
      other: { compact: true },
      writeQueue: { embedded: false, width: 350, expanded: false },
    });
  });
});
