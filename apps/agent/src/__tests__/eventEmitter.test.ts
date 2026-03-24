import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIngestEvents = vi.hoisted(() => vi.fn());

vi.mock("../api.js", () => ({
  ingestEvents: mockIngestEvents,
}));

import { EventEmitter } from "../runner/eventEmitter.js";

describe("EventEmitter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIngestEvents.mockResolvedValue({ accepted: 0, duplicates: 0 });
  });

  it("chunks flush payloads to server ingest limit", async () => {
    const emitter = new EventEmitter({ sessionId: "sess-1", attemptId: "att-1" });
    for (let i = 1; i <= 205; i++) {
      emitter.emit("thinking.token", { token: `t${i}`, tokenIndex: i, stepNumber: 1 });
    }

    await emitter.flush();

    expect(mockIngestEvents).toHaveBeenCalledTimes(3);
    expect(mockIngestEvents.mock.calls[0]?.[2]).toHaveLength(100);
    expect(mockIngestEvents.mock.calls[1]?.[2]).toHaveLength(100);
    expect(mockIngestEvents.mock.calls[2]?.[2]).toHaveLength(5);
  });

  it("keeps unsent events buffered when a chunk fails", async () => {
    const emitter = new EventEmitter({ sessionId: "sess-2", attemptId: "att-2" });
    for (let i = 1; i <= 205; i++) {
      emitter.emit("thinking.token", { token: `t${i}`, tokenIndex: i, stepNumber: 1 });
    }

    mockIngestEvents
      .mockResolvedValueOnce({ accepted: 100, duplicates: 0 })
      .mockRejectedValueOnce(new Error("transient ingest failure"))
      .mockResolvedValue({ accepted: 0, duplicates: 0 });

    await expect(emitter.flush()).rejects.toThrow("transient ingest failure");
    await emitter.flush();

    expect(mockIngestEvents).toHaveBeenCalledTimes(4);
    expect(mockIngestEvents.mock.calls[2]?.[2]).toHaveLength(100);
    expect(mockIngestEvents.mock.calls[3]?.[2]).toHaveLength(5);
  });
});
