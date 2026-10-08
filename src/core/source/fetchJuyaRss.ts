import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { setTimeout as sleep } from "node:timers/promises";

type RssResponse = { status: number; body: string };
const maxAttempts = 3;

/** 获取 Juya RSS：仅此请求固定 IPv4，每次含跳转和正文读取最多 25 秒，瞬时错误最多尝试三次。
 * 不改全局网络设置；返回兼容现有调用方的状态和 text()，最终连接失败保留错误码但不泄露 URL 参数。
 */
export async function fetchJuyaRss(
  rssUrl: string,
  options: { timeoutMs?: number; retryDelayMs?: number } = {}
): Promise<{ status: number; text: () => Promise<string> }> {
  const url = new URL(rssUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Juya RSS 仅支持 HTTP/HTTPS");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 25_000);
    try {
      const response = await requestRss(url, controller.signal);
      const transient = response.status === 408 || response.status === 429 || (response.status >= 500 && response.status <= 599);
      // 404 等永久失败不反复请求；第三次失败仍返回 HTTP 状态，沿用现有调用方的错误合同。
      if (!transient || attempt === maxAttempts) return { status: response.status, text: async () => response.body };
    } catch (error) {
      if (attempt === maxAttempts) {
        const code = controller.signal.aborted ? "RSS_TIMEOUT" : (error as NodeJS.ErrnoException).code ?? "NETWORK_ERROR";
        throw new Error(`Juya RSS 请求失败：${code}（已尝试 ${attempt} 次）`, { cause: error });
      }
    } finally { clearTimeout(timer); }
    await sleep(options.retryDelayMs ?? 500);
  }
  throw new Error("Juya RSS 请求未完成");
}

/** 用 IPv4 读取一次 RSS；同一取消信号覆盖最多五次重定向和完整正文，异常不会留下悬挂连接。 */
function requestRss(url: URL, signal: AbortSignal, redirects = 0): Promise<RssResponse> {
  return new Promise((resolve, reject) => {
    const get = url.protocol === "https:" ? httpsGet : httpGet;
    const request = get(url, { family: 4, signal }, response => {
      const status = response.statusCode ?? 0;
      response.on("error", reject);
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        if (redirects >= 5) { reject(new Error("Juya RSS 重定向次数过多")); return; }
        try {
          const next = new URL(response.headers.location, url);
          if (next.protocol !== "http:" && next.protocol !== "https:") throw new Error("Juya RSS 跳转协议无效");
          resolve(requestRss(next, signal, redirects + 1));
        } catch (error) { reject(error); }
        return;
      }
      // 错误响应无需等待正文下载，否则 5xx 错误页也可能耗尽本次超时预算。
      if (status !== 200) { response.resume(); resolve({ status, body: "" }); return; }
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
  });
}
