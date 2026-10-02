// 服务管理器提供环境变量；只查询 Hermes 状态，不读取配置文件或输出任务正文、密钥。
import { pathToFileURL } from "node:url";

/** 使用 env 中的鉴权配置和请求函数只读查询队列，返回活动摘要；缺失或无效状态直接失败。 */
export async function checkHermesTasks(env = process.env, fetcher = fetch) {
  const base = env.HERMES_API_BASE_URL?.trim();
  const token = env.HERMES_API_TOKEN?.trim();
  if (!base || !token) throw new Error("Hermes 鉴权环境变量未提供，不能确认重启安全");
  const response = await fetcher(`${base.replace(/\/+$/, "")}/api/write-queue/status`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Hermes 状态接口 HTTP ${response.status}`);
  const data = await response.json();
  if (!("current" in data) || (data.current !== null && (typeof data.current !== "object" || Array.isArray(data.current)))
    || !Number.isSafeInteger(data.queue_length) || data.queue_length < 0 || typeof data.luna?.active !== "boolean") {
    throw new Error("Hermes 状态不完整，不能确认重启安全");
  }
  return { active: Boolean(data.current) || data.luna.active, queueLength: data.queue_length };
}

if (!process.argv[1] || import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await checkHermesTasks()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
