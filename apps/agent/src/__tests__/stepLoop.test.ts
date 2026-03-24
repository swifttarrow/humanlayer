import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, rm, symlink } from "fs/promises";
import path from "path";
import os from "os";

// Hoist mocks so they're available before module imports
const mockHeartbeat = vi.hoisted(() => vi.fn());
const mockIngestEvents = vi.hoisted(() => vi.fn());
const mockRunFileRead = vi.hoisted(() => vi.fn());
const mockRunShell = vi.hoisted(() => vi.fn());
const mockRunPatch = vi.hoisted(() => vi.fn());

vi.mock("../api.js", () => ({
  heartbeat: mockHeartbeat,
  ingestEvents: mockIngestEvents,
}));

vi.mock("../tools/fileTools.js", () => ({
  runFileSearch: vi.fn().mockResolvedValue("file.ts"),
  runFileRead: mockRunFileRead,
}));

vi.mock("../tools/patchTool.js", () => ({
  runPatch: mockRunPatch,
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

import type { WorkingDirectoryPolicy } from "@humanlayer/shared";

const baseOpts = { sessionId: "sess-1", attemptId: "att-1", agentId: "agent-1", goal: "test" };

const testPolicy: WorkingDirectoryPolicy = {
  inputPath: "/tmp/project",
  resolvedPath: "/tmp/project",
  runtimeMode: "local",
  exposedSurfaces: [],
};

describe("runStepLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    mockHeartbeat.mockResolvedValue({ leaseExpiresAt: new Date().toISOString(), stopRequested: false });
    mockIngestEvents.mockResolvedValue({ accepted: 1, duplicates: 0 });
    mockRunPatch.mockResolvedValue("Patched successfully.");
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

  it("denies read_file outside policy boundaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeToolUseResponse("read_file", { path: "/etc/passwd" })),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeTextResponse("Done.")),
        })
    );
    const result = await runStepLoop({ ...baseOpts, workdirPolicy: testPolicy });
    expect(result.outcome).toBe("completed");
    // The tool call should have been caught and reported as an error
    expect(mockRunFileRead).not.toHaveBeenCalled();
  });

  it("denies shell execution with cwd outside policy boundaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeToolUseResponse("run_shell", { command: "ls", cwd: "/etc" })),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeTextResponse("Done.")),
        })
    );
    const result = await runStepLoop({ ...baseOpts, workdirPolicy: testPolicy });
    expect(result.outcome).toBe("completed");
    expect(mockRunShell).not.toHaveBeenCalled();
  });

  it("allows read_file inside policy boundaries", async () => {
    mockRunFileRead.mockResolvedValue("file contents");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeToolUseResponse("read_file", { path: "/tmp/project/src/main.ts" })),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeTextResponse("Done.")),
        })
    );
    const result = await runStepLoop({ ...baseOpts, workdirPolicy: testPolicy });
    expect(result.outcome).toBe("completed");
    expect(mockRunFileRead).toHaveBeenCalledWith("/tmp/project/src/main.ts");
  });

  it("denies apply_patch when path escapes writable root via symlinked parent", async () => {
    const rootTmp = await mkdtemp(path.join(os.tmpdir(), "step-loop-policy-"));
    const projectDir = path.join(rootTmp, "project");
    const outsideDir = path.join(rootTmp, "outside");
    const escapeLink = path.join(projectDir, "escape");

    await mkdir(projectDir);
    await mkdir(outsideDir);
    await symlink(outsideDir, escapeLink);

    const policy: WorkingDirectoryPolicy = {
      inputPath: projectDir,
      resolvedPath: projectDir,
      runtimeMode: "local",
      exposedSurfaces: [],
    };

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(
              makeToolUseResponse("apply_patch", {
                path: path.join(escapeLink, "new.txt"),
                patch: "@@ -1,1 +1,1 @@\n-old\n+new",
              })
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeTextResponse("Done.")),
        })
    );

    try {
      const result = await runStepLoop({ ...baseOpts, workdirPolicy: policy });
      expect(result.outcome).toBe("completed");
      expect(mockRunPatch).not.toHaveBeenCalled();
    } finally {
      await rm(rootTmp, { recursive: true, force: true });
    }
  });
});
