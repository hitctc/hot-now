import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server/createServer.js";

describe("createServer", () => {
  it("returns a health response", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it.runIf(existsSync("dist/main.js"))("starts the built entry point", async () => {
    const entryUrl = new URL("../../dist/main.js", import.meta.url).href;
    const child = spawn(process.execPath, [
      "--eval",
      `import(${JSON.stringify(entryUrl)}); setTimeout(() => process.exit(0), 250);`
    ], {
      env: {
        ...process.env,
        PORT: "3011"
      }
    });

    const [code] = (await once(child, "exit")) as [number | null];

    expect(code).toBe(0);
  });
});
