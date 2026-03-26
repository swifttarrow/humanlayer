import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "fs/promises";
import path from "path";
import os from "os";

// Hoist mocks so they're available before module imports
const mockHeartbeat = vi.hoisted(() => vi.fn());
const mockIngestEvents = vi.hoisted(() => vi.fn());
const mockListSessionEvents = vi.hoisted(() => vi.fn());
const mockRunFileSearch = vi.hoisted(() => vi.fn());
const mockRunFileRead = vi.hoisted(() => vi.fn());
const mockRunFileReadRange = vi.hoisted(() => vi.fn());
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
  runFileReadRange: mockRunFileReadRange,
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
};

describe("runStepLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("MAX_STEPS", "20");
    vi.stubEnv("EXPLORATION_MAX_STEPS", "8");
    vi.stubEnv("EXPLORATION_MAX_READS", "10");
    vi.stubEnv("EXPLORATION_MAX_SEARCHES", "8");
    vi.stubEnv("OPENAI_RETRY_BASE_MS", "0");
    vi.stubEnv("OPENAI_RETRY_MAX_MS", "0");
    vi.stubEnv("OPENAI_MAX_RETRIES", "3");
    mockHeartbeat.mockResolvedValue({ leaseExpiresAt: new Date().toISOString(), stopRequested: false });
    mockIngestEvents.mockResolvedValue({ accepted: 1, duplicates: 0 });
    mockListSessionEvents.mockResolvedValue({ events: [] });
    mockRunFileSearch.mockResolvedValue("file.ts");
    mockRunPatch.mockResolvedValue("Patched successfully.");
    mockRunShell.mockResolvedValue("(no output)");
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

  it("starts follow-up sessions from step 1", async () => {
    const result = await runStepLoop({
      ...baseOpts,
      sessionId: "sess-followup-child",
      attemptId: "att-followup",
      parentSessionId: "sess-parent",
    });
    expect(result.outcome).toBe("completed");

    const stepStartedEvents = mockIngestEvents.mock.calls
      .flatMap((call) => call[2] as Array<{ eventType: string; payload: Record<string, unknown> }>)
      .filter((event) => event.eventType === "step.started")
      .map((event) => event.payload.stepNumber);

    expect(stepStartedEvents).toContain(1);
    expect(mockListSessionEvents).toHaveBeenCalledWith("sess-followup-child");
    expect(mockListSessionEvents).not.toHaveBeenCalledWith("sess-parent");
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

  it("fails when OpenAI request exceeds timeout", async () => {
    vi.stubEnv("OPENAI_MAX_RETRIES", "0");
    vi.stubEnv("OPENAI_REQUEST_TIMEOUT_MS", "5");

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (!signal) return;
          if (signal.aborted) {
            const abortErr = new Error("aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
            return;
          }
          signal.addEventListener(
            "abort",
            () => {
              const abortErr = new Error("aborted");
              abortErr.name = "AbortError";
              reject(abortErr);
            },
            { once: true }
          );
        })
      )
    );

    const result = await runStepLoop(baseOpts);
    expect(result.outcome).toBe("failed");
    expect(result.error).toContain("timed out");
  });

  it("fails when OpenAI stream is idle beyond timeout", async () => {
    vi.stubEnv("OPENAI_MAX_RETRIES", "0");
    vi.stubEnv("OPENAI_STREAM_IDLE_TIMEOUT_MS", "5");

    const stalledBody = new ReadableStream<Uint8Array>({
      start() {
        // Intentionally emit nothing and never close.
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: stalledBody,
        text: async () => "",
      })
    );

    const result = await runStepLoop(baseOpts);
    expect(result.outcome).toBe("failed");
    expect(result.error).toContain("stream idle timeout");
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

  it("emits blocked when exploration budget is exhausted without write", async () => {
    vi.stubEnv("EXPLORATION_MAX_STEPS", "2");
    vi.stubEnv("EXPLORATION_MAX_READS", "100");
    vi.stubEnv("EXPLORATION_MAX_SEARCHES", "100");
    mockRunFileRead.mockResolvedValue("file contents");

    // Create a mock that returns read_file tool calls repeatedly, then text
    const fetchMock = vi.fn();
    // Steps 1 and 2: read_file calls (exploration-only steps)
    for (let i = 0; i < 2; i++) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(makeToolUseResponse("read_file", { path: `/tmp/file${i}.ts` })),
      });
    }
    // Step 3 won't be reached since budget exhaustion happens after step 2
    vi.stubGlobal("fetch", fetchMock);

    const result = await runStepLoop({ ...baseOpts, sessionId: "sess-budget-exhaust" });
    expect(result.outcome).toBe("blocked");
    expect(result.blockedReason).toBe("exploration_budget_exhausted");

    // Verify session.blocked event was emitted
    const allEvents = mockIngestEvents.mock.calls
      .flatMap((call) => call[2] as Array<{ eventType: string; payload: Record<string, unknown> }>);
    const blockedEvent = allEvents.find((e) => e.eventType === "session.blocked");
    expect(blockedEvent).toBeDefined();
    expect(blockedEvent!.payload.reason).toBe("exploration_budget_exhausted");
    expect(blockedEvent!.payload.writeAttempted).toBe(false);
  });

  it("does not exhaust budget when write tools are used", async () => {
    vi.stubEnv("EXPLORATION_MAX_STEPS", "2");
    vi.stubEnv("EXPLORATION_MAX_READS", "100");
    vi.stubEnv("EXPLORATION_MAX_SEARCHES", "100");
    mockRunFileRead.mockResolvedValue("file contents");
    mockRunPatch.mockResolvedValue("Patched successfully.");

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // Step 1: read_file (exploration)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(makeToolUseResponse("read_file", { path: "/tmp/file.ts" })),
        })
        // Step 2: apply_patch (write — transitions phase, resets exploration step counting)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(
              makeToolUseResponse("apply_patch", {
                path: "/tmp/file.ts",
                patch: "@@ -1,1 +1,1 @@\n-old\n+new",
              })
            ),
        })
        // Step 3: text completion
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeTextResponse("Done.")),
        })
    );

    const result = await runStepLoop({ ...baseOpts, sessionId: "sess-budget-write" });
    expect(result.outcome).toBe("completed");
  });

  it("executes read_file_range tool and tracks as exploration read", async () => {
    mockRunFileReadRange.mockResolvedValue("10: function foo() {\n11:   return 1;\n12: }");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(
              makeToolUseResponse("read_file_range", { path: "/tmp/f.ts", start_line: 10, end_line: 12 })
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeTextResponse("Done.")),
        })
    );
    const result = await runStepLoop({ ...baseOpts, sessionId: "sess-range-read" });
    expect(result.outcome).toBe("completed");
    expect(mockRunFileReadRange).toHaveBeenCalledWith("/tmp/f.ts", 10, 12, undefined);
  });

  it("emits edit_readiness.hypothesis after 3 consecutive exploration steps", async () => {
    vi.stubEnv("EXPLORATION_MAX_STEPS", "100");
    vi.stubEnv("EXPLORATION_MAX_READS", "100");
    vi.stubEnv("EXPLORATION_MAX_SEARCHES", "100");
    mockRunFileRead.mockResolvedValue("file contents");

    const fetchMock = vi.fn();
    // 3 exploration-only steps (read_file)
    for (let i = 0; i < 3; i++) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(makeToolUseResponse("read_file", { path: `/tmp/file${i}.ts` })),
      });
    }
    // Then prose-only response (which should trigger a nudge to use tools)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(makeTextResponse("Done.")),
    });
    // Then a write and terminal prose completion
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify(
          makeToolUseResponse("apply_patch", {
            path: "/tmp/file3.ts",
            patch: "@@ -1,1 +1,1 @@\n-old\n+new",
          })
        ),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(makeTextResponse("Done after patch.")),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runStepLoop({ ...baseOpts, sessionId: "sess-hypothesis" });
    expect(result.outcome).toBe("completed");

    const allEvents = mockIngestEvents.mock.calls
      .flatMap((call) => call[2] as Array<{ eventType: string; payload: Record<string, unknown> }>);
    const hypothesisEvent = allEvents.find((e) => e.eventType === "edit_readiness.hypothesis");
    expect(hypothesisEvent).toBeDefined();
    expect(hypothesisEvent!.payload.hypothesis).toEqual(
      expect.objectContaining({
        uncertaintyCategory: expect.stringMatching(/missing_context|ambiguous_target/),
      })
    );
  });

  it("does not allow terminal prose-only completion after repeated exploration without write", async () => {
    vi.stubEnv("MAX_STEPS", "4");
    vi.stubEnv("EXPLORATION_MAX_STEPS", "100");
    vi.stubEnv("EXPLORATION_MAX_READS", "100");
    vi.stubEnv("EXPLORATION_MAX_SEARCHES", "100");
    mockRunFileRead.mockResolvedValue("file contents");

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // Step 1-3: exploration only
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeToolUseResponse("read_file", { path: "/tmp/a.ts" })),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeToolUseResponse("read_file", { path: "/tmp/b.ts" })),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeToolUseResponse("read_file", { path: "/tmp/c.ts" })),
        })
        // Step 4: prose-only response; loop should not terminal-complete
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeTextResponse("Here is a snippet you can use.")),
        })
    );

    const result = await runStepLoop({ ...baseOpts, sessionId: "sess-nowrite-no-terminal" });
    expect(result.outcome).toBe("blocked");
    expect(result.blockedReason).toBe("no_credible_target");
  });

  it("transitions from exploring to editing when write tool is used", async () => {
    vi.stubEnv("EXPLORATION_MAX_STEPS", "100");
    vi.stubEnv("EXPLORATION_MAX_READS", "100");
    mockRunFileRead.mockResolvedValue("file contents");
    mockRunPatch.mockResolvedValue("Patched successfully.");

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(makeToolUseResponse("read_file", { path: "/tmp/f.ts" })),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(
              makeToolUseResponse("apply_patch", {
                path: "/tmp/f.ts",
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

    const result = await runStepLoop({ ...baseOpts, sessionId: "sess-phase-transition" });
    expect(result.outcome).toBe("completed");

    const allEvents = mockIngestEvents.mock.calls
      .flatMap((call) => call[2] as Array<{ eventType: string; payload: Record<string, unknown> }>);
    const phaseEvent = allEvents.find((e) => e.eventType === "phase.transition");
    expect(phaseEvent).toBeDefined();
    expect(phaseEvent!.payload).toEqual({ from: "exploring", to: "editing" });
  });

  it("allows one retry after first patch failure then completes on success", async () => {
    vi.stubEnv("EXPLORATION_MAX_STEPS", "100");
    vi.stubEnv("EXPLORATION_MAX_READS", "100");
    vi.stubEnv("EXPLORATION_MAX_SEARCHES", "100");
    mockRunFileRead.mockResolvedValue("file contents");
    mockRunPatch
      .mockRejectedValueOnce(new Error("hunk mismatch")) // first patch fails
      .mockResolvedValueOnce("Patched successfully."); // second patch succeeds

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // Step 1: apply_patch (fails)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(
              makeToolUseResponse("apply_patch", { path: "/tmp/f.ts", patch: "bad-patch" })
            ),
        })
        // Step 2: re-read (retry loop)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(makeToolUseResponse("read_file", { path: "/tmp/f.ts" })),
        })
        // Step 3: apply_patch (succeeds)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(
              makeToolUseResponse("apply_patch", { path: "/tmp/f.ts", patch: "good-patch" })
            ),
        })
        // Step 4: text completion
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(makeTextResponse("Done.")),
        })
    );

    const result = await runStepLoop({ ...baseOpts, sessionId: "sess-retry-ok" });
    expect(result.outcome).toBe("completed");
    expect(mockRunPatch).toHaveBeenCalledTimes(2);
  });

  it("emits blocked after two failed patch attempts", async () => {
    vi.stubEnv("EXPLORATION_MAX_STEPS", "100");
    vi.stubEnv("EXPLORATION_MAX_READS", "100");
    vi.stubEnv("EXPLORATION_MAX_SEARCHES", "100");
    mockRunPatch
      .mockRejectedValueOnce(new Error("hunk mismatch"))
      .mockRejectedValueOnce(new Error("still wrong"));

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // Step 1: apply_patch (fails — first attempt)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(
              makeToolUseResponse("apply_patch", { path: "/tmp/f.ts", patch: "bad" })
            ),
        })
        // Step 2: apply_patch again (fails — second attempt)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify(
              makeToolUseResponse("apply_patch", { path: "/tmp/f.ts", patch: "still-bad" })
            ),
        })
    );

    const result = await runStepLoop({ ...baseOpts, sessionId: "sess-retry-fail" });
    expect(result.outcome).toBe("blocked");
    expect(result.blockedReason).toBe("patch_not_validated");
  });

  it("emits blocked for max-step exhaustion without write attempt", async () => {
    vi.stubEnv("MAX_STEPS", "2");
    vi.stubEnv("EXPLORATION_MAX_STEPS", "100");
    vi.stubEnv("EXPLORATION_MAX_READS", "100");
    vi.stubEnv("EXPLORATION_MAX_SEARCHES", "100");
    mockRunShell.mockResolvedValue("output");

    // 2 steps of run_shell (non-exploration, non-write)
    const fetchMock = vi.fn();
    for (let i = 0; i < 2; i++) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(makeToolUseResponse("run_shell", { command: "echo hi" })),
      });
    }
    vi.stubGlobal("fetch", fetchMock);

    const result = await runStepLoop({ ...baseOpts, sessionId: "sess-maxstep-nowrite" });
    expect(result.outcome).toBe("blocked");
    expect(result.blockedReason).toBe("no_credible_target");
  });

  it("runs inferred validation command after write before completion", async () => {
    const rootTmp = await mkdtemp(path.join(os.tmpdir(), "step-loop-infer-"));
    const projectDir = path.join(rootTmp, "project");
    await mkdir(projectDir);
    await writeFile(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "tmp-project",
        private: true,
        scripts: {
          typecheck: "echo typecheck",
        },
      }),
      "utf-8"
    );

    const policy: WorkingDirectoryPolicy = {
      inputPath: projectDir,
      resolvedPath: projectDir,
      runtimeMode: "local",
    };

    mockRunPatch.mockResolvedValue("Patched successfully.");
    mockRunShell.mockResolvedValue("(validation ok)");

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
                path: path.join(projectDir, "src/main.ts"),
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
      const result = await runStepLoop({ ...baseOpts, sessionId: "sess-infer-validation", workdirPolicy: policy });
      expect(result.outcome).toBe("completed");
      expect(mockRunShell).toHaveBeenCalledWith("npm run typecheck", projectDir);
    } finally {
      await rm(rootTmp, { recursive: true, force: true });
    }
  });

  it("skips inferred validation when no package scripts are found", async () => {
    const rootTmp = await mkdtemp(path.join(os.tmpdir(), "step-loop-infer-"));
    const projectDir = path.join(rootTmp, "project");
    await mkdir(projectDir);
    await writeFile(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "tmp-project",
        private: true,
        scripts: {},
      }),
      "utf-8"
    );

    const policy: WorkingDirectoryPolicy = {
      inputPath: projectDir,
      resolvedPath: projectDir,
      runtimeMode: "local",
    };

    mockRunPatch.mockResolvedValue("Patched successfully.");

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
                path: path.join(projectDir, "src/main.ts"),
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
      const result = await runStepLoop({ ...baseOpts, sessionId: "sess-infer-skip", workdirPolicy: policy });
      expect(result.outcome).toBe("completed");
      expect(mockRunShell).not.toHaveBeenCalled();
    } finally {
      await rm(rootTmp, { recursive: true, force: true });
    }
  });
});
