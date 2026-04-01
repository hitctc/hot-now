import { afterEach, describe, expect, it } from "vitest";
import { getNlRuleSet, listNlRuleSets, saveNlRuleSet } from "../../src/core/strategy/nlRuleRepository.js";
import { createTestDatabase, type TestDatabaseHandle } from "../helpers/testDatabase.js";

describe("nlRuleRepository", () => {
  const handles: TestDatabaseHandle[] = [];

  afterEach(() => {
    while (handles.length > 0) {
      handles.pop()?.close();
    }
  });

  it("seeds the default scopes with empty rule text", async () => {
    const handle = await createTestDatabase("hot-now-nl-rules-");
    handles.push(handle);

    expect(listNlRuleSets(handle.db)).toEqual([
      {
        scope: "base",
        enabled: true,
        ruleText: "",
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      },
      {
        scope: "ai_new",
        enabled: true,
        ruleText: "",
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      },
      {
        scope: "ai_hot",
        enabled: true,
        ruleText: "",
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      },
      {
        scope: "hero",
        enabled: true,
        ruleText: "",
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      }
    ]);
  });

  it("saves one scope and rejects unsupported scopes", async () => {
    const handle = await createTestDatabase("hot-now-nl-rules-");
    handles.push(handle);

    const successResult = saveNlRuleSet(
      handle.db,
      "base",
      {
        enabled: false,
        ruleText: "暂时不展示融资快讯；agent workflow 相关内容加分。"
      }
    );
    const failureResult = saveNlRuleSet(handle.db, "unknown-scope", {
      enabled: true,
      ruleText: "missing"
    });

    expect(successResult).toEqual({ ok: true });
    expect(failureResult).toEqual({
      ok: false,
      reason: "not-found"
    });
    expect(getNlRuleSet(handle.db, "base")).toEqual({
      scope: "base",
      enabled: false,
      ruleText: "暂时不展示融资快讯；agent workflow 相关内容加分。",
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
  });
});
