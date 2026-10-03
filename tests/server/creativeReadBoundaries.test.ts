import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** 仅对本次明确治理的读取边界设守卫，不把合法运行时装配或纯类型导入一刀切禁止。 */
function source(file: string): string {
  return readFileSync(new URL("../../" + file, import.meta.url), "utf8");
}

describe("creative read boundaries", () => {
  it("keeps SQL and association JSON out of the HTTP list adapter", () => {
    const route = source("src/server/routes/creativeListRoutes.ts");
    expect(route).not.toMatch(/\.prepare\s*\(/);
    expect(route).not.toMatch(/JSON\.parse\s*\(/);
    expect(route).toContain("creativeListReadRepository.js");
    const model = source("src/core/creative/creativeListReadRepository.ts");
    expect(model).not.toMatch(/from ["'][^"']*(?:server\/|client\/|fastify)/);
  });

  it("gives both independent finished pages explicit query and detail owners", () => {
    for (const [page, direction] of [["FinishedArticlesPage", "article"], ["ShortFinishedArticlesPage", "short_content"]]) {
      const text = source("src/client/pages/creative/" + page + ".vue");
      expect(text).toContain(`useFinishedArticlesQuery("${direction}")`);
      expect(text).toContain("useFinishedArticleDetail(loadItems)");
      expect(text).not.toMatch(/async function (?:loadItems|openDetail|onDetailSaved)\(/);
      expect(text).not.toContain("createLatestAbortController");
    }
  });
});
