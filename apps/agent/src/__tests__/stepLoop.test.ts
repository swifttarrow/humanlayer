import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks so they're available before module imports
const mockCreate = vi.hoisted(() => vi.fn());
const mockHeartbeat = vi.hoisted(() => vi.fn());
const mockIngestEvents = vi.hoisted(() => vi.fn());
const mockRunFileRead = vi.hoisted(() => vi.fn());
const mockRunShell = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
  },
}));

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
import type Anthropic from "@anthropic-ai/sdk";

function makeTextResponse(text: string): Anthropic.Message {
  return {
    id: "msg-1",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text, citations: [] }] as Anthropic.ContentBlock[],
    model: "claude-haiku-4-5-20251001",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 } as Anthropic.Usage,
  };
}

function makeToolUseResponse(toolName: string, input: Record<string, string>): Anthropic.Message {
  return {
    id: "msg-2",
    type: "message",
    role: "assistant",
    content: [{ type: "tool_use", id: "tu-1", name: toolName, input }] as Anthropic.ContentBlock[],
    model: "claude-haiku-4-5-20251001",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 } as Anthropic.Usage,
  };
}

const baseOpts = { sessionId: "sess-1", attemptId: "att-1", agentId: "agent-1", goal: "test" };

describe("runStepLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeartbeat.mockResolvedValue({ leaseExpiresAt: new Date().toISOString(), stopRequested: false });
    mockIngestEvents.mockResolvedValue({ accepted: 1, duplicates: 0 });
  });

  it("completes when Claude returns end_turn with no tools", async () => {
    mockCreate.mockResolvedValue(makeTextResponse("Task complete."));
    const result = await runStepLoop(baseOpts);
    expect(result.outcome).toBe("completed");
    expect(mockIngestEvents).toHaveBeenCalled();
  });

  it("emits session.stopped when stop is requested on first heartbeat", async () => {
    mockHeartbeat.mockResolvedValue({ leaseExpiresAt: new Date().toISOString(), stopRequested: true });
    const result = await runStepLoop(baseOpts);
    expect(result.outcome).toBe("stopped");
  });

  it("returns failed outcome when Claude API throws", async () => {
    mockCreate.mockRejectedValue(new Error("API timeout"));
    const result = await runStepLoop(baseOpts);
    expect(result.outcome).toBe("failed");
    expect(result.error).toContain("API timeout");
  });

  it("executes read_file tool and continues to completion", async () => {
    mockRunFileRead.mockResolvedValue("file contents here");
    mockCreate
      .mockResolvedValueOnce(makeToolUseResponse("read_file", { path: "/tmp/test.txt" }))
      .mockResolvedValueOnce(makeTextResponse("Done."));
    const result = await runStepLoop(baseOpts);
    expect(result.outcome).toBe("completed");
    expect(mockRunFileRead).toHaveBeenCalledWith("/tmp/test.txt");
  });
});
