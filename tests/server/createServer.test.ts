import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/createServer.js";

async function runCommand(command: string, args: string[]) {
  const child = spawn(command, args, {
    env: process.env,
    stdio: "inherit"
  });

  const outcome = Promise.race([
    once(child, "error").then(([error]) => {
      throw error;
    }),
    once(child, "exit").then(([code]) => {
      if (code !== 0) {
        throw new Error(`${command} ${args.join(" ")} exited with code ${code}`);
      }
    })
  ]);

  await outcome;
}

async function getFreePort() {
  const server = createNetServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  if (typeof port !== "number") {
    throw new Error("Failed to reserve a free port for the smoke check");
  }

  return port;
}

async function waitForHealth(port: number) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // The server may still be starting up; keep polling until it responds.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for /health from the built entry point");
}

describe("createServer", () => {
  beforeAll(async () => {
    // Build first so the smoke check always exercises the emitted entry point.
    await runCommand("npm", ["run", "build"]);
  });

  it("returns a health response", async () => {
    const app = createServer();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("starts the built entry point and returns health", async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/main.js", import.meta.url))], {
      env: {
        ...process.env,
        PORT: String(port)
      },
      stdio: "inherit"
    });
    const childExit = once(child, "exit");
    const childError = once(child, "error").then(([error]) => {
      throw error;
    });
    const childFailedBeforeHealth = childExit.then(([code, signal]) => {
      throw new Error(
        `Built entry point exited before /health became ready (code: ${code}, signal: ${signal ?? "none"})`
      );
    });

    try {
      await Promise.race([waitForHealth(port), childError, childFailedBeforeHealth]);

      const response = await fetch(`http://127.0.0.1:${port}/health`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await childExit;
      }
    }
  });
});
