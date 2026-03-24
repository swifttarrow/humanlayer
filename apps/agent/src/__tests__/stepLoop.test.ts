import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, rm, symlink } from "fs/promises";
import path from "path";
import os from "os";

// Hoist mocks so they're available before module imports
const mockHeartbeat = vi.hoisted(() => vi.fn());
const mockIngestEvents = vi.hoisted(() => vi.fn());
const mockListSessionEvents = vi.hoisted(() => vi.fn());
const mockRunFileSearch = vi.hoisted(() => vi.fn());
const mockRunFileRead = vi.hoisted(() => vi.fn());
const mockRunShell = vi.hoisted(() => vi.fn());
const mockRunPatch = vi.hoisted(() => vi.fn());

vi.mock("../api.js", () => ({
  heartbeat: mockHeartbeat,
  ingestEvents: mockIngestEvents,
  listSessionEvents: mockListSessionEvents,
}));

vi.mock("../tools/fileTools.js", () => ({
  runFileSearch: mockRunFileSearch,
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
    vi.stubEnv("OPENAI_RETRY_BASE_MS", "0");
    vi.stubEnv("OPENAI_RETRY_MAX_MS", "0");
    vi.stubEnv("OPENAI_MAX_RETRIES", "3");
    mockHeartbeat.mockResolvedValue({ leaseExpiresAt: new Date().toISOString(), stopRequested: false });
    mockIngestEvents.mockResolvedValue({ accepted: 1, duplicates: 0 });
    mockListSessionEvents.mockResolvedValue({ events: [] });
    mockRunFileSearch.mockResolvedValue("file.ts");
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

  it("continues step numbers across follow-up runs in the same session", async () => {
    const firstAttempt = { ...baseOpts, sessionId: "sess-followup", attemptId: "att-1a" };
    const secondAttempt = { ...baseOpts, sessionId: "sess-followup", attemptId: "att-1b" };

    const firstResult = await runStepLoop(firstAttempt);
    const secondResult = await runStepLoop(secondAttempt);

    expect(firstResult.outcome).toBe("completed");
    expect(secondResult.outcome).toBe("completed");

    const stepStartedEvents = mockIngestEvents.mock.calls
      .flatMap((call) => call[2] as Array<{ eventType: string; payload: Record<string, unknown> }>)
      .filter((event) => event.eventType === "step.started")
      .map((event) => event.payload.stepNumber);

    expect(stepStartedEvents).toEqual(expect.arrayContaining([1, 2]));
  });

  it("hydrates step number from persisted events when memory cache is empty", async () => {
    mockListSessionEvents.mockResolvedValue({
      events: [
        {
          id: "evt-1",
          sessionId: "sess-restart",
          attemptId: "att-prev",
          sequenceNumber: 1,
          eventType: "session.started",
          eventTime: new Date().toISOString(),
          actorType: "agent",
          payload: {},
          isTerminal: false,
          visibility: "user_visible",
          schemaVersion: "1.0",
        },
        {
          id: "evt-2",
          sessionId: "sess-restart",
          attemptId: "att-prev",
          sequenceNumber: 2,
          eventType: "step.started",
          eventTime: new Date().toISOString(),
          actorType: "agent",
          payload: { stepNumber: 5 },
          isTerminal: false,
          visibility: "user_visible",
          schemaVersion: "1.0",
        },
      ],
    });

    const result = await runStepLoop({ ...baseOpts, sessionId: "sess-restart", attemptId: "att-new" });
    expect(result.outcome).toBe("completed");

    const stepStartedEvents = mockIngestEvents.mock.calls
      .flatMap((call) => call[2] as Array<{ eventType: string; payload: Record<string, unknown> }>)
      .filter((event) => event.eventType === "step.started")
      .map((event) => event.payload.stepNumber);

    expect(stepStartedEvents).toContain(6);
    expect(mockListSessionEvents).toHaveBeenCalledWith("sess-restart");
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

  it("retries on 429 and succeeds on a later attempt", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers(),
          text: async () => "rate limited",
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeTextResponse("Recovered.")),
        })
    );
    const result = await runStepLoop(baseOpts);
    expect(result.outcome).toBe("completed");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400 errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        text: async () => "invalid request",
      })
    );
    const result = await runStepLoop(baseOpts);
    expect(result.outcome).toBe("failed");
    expect(fetch).toHaveBeenCalledTimes(1);
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
    expect(mockRunFileRead).toHaveBeenCalledWith("/tmp/test.txt", undefined);
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
    expect(mockRunFileRead).toHaveBeenCalledWith("/tmp/project/src/main.ts", "/tmp/project");
  });

  it("resolves relative read_file paths against policy workdir", async () => {
    mockRunFileRead.mockResolvedValue("file contents");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeToolUseResponse("read_file", { path: "src/main.ts" })),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeTextResponse("Done.")),
        })
    );
    const result = await runStepLoop({ ...baseOpts, workdirPolicy: testPolicy });
    expect(result.outcome).toBe("completed");
    expect(mockRunFileRead).toHaveBeenCalledWith("src/main.ts", "/tmp/project");
  });

  it("resolves relative search_files paths against policy workdir", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(
              makeToolUseResponse("search_files", {
                pattern: "SessionDetail",
                type: "content",
                path: "apps/ui",
              })
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeTextResponse("Done.")),
        })
    );

    const result = await runStepLoop({ ...baseOpts, workdirPolicy: testPolicy });
    expect(result.outcome).toBe("completed");
    expect(mockRunFileSearch).toHaveBeenCalledWith(
      "SessionDetail",
      "content",
      "/tmp/project/apps/ui"
    );
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

  it("resolves relative apply_patch paths against policy workdir", async () => {
    mockRunPatch.mockResolvedValue("Patched successfully.");
    const rootTmp = await mkdtemp(path.join(os.tmpdir(), "step-loop-policy-"));
    const projectDir = path.join(rootTmp, "project");
    await mkdir(projectDir);
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
                path: "src/main.ts",
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
      expect(mockRunPatch).toHaveBeenCalledWith(
        path.join(projectDir, "src/main.ts"),
        "@@ -1,1 +1,1 @@\n-old\n+new"
      );
    } finally {
      await rm(rootTmp, { recursive: true, force: true });
    }
  });
});
