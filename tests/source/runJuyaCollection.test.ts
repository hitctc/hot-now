import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { openDatabase } from "../../src/core/db/openDatabase.js";
import { runMigrations } from "../../src/core/db/runMigrations.js";
import { seedInitialData } from "../../src/core/db/seedInitialData.js";
import { runJuyaCollection } from "../../src/core/source/runJuyaCollection.js";
import { readCreativeSourceList } from "../../src/core/creative/creativeListReadRepository.js";

it("手动 Juya 采集也能恢复连接失败，并将当天条目写入素材库", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const xml = (await readFile("tests/fixtures/juya-rss.xml", "utf8")).replaceAll("2026-03-26", today);
  let requests = 0;
  const server = createServer((request, response) => {
    // 手动入口与定时入口必须共享恢复行为，不能只修其中一条链路。
    if (++requests === 1) { request.socket.destroy(); return; }
    response.end(xml);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const root = await mkdtemp(path.join(os.tmpdir(), "hot-now-juya-manual-"));
  const db = openDatabase(path.join(root, "hot-now.sqlite"));
  try {
    runMigrations(db);
    seedInitialData(db, { username: "admin", password: "bootstrap-password" });
    db.prepare("UPDATE content_sources SET rss_url = ? WHERE kind = 'juya'").run(`http://localhost:${(server.address() as { port: number }).port}/rss.xml`);
    const result = await runJuyaCollection(db, { fetchArticle: vi.fn().mockResolvedValue({ ok: false, error: "原站不可达", text: "", title: "" }) });
    expect(result).toEqual({ ok: true, itemCount: 2 });
    const list = readCreativeSourceList(db, { sourceName: "Juya AI Daily", direction: "article" });
    expect(list.total).toBe(2);
    expect(list.items.map(item => item.title)).toContain("谷歌推出 Lyria 3 Pro 音乐模型");
  } finally {
    db.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
