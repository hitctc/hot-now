import { readFileSync } from "node:fs";

const apiOrigin = "https://now.achuan.cc";
const allowedMethods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

/** 从钥匙串管道读取 token 并调用固定生产域名的 JSON API，不把凭证写入参数或输出。 */
async function main() {
  const [rawMethod, endpoint, dataFlag, dataFile] = process.argv.slice(2);
  const method = rawMethod?.toUpperCase();
  if (!method || !endpoint || !allowedMethods.has(method)) {
    throw new Error("Usage: hotnow-api.sh METHOD /api/... [--data-file request.json]");
  }

  const target = new URL(endpoint, apiOrigin);
  if (
    target.origin !== apiOrigin ||
    !/^\/(api|actions)(\/|$)/.test(target.pathname) ||
    target.hash
  ) {
    throw new Error("Only same-origin /api/* and /actions/* endpoints are allowed.");
  }

  const token = (await readStdin()).trim();
  if (!token) {
    throw new Error("No API token was found in the macOS Keychain entry.");
  }

  let body;
  if (dataFlag !== undefined || dataFile !== undefined) {
    if (dataFlag !== "--data-file" || !dataFile || method === "GET" || method === "HEAD") {
      throw new Error("For write requests, provide an optional --data-file JSON file.");
    }
    body = JSON.stringify(JSON.parse(readFileSync(dataFile, "utf8")));
  }

  const response = await fetch(target, {
    method,
    redirect: "error",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {})
    },
    body
  });
  const responseText = await response.text();
  process.stdout.write(`HTTP ${response.status} ${response.statusText}\n`);
  if (responseText) {
    try {
      process.stdout.write(`${JSON.stringify(JSON.parse(responseText), null, 2)}\n`);
    } catch {
      process.stdout.write(`${responseText}\n`);
    }
  }
  if (!response.ok) process.exitCode = 1;
}

/** 收集由 Keychain 命令通过管道输出的凭证；不回显输入内容。 */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "API request failed"}\n`);
  process.exitCode = 2;
});
