import { describe, expect, it, vi } from "vitest";
import { checkHermesTasks } from "../../scripts/hermes-preflight.mjs";

describe("Hermes 部署前只读检查", () => {
  it("鉴权读取当前队列与共享租约，不输出任务正文或密钥", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ current: null, queue_length: 0, luna: { active: false }, history: [{ body: "私有结果" }] }) });
    const result = await checkHermesTasks({ HERMES_API_BASE_URL: "https://hermes.test/", HERMES_API_TOKEN: "test-only" }, fetcher);
    expect(result).toEqual({ active: false, queueLength: 0 });
    expect(fetcher).toHaveBeenCalledWith("https://hermes.test/api/write-queue/status", expect.objectContaining({ headers: { Authorization: "Bearer test-only" } }));
  });

  it("当前文章或后台共享租约执行中时均不判为空闲", async () => {
    for (const data of [{ current: { task_id: "one" }, queue_length: 0, luna: { active: false } }, { current: null, queue_length: 0, luna: { active: true } }]) {
      const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
      expect((await checkHermesTasks({ HERMES_API_BASE_URL: "https://hermes.test", HERMES_API_TOKEN: "test-only" }, fetcher)).active).toBe(true);
    }
  });

  it("缺配置、鉴权失败或字段缺失时失败，不把未知当空闲", async () => {
    await expect(checkHermesTasks({}, vi.fn())).rejects.toThrow("未提供");
    const env = { HERMES_API_BASE_URL: "https://hermes.test", HERMES_API_TOKEN: "test-only" };
    await expect(checkHermesTasks(env, vi.fn().mockResolvedValue({ ok: false, status: 401 }))).rejects.toThrow("HTTP 401");
    for (const data of [
      { current: null, queue_length: 0 },
      { current: false, queue_length: 0, luna: { active: false } },
      { current: null, queue_length: -1, luna: { active: false } },
    ]) {
      await expect(checkHermesTasks(env, vi.fn().mockResolvedValue({ ok: true, json: async () => data }))).rejects.toThrow("状态不完整");
    }
  });
});
