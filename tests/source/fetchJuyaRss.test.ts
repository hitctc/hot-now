import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchJuyaRss } from "../../src/core/source/fetchJuyaRss.js";

let server: Server;
let base: string;

beforeEach(async () => {
  // 服务只绑定 IPv4；调用 localhost 时也必须能连接，覆盖请求局部选择 IPv4 的行为。
  server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe("Juya RSS 的有界请求", () => {
  it.each([408, 429, 503])("服务临时返回 %s 后恢复，返回完整 RSS 正文", async status => {
    let requests = 0;
    server.on("request", (_request, response) => {
      response.statusCode = ++requests === 1 ? status : 200;
      response.end("<rss>中文内容</rss>");
    });
    const response = await fetchJuyaRss(`${base}/rss.xml`, { retryDelayMs: 0 });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<rss>中文内容</rss>");
    expect(requests).toBe(2);
  });

  it("持续连接中断仅尝试三次，并保留明确错误码", async () => {
    let requests = 0;
    server.on("request", request => { requests++; request.socket.destroy(); });
    await expect(fetchJuyaRss(`${base}/rss.xml`, { retryDelayMs: 0 })).rejects.toThrow(/ECONNRESET.*已尝试 3 次/);
    expect(requests).toBe(3);
  });

  it("收到响应头但正文一直未完成也会超时，不永久阻塞", async () => {
    let requests = 0;
    server.on("request", (_request, response) => {
      requests++;
      response.writeHead(200);
      response.write("<rss>");
      // 不结束正文，覆盖仅给建连加超时仍会卡住的情况。
    });
    await expect(fetchJuyaRss(`${base}/rss.xml`, { timeoutMs: 30, retryDelayMs: 0 })).rejects.toThrow(/RSS_TIMEOUT.*已尝试 3 次/);
    expect(requests).toBe(3);
  });

  it("404 不重试，保留原 HTTP 状态", async () => {
    let requests = 0;
    server.on("request", (_request, response) => { requests++; response.writeHead(404); response.end(); });
    const response = await fetchJuyaRss(`${base}/missing`, { retryDelayMs: 0 });
    expect(response.status).toBe(404);
    expect(requests).toBe(1);
  });

  it("跟随上游地址跳转并读取正文", async () => {
    server.on("request", (request, response) => {
      if (request.url === "/old") { response.writeHead(302, { location: "/rss.xml" }); response.end(); return; }
      response.end("<rss>新地址</rss>");
    });
    const response = await fetchJuyaRss(`${base}/old`);
    expect(await response.text()).toBe("<rss>新地址</rss>");
  });

  it("非 HTTP 地址直接拒绝，不发起网络请求", async () => {
    await expect(fetchJuyaRss("ftp://example.com/rss.xml")).rejects.toThrow("仅支持 HTTP/HTTPS");
  });

  it("循环跳转次数有上限，不形成无尽请求", async () => {
    let requests = 0;
    server.on("request", (_request, response) => { requests++; response.writeHead(302, { location: "/loop" }); response.end(); });
    await expect(fetchJuyaRss(`${base}/loop`, { retryDelayMs: 0 })).rejects.toThrow("已尝试 3 次");
    expect(requests).toBe(18);
  });
});
