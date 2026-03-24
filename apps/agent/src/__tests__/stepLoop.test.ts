import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks so they're available before module imports
const mockHeartbeat = vi.hoisted(() => vi.fn());
const mockIngestEvents = vi.hoisted(() => vi.fn());
const mockRunFileRead = vi.hoisted(() => vi.fn());
const mockRunShell = vi.hoisted(() => vi.fn());

vi.mock("../api.js", () => ({
  heartbeat: mockHeartbeat,
  ingestEvents: mockIngestEvents,
}));

vi.mock("../tools/fileTools.js", () => ({
  runFileSearch: vi.fn().mockResolvedValue("file.ts"),
  runFileRead: mockRunFileRead,
}));

vi.mock("../tools/patchTool.js", () => ({
  runPatch: vi.fn().mockResolvedValue("Patched successfully."),
}));

vi.mock("../tools/shellTool.js", () => ({
  runShell: mockRunShell,
}));

import { runStepLoop } from "../runner/stepLoop.js";

function makeTextResponse(text: string) {
  return {
    choices: [
      {
        message: {
          content: text,
        },
      },
    ],
  };
}

function makeToolUseResponse(toolName: string, input: Record<string, unknown>) {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: "tool-1",
              type: "function",
              function: {
                name: toolName,
                arguments: JSON.stringify(input),
              },
            },
          ],
        },
      },
    ],
  };
}

const baseOpts = { sessionId: "sess-1", attemptId: "att-1", agentId: "agent-1", goal: "test" };

describe("runStepLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    mockHeartbeat.mockResolvedValue({ leaseExpiresAt: new Date().toISOString(), stopRequested: false });
    mockIngestEvents.mockResolvedValue({ accepted: 1, duplicates: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(makeTextResponse("Task complete.")),
      })
    );
  });

  it("completes when OpenAI returns text with no tools", async () => {
    const result = await runStepLoop(baseOpts);
    expect(result.outcome).toBe("completed");
    expect(mockIngestEvents).toHaveBeenCalled();
  });

  it("emits session.stopped when stop is requested on first heartbeat", async () => {
    mockHeartbeat.mockResolvedValue({ leaseExpiresAt: new Date().toISOString(), stopRequested: true });
    const result = await runStepLoop(baseOpts);
    expect(result.outcome).toBe("stopped");
  });

  it("returns failed outcome when OpenAI API call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "upstream timeout",
      })
    );
    const result = await runStepLoop(baseOpts);
    expect(result.outcome).toBe("failed");
    expect(result.error).toContain("OpenAI chat.completions failed");
  });

  it("executes read_file tool and continues to completion", async () => {
    mockRunFileRead.mockResolvedValue("file contents here");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeToolUseResponse("read_file", { path: "/tmp/test.txt" })),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeTextResponse("Done.")),
        })
    );
    const result = await runStepLoop(baseOpts);
    expect(result.outcome).toBe("completed");
    expect(mockRunFileRead).toHaveBeenCalledWith("/tmp/test.txt");
  });
});
