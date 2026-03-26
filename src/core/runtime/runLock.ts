// This lock keeps the digest pipeline single-flight inside one process.
export function createRunLock() {
  let running = false;

  return {
    isRunning() {
      return running;
    },
    async runExclusive<T>(task: () => Promise<T>) {
      if (running) {
        throw new Error("A digest run is already in progress");
      }

      running = true;
      try {
        return await task();
      } finally {
        running = false;
      }
    }
  };
}
