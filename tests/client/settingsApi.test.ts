import { beforeEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();

vi.mock("../../src/client/services/http", () => ({
  requestJson
}));

describe("settingsApi", () => {
  beforeEach(() => {
    requestJson.mockReset();
    window.localStorage.clear();
  });

  it("reads the sources workbench without reusing the content-page source filter", async () => {
    const { writeStoredContentSourceKinds } = await import("../../src/client/services/contentApi");
    const { readSettingsSources } = await import("../../src/client/services/settingsApi");

    writeStoredContentSourceKinds([" openai ", "juya", "openai"]);
    requestJson.mockResolvedValue({
      sources: [],
      operations: {
        lastCollectionRunAt: null,
        lastSendLatestEmailAt: null,
        canTriggerManualCollect: true,
        canTriggerManualSendLatestEmail: true,
        isRunning: false
      }
    });

    await readSettingsSources();

    expect(requestJson).toHaveBeenCalledWith("/api/settings/sources");
  });
});
