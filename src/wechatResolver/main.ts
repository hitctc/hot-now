import { createWechatResolverServer } from "./createWechatResolverServer.js";

const fallbackBaseUrl = "http://127.0.0.1:4040";
const fallbackToken = "hot-now-dev-resolver-token";

async function main() {
  const resolverBaseUrl = process.env.WECHAT_RESOLVER_BASE_URL?.trim() || fallbackBaseUrl;
  const resolverToken = process.env.WECHAT_RESOLVER_TOKEN?.trim() || fallbackToken;
  const listenUrl = new URL(resolverBaseUrl);
  const host = listenUrl.hostname === "localhost" ? "127.0.0.1" : listenUrl.hostname;
  const port = Number(
    listenUrl.port || (listenUrl.protocol === "https:" ? "443" : "80")
  );

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid WECHAT_RESOLVER_BASE_URL port: ${resolverBaseUrl}`);
  }

  // The sidecar keeps one dedicated token boundary even in local mode, so HotNow and the resolver
  // can later move apart without changing the contract.
  const app = createWechatResolverServer({
    authToken: resolverToken
  });

  await app.listen({
    host,
    port
  });
}

void main();
