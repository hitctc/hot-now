import { readFileSync } from "node:fs";
import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";

export async function readClientEntryHtml(
  clientIndexPath: string,
  options: {
    clientDevOrigin: string | null;
    readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined;
  }
): Promise<string> {
  const devClientEntryHtml = await tryReadClientDevEntryHtml(options.clientDevOrigin, options.readClientDevEntryHtml);

  if (devClientEntryHtml) {
    return devClientEntryHtml;
  }

  // Unified shell routes prefer the built client entry, but still need a readable fallback when the frontend bundle is absent.
  try {
    return readFileSync(clientIndexPath, "utf8");
  } catch {
    // Missing frontend assets should fail loudly with a readable hint instead of referencing fake bundle names.
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HotNow 客户端资源未准备好</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: #eef3ff;
        background: #111722;
      }
      main {
        max-width: 560px;
        padding: 24px 28px;
        border: 1px solid rgba(126, 162, 255, 0.28);
        border-radius: 18px;
        background: rgba(23, 31, 44, 0.92);
        box-shadow: 0 24px 48px rgba(3, 8, 18, 0.48);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0;
        line-height: 1.7;
        color: #c4cedf;
      }
      code {
        font-family: "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
        color: #7ea2ff;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>客户端资源未准备好</h1>
      <p>请先运行 <code>npm run build:client</code>，或者重新执行 <code>npm run dev</code> / <code>npm run dev:local</code> 后再刷新。</p>
    </main>
  </body>
</html>
`;
  }
}

// 本地开发时允许 3030 页面直接借用 Vite dev server 的 HTML，这样入口路径不变也能拿到 HMR 和 Vue DevTools。
export async function tryReadClientDevEntryHtml(
  clientDevOrigin: string | null,
  readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined
): Promise<string | null> {
  if (!clientDevOrigin) {
    return null;
  }

  const rawClientDevEntryHtml = readClientDevEntryHtml
    ? await readClientDevEntryHtml()
    : await fetchClientDevEntryHtml(clientDevOrigin);

  if (!rawClientDevEntryHtml?.trim()) {
    return null;
  }

  return rewriteClientDevEntryHtml(rawClientDevEntryHtml, clientDevOrigin);
}

// 这里只探测 Vite dev server 的根 HTML；失败时会自动回退到 dist/client，不把开发辅助能力变成硬依赖。
export async function fetchClientDevEntryHtml(clientDevOrigin: string): Promise<string | null> {
  try {
    const response = await fetch(`${clientDevOrigin}/client/`, {
      headers: {
        Accept: "text/html"
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

// 开发态 HTML 会继续挂在 3030 域名下，所以这里把 /client/... 资源改写成当前 clientDevOrigin 绝对地址，避免还去命中构建产物。
export function rewriteClientDevEntryHtml(clientEntryHtml: string, clientDevOrigin: string): string {
  const normalizedClientDevAssetBase = `${clientDevOrigin}/client/`;

  return clientEntryHtml
    .replaceAll('="/client/brand/', '="/brand/')
    .replaceAll("='/client/brand/", "='/brand/")
    .replaceAll('="/client/', `="${normalizedClientDevAssetBase}`)
    .replaceAll("='/client/", `='${normalizedClientDevAssetBase}`);
}

// 开发态入口只接受 origin 级配置，尾部斜杠统一在这里收掉，后面拼接 /client/ 时就不会重复。
export function normalizeClientDevOrigin(clientDevOrigin: string | null): string | null {
  const normalizedClientDevOrigin = clientDevOrigin?.trim().replace(/\/+$/, "") ?? "";

  return normalizedClientDevOrigin ? normalizedClientDevOrigin : null;
}

export function isClientSettingsPath(pathname: string) {
  // Settings routes still need a dedicated branch because legacy pages remain server-rendered.
  return pathname.startsWith("/settings/");
}

export async function serveClientSettingsShell(
  reply: FastifyReply,
  clientIndexPath: string,
  options: {
    clientDevOrigin: string | null;
    readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined;
  }
) {
  // System pages should always render the latest available client entry.
  return reply.type("text/html; charset=utf-8").send(await readClientEntryHtml(clientIndexPath, options));
}

export async function serveClientContentShell(
  reply: FastifyReply,
  clientIndexPath: string,
  options: {
    clientDevOrigin: string | null;
    readClientDevEntryHtml?: (() => Promise<string | null> | string | null) | undefined;
  }
) {
  // Content routes use the same live client entry and recover as soon as a client build exists.
  return reply.type("text/html; charset=utf-8").send(await readClientEntryHtml(clientIndexPath, options));
}

export function resolveBrandCacheControl(request: FastifyRequest): string {
  // 页面引用使用版本参数，可安全长期缓存；未版本化直链保留短缓存，避免未来品牌更新长期滞后。
  const requestUrl = new URL(request.raw.url ?? request.url, "http://hot-now.local");

  return requestUrl.searchParams.has("v")
    ? "public, max-age=31536000, immutable"
    : "public, max-age=86400";
}

export function normalizeClientAssetPath(rawAssetPath: string): string | null {
  // Static asset requests are normalized once so path traversal checks can operate on a clean relative path.
  const trimmedPath = rawAssetPath.trim().replace(/\\/g, "/");

  if (!trimmedPath) {
    return null;
  }

  const normalizedPath = path.posix.normalize(trimmedPath).replace(/^\/+/, "");

  if (!normalizedPath || normalizedPath === "." || normalizedPath.startsWith("..")) {
    return null;
  }

  return normalizedPath;
}

export function resolveClientAssetMimeType(extension: string): string {
  // The client bundle only exposes CSS and JS in this phase, so a two-branch mime map is enough.
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }

  return "application/javascript; charset=utf-8";
}

export function readSiteCss() {
  // CSS is loaded from the source tree so both tsx dev and built runtime can serve one shared stylesheet.
  try {
    return readFileSync(new URL("./public/site.css", import.meta.url), "utf8");
  } catch {
    try {
      return readFileSync(path.resolve(process.cwd(), "src/server/public/site.css"), "utf8");
    } catch {
      return "body{font-family:sans-serif;background:#f8fafc;color:#0f172a;}";
    }
  }
}

export function readSiteJs() {
  // legacy 脚本按固定顺序拼装，浏览器仍只请求一个 /assets/site.js，避免引入异步模块加载竞态。
  const fragmentNames = ["site.js", "site.actions.fragment.js", "site.shell.fragment.js"];

  try {
    return fragmentNames
      .map((name) => readFileSync(new URL(`./public/${name}`, import.meta.url), "utf8"))
      .join("");
  } catch {
    try {
      return fragmentNames
        .map((name) => readFileSync(path.resolve(process.cwd(), "src/server/public", name), "utf8"))
        .join("");
    } catch {
      return "(() => {})();";
    }
  }
}
