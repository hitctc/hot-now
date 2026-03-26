import { spawn } from "node:child_process";
import { once } from "node:events";
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

function extractListeningPort(output: string) {
  const matches = [...output.matchAll(/Server listening at http:\/\/127\.0\.0\.1:(\d+)/g)];
  const lastMatch = matches.at(-1);

  if (!lastMatch) {
    return null;
  }

  return Number(lastMatch[1]);
}

async function waitForListeningPort(child: ReturnType<typeof spawn>) {
  const chunks: string[] = [];

  const onData = (chunk: Buffer) => {
    chunks.push(chunk.toString("utf8"));
  };

  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  return await new Promise<number>((resolve, reject) => {
    const finish = (callback: () => void) => {
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
      child.off("exit", onExit);
      child.off("error", onError);
      callback();
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(() => {
        reject(
          new Error(
            `Built entry point exited before reporting a listening port (code: ${code}, signal: ${signal ?? "none"})`
          )
        );
      });
    };

    const onError = (error: Error) => {
      finish(() => reject(error));
    };

    const onListeningPort = () => {
      const port = extractListeningPort(chunks.join(""));

      if (typeof port !== "number" || !Number.isFinite(port)) {
        return;
      }

      finish(() => resolve(port));
    };

    child.on("exit", onExit);
    child.on("error", onError);
    child.stdout?.on("data", onListeningPort);
    child.stderr?.on("data", onListeningPort);
  });
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
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/main.js", import.meta.url))], {
      env: {
        ...process.env,
        PORT: "0"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const childExit = once(child, "exit");
    const childError = once(child, "error").then(([error]) => {
      throw error;
    });
    const childFailedBeforePort = childExit.then(([code, signal]) => {
      throw new Error(
        `Built entry point exited before reporting a listening port (code: ${code}, signal: ${signal ?? "none"})`
      );
    });

    let port = 0;

    try {
      port = await Promise.race([waitForListeningPort(child), childError, childFailedBeforePort]);

      await Promise.race([waitForHealth(port), childError, childFailedBeforePort]);

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
