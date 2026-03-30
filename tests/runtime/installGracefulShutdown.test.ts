import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { installGracefulShutdown } from "../../src/core/runtime/installGracefulShutdown.js";

type FakeSignalProcess = EventEmitter & {
  once: (event: NodeJS.Signals, listener: () => void) => FakeSignalProcess;
};

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("installGracefulShutdown", () => {
  it("stops schedulers, waits for in-flight work, and closes resources in order", async () => {
    const signalProcess = new EventEmitter() as FakeSignalProcess;
    const steps: string[] = [];
    const exit = vi.fn();
    let releaseIdle!: () => void;

    installGracefulShutdown({
      process: signalProcess,
      exit,
      logger: {
        info: vi.fn(),
        error: vi.fn()
      },
      scheduledTasks: [
        {
          stop: vi.fn(() => {
            steps.push("stop:collection");
          })
        },
        {
          stop: vi.fn(() => {
            steps.push("stop:mail");
          })
        }
      ],
      waitForIdle: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            steps.push("wait:start");
            releaseIdle = () => {
              steps.push("wait:done");
              resolve();
            };
          })
      ),
      closeServer: vi.fn(async () => {
        steps.push("server:close");
      }),
      checkpointDatabase: vi.fn(() => {
        steps.push("db:checkpoint");
      }),
      closeDatabase: vi.fn(() => {
        steps.push("db:close");
      })
    });

    signalProcess.emit("SIGTERM");
    await flushMicrotasks();

    expect(steps).toEqual(["stop:collection", "stop:mail", "wait:start"]);
    expect(exit).not.toHaveBeenCalled();

    releaseIdle();
    await flushMicrotasks();

    expect(steps).toEqual([
      "stop:collection",
      "stop:mail",
      "wait:start",
      "wait:done",
      "server:close",
      "db:checkpoint",
      "db:close"
    ]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("runs shutdown only once even if multiple signals arrive", async () => {
    const signalProcess = new EventEmitter() as FakeSignalProcess;
    const closeServer = vi.fn(async () => undefined);
    const closeDatabase = vi.fn(() => undefined);
    const exit = vi.fn();

    installGracefulShutdown({
      process: signalProcess,
      exit,
      logger: {
        info: vi.fn(),
        error: vi.fn()
      },
      scheduledTasks: [],
      waitForIdle: vi.fn(async () => undefined),
      closeServer,
      checkpointDatabase: vi.fn(() => undefined),
      closeDatabase
    });

    signalProcess.emit("SIGTERM");
    signalProcess.emit("SIGINT");
    await flushMicrotasks();

    expect(closeServer).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
