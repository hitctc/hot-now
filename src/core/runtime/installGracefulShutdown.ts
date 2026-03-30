type ShutdownLogger = {
  info?: (context: Record<string, unknown>, message: string) => void;
  error?: (context: Record<string, unknown>, message: string) => void;
};

type ShutdownProcess = {
  once: (event: NodeJS.Signals, listener: () => void) => unknown;
};

type ScheduledTaskLike = {
  stop: () => void;
} | null;

type InstallGracefulShutdownInput = {
  process: ShutdownProcess;
  exit: (code: number) => void;
  logger?: ShutdownLogger;
  scheduledTasks: ScheduledTaskLike[];
  waitForIdle: () => Promise<void>;
  closeServer: () => Promise<void>;
  checkpointDatabase: () => void;
  closeDatabase: () => void;
  signals?: NodeJS.Signals[];
};

const defaultSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

export function installGracefulShutdown(input: InstallGracefulShutdownInput) {
  let shuttingDown = false;

  // Every registered signal shares one guarded shutdown path so repeated signals do not double-close resources.
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    let exitCode = 0;

    input.logger?.info?.({ signal }, "Received shutdown signal, draining HotNow before exit.");

    for (const task of input.scheduledTasks) {
      task?.stop();
    }

    try {
      await input.waitForIdle();
    } catch (error) {
      exitCode = 1;
      input.logger?.error?.({ signal, error }, "Failed while waiting for in-flight work to finish.");
    }

    try {
      await input.closeServer();
    } catch (error) {
      exitCode = 1;
      input.logger?.error?.({ signal, error }, "Failed to close the HTTP server cleanly.");
    }

    try {
      input.checkpointDatabase();
    } catch (error) {
      exitCode = 1;
      input.logger?.error?.({ signal, error }, "Failed to checkpoint the SQLite WAL before exit.");
    }

    try {
      input.closeDatabase();
    } catch (error) {
      exitCode = 1;
      input.logger?.error?.({ signal, error }, "Failed to close the SQLite connection cleanly.");
    }

    input.exit(exitCode);
  };

  for (const signal of input.signals ?? defaultSignals) {
    input.process.once(signal, () => {
      void shutdown(signal);
    });
  }
}
