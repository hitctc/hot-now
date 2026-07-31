import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestJson } = vi.hoisted(() => ({
  requestJson: vi.fn()
}));

vi.mock("../../src/client/services/http", () => ({
  requestJson
}));

import {
  fetchWriteQueueStatus,
  readCreativeFinishedArticles,
  readCreativeSourceItems
} from "../../src/client/services/creativeApi";

beforeEach(() => {
  requestJson.mockReset();
});

describe("creativeApi list requests", () => {
  it("requests lightweight summaries with the selected page size", async () => {
    requestJson.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 30 });

    await readCreativeSourceItems({ page: 1, pageSize: 30, direction: "article" });
    await readCreativeFinishedArticles({ page: 1, pageSize: 30, direction: "article" });

    expect(requestJson).toHaveBeenNthCalledWith(
      1,
      "/api/creative/source-items?view=summary&page=1&pageSize=30&direction=article"
    );
    expect(requestJson).toHaveBeenNthCalledWith(
      2,
      "/api/creative/finished-articles?view=summary&page=1&pageSize=30&direction=article"
    );
  });
});

describe("creativeApi write queue status", () => {
  it("shares an in-flight request across simultaneous consumers", async () => {
    let resolveRequest!: (value: Awaited<ReturnType<typeof fetchWriteQueueStatus>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof fetchWriteQueueStatus>>>((resolve) => {
      resolveRequest = resolve;
    });
    requestJson.mockReturnValue(pending);

    const first = fetchWriteQueueStatus();
    const second = fetchWriteQueueStatus();
    expect(requestJson).toHaveBeenCalledTimes(1);

    resolveRequest({
      current: null,
      queue: [],
      queue_length: 0,
      stats: { total_submitted: 0, total_completed: 0, total_failed: 0 }
    });
    await expect(first).resolves.toMatchObject({ current: null, queue_length: 0 });
    await expect(second).resolves.toMatchObject({ current: null, queue_length: 0 });
  });
});
