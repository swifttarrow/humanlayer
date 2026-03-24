import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { EventEmitter } from "./eventEmitter.js";
import { heartbeat, listSessionEvents } from "../api.js";
import { runFileSearch, runFileRead, runFileReadRange } from "../tools/fileTools.js";
import { runPatch } from "../tools/patchTool.js";
import { runShell } from "../tools/shellTool.js";
import type {
  WorkingDirectoryPolicy,
  SessionPhase,
  BlockedReason,
  ExplorationBudgetState,
  EditReadinessHypothesis,
} from "@humanlayer/shared";
import { assertReadablePath, assertWritablePath, assertExecutableCwd, PolicyDeniedError } from "../tools/workspacePolicy.js";

// Keep step numbers monotonic across follow-up runs in the same session.
const sessionStepCounts = new Map<string, number>();

const MODEL = process.env.AGENT_MODEL ?? "gpt-4.1-mini";
function getMaxSteps(): number {
  return parseInt(process.env.MAX_STEPS ?? "20", 10);
}
const MAX_THINKING_TOKENS_PER_STEP = parseInt(
  process.env.MAX_THINKING_TOKENS_PER_STEP ?? "300",
  10
);
const HEARTBEAT_INTERVAL_MS = parseInt(
  process.env.HEARTBEAT_INTERVAL_MS ?? "15000",
  10
);

// Exploration budget defaults — configurable via environment (read at runtime for testability)
function getExplorationMaxReads(): number {
  return parseInt(process.env.EXPLORATION_MAX_READS ?? "10", 10);
}
function getExplorationMaxSearches(): number {
  return parseInt(process.env.EXPLORATION_MAX_SEARCHES ?? "8", 10);
}
function getExplorationMaxSteps(): number {
  return parseInt(process.env.EXPLORATION_MAX_STEPS ?? "8", 10);
}

interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface StreamToolCallDelta {
  index?: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface ChatCompletionsChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: StreamToolCallDelta[];
    };
  }>;
}

const TOOLS: OpenAIToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search for files matching a glob pattern or containing a string",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern or search string" },
          type: { type: "string", enum: ["glob", "content"], description: "Search type" },
          path: { type: "string", description: "Directory to search (default: cwd)" },
        },
        required: ["pattern", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file_range",
      description:
        "Read a specific line range from a file. Prefer this over read_file for targeted context gathering.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
          start_line: {
            type: "number",
            description: "1-based start line (inclusive)",
          },
          end_line: {
            type: "number",
            description: "1-based end line (inclusive). Max 200 lines per call.",
          },
        },
        required: ["path", "start_line", "end_line"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_patch",
      description: "Apply a unified diff patch to a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Target file path" },
          patch: { type: "string", description: "Unified diff content" },
        },
        required: ["path", "patch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_shell",
      description: "Run a shell command (non-interactive). Use for tests, builds, etc.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          cwd: { type: "string", description: "Working directory (default: cwd)" },
        },
        required: ["command"],
      },
    },
  },
];

export interface StepLoopOptions {
  sessionId: string;
  attemptId: string;
  agentId: string;
  goal: string;
  /** Parent session id for follow-up runs (used for step-number continuity). */
  parentSessionId?: string;
  /** Server-resolved working directory policy from session metadata */
  workdirPolicy?: WorkingDirectoryPolicy;
}

export interface StepLoopResult {
  outcome: "completed" | "stopped" | "failed" | "blocked";
  summary?: string;
  error?: string;
  blockedReason?: BlockedReason;
}

/** Mutable tracking of exploration budget and phase within a single run. */
interface ExplorationTracker {
  phase: SessionPhase;
  readsUsed: number;
  searchesUsed: number;
  explorationStepsUsed: number;
  consecutiveExplorationSteps: number;
  writeAttempted: boolean;
  patchAttempts: number;
  patchFailed: boolean;
  inRetryLoop: boolean;
  lastHypothesis?: EditReadinessHypothesis;
  needsValidation: boolean;
  validationAttempts: number;
}

function createExplorationTracker(): ExplorationTracker {
  return {
    phase: "exploring",
    readsUsed: 0,
    searchesUsed: 0,
    explorationStepsUsed: 0,
    consecutiveExplorationSteps: 0,
    writeAttempted: false,
    patchAttempts: 0,
    patchFailed: false,
    inRetryLoop: false,
    needsValidation: false,
    validationAttempts: 0,
  };
}

function getBudgetState(tracker: ExplorationTracker): ExplorationBudgetState {
  return {
    readsUsed: tracker.readsUsed,
    readsLimit: getExplorationMaxReads(),
    searchesUsed: tracker.searchesUsed,
    searchesLimit: getExplorationMaxSearches(),
    explorationStepsUsed: tracker.explorationStepsUsed,
    explorationStepsLimit: getExplorationMaxSteps(),
  };
}

function isExplorationBudgetExhausted(tracker: ExplorationTracker): boolean {
  return (
    tracker.readsUsed >= getExplorationMaxReads() ||
    tracker.searchesUsed >= getExplorationMaxSearches() ||
    tracker.explorationStepsUsed >= getExplorationMaxSteps()
  );
}

/** Returns true if the tool is an exploration-only tool (read/search). */
function isExplorationTool(name: string): boolean {
  return name === "read_file" || name === "search_files" || name === "read_file_range";
}

/** Returns true if the tool is a write/edit tool. */
function isWriteTool(name: string): boolean {
  return name === "apply_patch";
}

/** Number of consecutive exploration-only steps before requiring a hypothesis. */
const HYPOTHESIS_THRESHOLD = 3;

/**
 * Extract a best-effort edit-readiness hypothesis from tool inputs and assistant text.
 * Returns a structured hypothesis for observability.
 */
function extractHypothesis(
  toolCalls: OpenAIToolCall[],
  assistantContent: string
): EditReadinessHypothesis {
  // Try to determine the candidate file from read/search tool inputs
  let candidateFile: string | undefined;
  for (const tc of toolCalls) {
    try {
      const input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      if (tc.function.name === "read_file" || tc.function.name === "read_file_range") {
        candidateFile = input.path as string | undefined;
        break;
      }
    } catch { /* ignore parse errors */ }
  }

  return {
    candidateFile,
    plannedChange: undefined,
    uncertaintyReason: assistantContent
      ? assistantContent.slice(0, 200)
      : "Continued exploration without explicit rationale",
    uncertaintyCategory: candidateFile ? "missing_context" : "ambiguous_target",
  };
}

export async function runStepLoop(opts: StepLoopOptions): Promise<StepLoopResult> {
  const emitter = new EventEmitter({
    sessionId: opts.sessionId,
    attemptId: opts.attemptId,
  });

  // Heartbeat timer
  const heartbeatTimer = setInterval(async () => {
    try {
      await heartbeat(opts.agentId, opts.attemptId, opts.sessionId);
    } catch (_err) {
      // Heartbeat failure handled at poll level
    }
  }, HEARTBEAT_INTERVAL_MS);

  let stopRequested = false;

  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content:
        "You are a coding agent. Complete tasks step by step using tools. Search and read relevant files before making edits. Validate changes after applying them. If the working directory is empty or missing project files and the task asks to build an app/feature, bootstrap a minimal runnable project scaffold in-place using tools (run_shell and/or apply_patch), then continue implementation.",
    },
    {
      role: "user",
      content: `Task: ${opts.goal}`,
    },
  ];

  emitter.emit("session.started", { goal: opts.goal });

  // Emit policy validation event if working directory policy is present
  if (opts.workdirPolicy) {
    emitter.emit("policy.validated", {
      resolvedPath: opts.workdirPolicy.resolvedPath,
      runtimeMode: opts.workdirPolicy.runtimeMode,
      exposedSurfaces: opts.workdirPolicy.exposedSurfaces.map((s) => ({
        hostPath: s.hostPath,
        mode: s.mode,
        label: s.label,
      })),
    });
  }

  await emitter.flush();

  let runStepCount = 0;
  let stepCount = await getStartingStepCount(opts.sessionId, opts.parentSessionId);
  let summary = "";
  const tracker = createExplorationTracker();

  try {
    while (runStepCount < getMaxSteps()) {
      // Check stop at each step boundary
      try {
        const hb = await heartbeat(opts.agentId, opts.attemptId, opts.sessionId);
        if (hb.stopRequested) {
          stopRequested = true;
          break;
        }
      } catch (_err) {
        // If heartbeat fails, proceed — sweeper will handle expired leases
      }

      runStepCount++;
      stepCount++;
      sessionStepCounts.set(opts.sessionId, stepCount);
      const stepId = randomUUID();
      const correlationId = randomUUID();

      emitter.emit(
        "step.started",
        { stepNumber: stepCount, goal: opts.goal },
        { stepId, correlationId }
      );
      await emitter.flush();

      const thinkingTokenEmitter = createThinkingTokenEmitter(
        emitter,
        stepCount,
        { stepId, correlationId }
      );
      const response = await callOpenAI(messages, (delta) => {
        thinkingTokenEmitter.onDelta(delta);
      });
      thinkingTokenEmitter.flush();
      const assistantContent = response.content ?? "";
      const toolCalls = response.tool_calls ?? [];

      messages.push({
        role: "assistant",
        content: assistantContent,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });

      if (assistantContent.trim().length > 0) {
        emitter.emit(
          "message.completed",
          { text: assistantContent, stepNumber: stepCount },
          { stepId, correlationId }
        );
        summary = assistantContent;
      }

      if (toolCalls.length === 0) {
        if (!tracker.writeAttempted && tracker.consecutiveExplorationSteps >= HYPOTHESIS_THRESHOLD) {
          messages.push({
            role: "system",
            content:
              "You must use tools before finishing. If no suitable files exist, bootstrap a minimal project scaffold in the working directory and then implement the requested task.",
          });
          emitter.emit(
            "step.completed",
            { stepNumber: stepCount },
            { stepId, correlationId }
          );
          await emitter.flush();
          continue;
        }

        if (tracker.needsValidation) {
          const validation = await runInferredValidation(opts.workdirPolicy, stepId, correlationId, emitter);
          if (validation.status === "failed") {
            tracker.validationAttempts++;
            if (tracker.validationAttempts >= 2) {
              emitter.emit("session.blocked", {
                reason: "patch_not_validated" as BlockedReason,
                phase: "validating" as SessionPhase,
                writeAttempted: true,
                summary: "Validation failed after inferred retry",
                explorationBudget: getBudgetState(tracker),
              }, { isTerminal: true });
              await emitter.flush();
              clearInterval(heartbeatTimer);
              return {
                outcome: "blocked",
                summary: "Validation failed after inferred retry",
                blockedReason: "patch_not_validated",
              };
            }

            const validationHeader = validation.command
              ? `Inferred validation failed: ${validation.command}`
              : "Inferred validation failed";
            messages.push({
              role: "system",
              content: `${validationHeader}\n${validation.output?.slice(0, 1500) ?? "(no output)"}\nFix the issue, then continue with tools.`,
            });
            emitter.emit(
              "step.completed",
              { stepNumber: stepCount },
              { stepId, correlationId }
            );
            await emitter.flush();
            continue;
          }

          // Either validation passed, or no command could be inferred (skip).
          tracker.needsValidation = false;
        }

        emitter.emit(
          "step.completed",
          { stepNumber: stepCount, terminal: true },
          { stepId, correlationId, isTerminal: true }
        );
        await emitter.flush();
        break;
      }

      // Track whether this step has any write tools
      let stepHasWrite = false;
      let stepHasExplorationOnly = true;

      // Execute tools
      for (const toolUse of toolCalls) {
        const parsedInput = parseToolInput(toolUse.function.arguments);
        const toolEventId = emitter.emit(
          "tool.started",
          { toolName: toolUse.function.name, toolUseId: toolUse.id, input: parsedInput },
          { stepId, correlationId, actorType: "tool" }
        );

        let result: string;
        let isError = false;

        try {
          result = await executeTool(toolUse.function.name, parsedInput, opts.workdirPolicy);
        } catch (err) {
          result = `Error: ${String(err)}`;
          isError = true;

          // Emit policy.denied event for policy violations
          if (err instanceof PolicyDeniedError) {
            emitter.emit("policy.denied", {
              toolName: toolUse.function.name,
              operation: err.operation,
              requestedPath: err.requestedPath,
              reason: err.message,
            }, { stepId, correlationId, actorType: "system" });
          }
        }

        emitter.emit(
          isError ? "tool.failed" : "tool.completed",
          {
            toolName: toolUse.function.name,
            toolUseId: toolUse.id,
            result: result.slice(0, 2000),
            parentEventId: toolEventId,
          },
          { stepId, correlationId, actorType: "tool" }
        );

        messages.push({
          role: "tool",
          tool_call_id: toolUse.id,
          content: isError ? `Error: ${result}` : result,
        });

        // Budget tracking
        const toolName = toolUse.function.name;
        if (isWriteTool(toolName)) {
          stepHasWrite = true;
          stepHasExplorationOnly = false;
          tracker.writeAttempted = true;
          tracker.needsValidation = !isError;
          tracker.patchAttempts++;
          if (isError) {
            tracker.patchFailed = true;
          } else {
            tracker.patchFailed = false;
          }
        } else if (!isExplorationTool(toolName)) {
          stepHasExplorationOnly = false;
        }

        if (toolName === "read_file" || toolName === "read_file_range") {
          tracker.readsUsed++;
        } else if (toolName === "search_files") {
          tracker.searchesUsed++;
        }
      }

      // Phase transitions based on tool usage
      if (stepHasWrite && tracker.phase === "exploring") {
        const prevPhase = tracker.phase;
        tracker.phase = "editing";
        emitter.emit("phase.transition", { from: prevPhase, to: "editing" }, { stepId, correlationId });
      }

      // Write-then-validate retry: allow one focused re-read + second patch attempt
      if (stepHasWrite && tracker.patchFailed && tracker.patchAttempts === 1 && !tracker.inRetryLoop) {
        tracker.inRetryLoop = true;
        tracker.phase = "validating";
        emitter.emit("phase.transition", { from: "editing", to: "validating" }, { stepId, correlationId });
        // Continue loop — agent gets one more cycle to re-read and retry
      } else if (stepHasWrite && tracker.patchFailed && tracker.patchAttempts >= 2) {
        // Second patch also failed — terminal as blocked
        emitter.emit("session.blocked", {
          reason: "patch_not_validated" as BlockedReason,
          phase: tracker.phase,
          writeAttempted: true,
          summary: "Patch attempted but validation failed after retry",
          explorationBudget: getBudgetState(tracker),
        }, { isTerminal: true });
        await emitter.flush();
        clearInterval(heartbeatTimer);
        return {
          outcome: "blocked",
          summary: "Patch attempted but validation failed after retry",
          blockedReason: "patch_not_validated",
        };
      }

      if (stepHasExplorationOnly && tracker.phase === "exploring") {
        tracker.explorationStepsUsed++;
        tracker.consecutiveExplorationSteps++;

        // Emit edit-readiness hypothesis after repeated exploration-only steps
        if (tracker.consecutiveExplorationSteps >= HYPOTHESIS_THRESHOLD) {
          const hypothesis = extractHypothesis(toolCalls, assistantContent);
          tracker.lastHypothesis = hypothesis;
          emitter.emit("edit_readiness.hypothesis", {
            hypothesis,
            explorationStepsSoFar: tracker.consecutiveExplorationSteps,
            budget: getBudgetState(tracker),
          }, { stepId, correlationId });
        }
      } else if (!stepHasExplorationOnly) {
        tracker.consecutiveExplorationSteps = 0;
      }

      emitter.emit(
        "step.completed",
        { stepNumber: stepCount },
        { stepId, correlationId }
      );
      await emitter.flush();

      // Check exploration budget after step completes
      if (tracker.phase === "exploring" && isExplorationBudgetExhausted(tracker)) {
        emitter.emit("exploration.budget_exhausted", {
          budget: getBudgetState(tracker),
          writeAttempted: tracker.writeAttempted,
        }, { isTerminal: false });

        // Terminate as blocked — exploration exhausted without a write attempt
        emitter.emit("session.blocked", {
          reason: "exploration_budget_exhausted" as BlockedReason,
          phase: tracker.phase,
          writeAttempted: tracker.writeAttempted,
          summary: "Exploration budget exhausted without credible write target",
          explorationBudget: getBudgetState(tracker),
        }, { isTerminal: true });
        await emitter.flush();
        clearInterval(heartbeatTimer);
        return {
          outcome: "blocked",
          summary: "Exploration budget exhausted without credible write target",
          blockedReason: "exploration_budget_exhausted",
        };
      }
    }

    clearInterval(heartbeatTimer);

    if (stopRequested) {
      emitter.emit("session.stopped", { reason: "stop_requested" }, { isTerminal: true });
      await emitter.flush();
      return { outcome: "stopped", summary };
    }

    // If max steps exhausted without a write attempt, emit blocked instead of completed
    if (!tracker.writeAttempted && runStepCount >= getMaxSteps()) {
      emitter.emit("session.blocked", {
        reason: "no_credible_target" as BlockedReason,
        phase: tracker.phase,
        writeAttempted: false,
        summary: "Max steps exhausted without write attempt",
        explorationBudget: getBudgetState(tracker),
      }, { isTerminal: true });
      await emitter.flush();
      return {
        outcome: "blocked",
        summary: "Max steps exhausted without write attempt",
        blockedReason: "no_credible_target",
      };
    }

    emitter.emit("session.completed", { summary, stepCount }, { isTerminal: true });
    await emitter.flush();
    return { outcome: "completed", summary };
  } catch (err) {
    clearInterval(heartbeatTimer);
    const error = String(err);
    emitter.emit("session.failed", { error }, { isTerminal: true });
    try {
      await emitter.flush();
    } catch (_) {
      // best effort
    }
    return { outcome: "failed", error };
  }
}

function getMaxStartedStep(events: Array<{ eventType: string; payload: Record<string, unknown> }>): number {
  return events.reduce((max, event) => {
    if (event.eventType !== "step.started") return max;
    const rawStep = event.payload.stepNumber;
    const stepNumber = typeof rawStep === "number" ? rawStep : Number(rawStep);
    return Number.isFinite(stepNumber) ? Math.max(max, stepNumber) : max;
  }, 0);
}

async function getStartingStepCount(
  sessionId: string,
  parentSessionId?: string
): Promise<number> {
  const inMemory = sessionStepCounts.get(sessionId);
  if (typeof inMemory === "number") {
    return inMemory;
  }

  // After process restarts, recover monotonic numbering from persisted history.
  try {
    const { events } = await listSessionEvents(sessionId);
    const maxPersistedStep = getMaxStartedStep(events);
    if (maxPersistedStep > 0) {
      sessionStepCounts.set(sessionId, maxPersistedStep);
      return maxPersistedStep;
    }

    // For follow-up sessions (new session IDs), continue numbering from parent session.
    if (parentSessionId) {
      const parentInMemory = sessionStepCounts.get(parentSessionId);
      if (typeof parentInMemory === "number") {
        sessionStepCounts.set(sessionId, parentInMemory);
        return parentInMemory;
      }

      const { events: parentEvents } = await listSessionEvents(parentSessionId);
      const parentMaxStep = getMaxStartedStep(parentEvents);
      sessionStepCounts.set(sessionId, parentMaxStep);
      return parentMaxStep;
    }

    sessionStepCounts.set(sessionId, 0);
    return 0;
  } catch {
    // Best-effort fallback: continue from zero if history cannot be fetched.
    return 0;
  }
}

async function callOpenAI(
  messages: OpenAIMessage[],
  onTextDelta?: (delta: string) => void
): Promise<{
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for agent step loop");
  }
  const maxRetries = getOpenAIMaxRetries();
  const baseDelayMs = getOpenAIRetryBaseMs();
  const maxDelayMs = getOpenAIRetryMaxMs();
  const requestTimeoutMs = getOpenAIRequestTimeoutMs();
  const streamIdleTimeoutMs = getOpenAIStreamIdleTimeoutMs();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    const controller = new AbortController();
    const requestTimeoutHandle = setTimeout(() => {
      controller.abort();
    }, Math.max(1, requestTimeoutMs));
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          temperature: 0,
          stream: true,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(requestTimeoutHandle);
      const timedOut = err instanceof Error && err.name === "AbortError";
      const requestError = timedOut
        ? `OpenAI request timed out after ${requestTimeoutMs}ms`
        : String(err);
      const canRetry = attempt < maxRetries;
      if (!canRetry) {
        throw new Error(`OpenAI chat.completions request failed: ${requestError}`);
      }
      const delayMs = computeRetryDelayMs(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `[agent] OpenAI retry ${attempt + 1}/${maxRetries} after request error: ${requestError} (delay=${delayMs}ms)`
      );
      await sleep(delayMs);
      continue;
    }
    clearTimeout(requestTimeoutHandle);

    if (!res.ok) {
      const raw = await res.text();
      const canRetry = shouldRetryStatusCode(res.status) && attempt < maxRetries;
      if (!canRetry) {
        throw new Error(`OpenAI chat.completions failed ${res.status}: ${raw}`);
      }
      const delayMs = getRetryAfterMs(res) ?? computeRetryDelayMs(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `[agent] OpenAI retry ${attempt + 1}/${maxRetries} after status ${res.status} (delay=${delayMs}ms)`
      );
      await sleep(delayMs);
      continue;
    }

    if (res.body) {
      try {
        return await parseStreamingChatCompletion(
          res.body,
          onTextDelta,
          streamIdleTimeoutMs
        );
      } catch (err) {
        const canRetry = attempt < maxRetries;
        if (!canRetry) {
          throw new Error(`OpenAI chat.completions stream failed: ${String(err)}`);
        }
        const delayMs = computeRetryDelayMs(attempt, baseDelayMs, maxDelayMs);
        console.warn(
          `[agent] OpenAI retry ${attempt + 1}/${maxRetries} after stream error: ${String(err)} (delay=${delayMs}ms)`
        );
        await sleep(delayMs);
        continue;
      }
    }

    // Test/mock fallback for non-streaming response objects.
    const raw = await res.text();
    const json = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: OpenAIToolCall[] } }>;
    };
    const message = json.choices?.[0]?.message;
    if (!message) {
      throw new Error("OpenAI response missing choices[0].message");
    }
    return message;
  }

  throw new Error("OpenAI chat.completions failed after exhausting retries");
}

function shouldRetryStatusCode(statusCode: number): boolean {
  return statusCode === 429 || statusCode >= 500;
}

function computeRetryDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  return Math.min(exponential, maxDelayMs);
}

function getOpenAIMaxRetries(): number {
  return parseInt(process.env.OPENAI_MAX_RETRIES ?? "3", 10);
}

function getOpenAIRetryBaseMs(): number {
  return parseInt(process.env.OPENAI_RETRY_BASE_MS ?? "1000", 10);
}

function getOpenAIRetryMaxMs(): number {
  return parseInt(process.env.OPENAI_RETRY_MAX_MS ?? "10000", 10);
}

function getOpenAIRequestTimeoutMs(): number {
  return parseInt(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "60000", 10);
}

function getOpenAIStreamIdleTimeoutMs(): number {
  return parseInt(process.env.OPENAI_STREAM_IDLE_TIMEOUT_MS ?? "30000", 10);
}

function getRetryAfterMs(res: Response): number | undefined {
  const retryAfter = res.headers?.get?.("retry-after");
  if (!retryAfter) return undefined;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }
  const dateMs = Date.parse(retryAfter);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : 0;
  }
  return undefined;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function parseStreamingChatCompletion(
  body: ReadableStream<Uint8Array>,
  onTextDelta?: (delta: string) => void,
  idleTimeoutMs = 30000
): Promise<{ content?: string | null; tool_calls?: OpenAIToolCall[] }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCalls = new Map<number, OpenAIToolCall>();

  function getOrCreateToolCall(index: number): OpenAIToolCall {
    const existing = toolCalls.get(index);
    if (existing) return existing;
    const next: OpenAIToolCall = {
      id: `stream-tool-${index}`,
      type: "function",
      function: { name: "", arguments: "" },
    };
    toolCalls.set(index, next);
    return next;
  }

  function processLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;

    let chunk: ChatCompletionsChunk;
    try {
      chunk = JSON.parse(data) as ChatCompletionsChunk;
    } catch {
      return;
    }

    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;

    if (typeof delta.content === "string" && delta.content.length > 0) {
      content += delta.content;
      onTextDelta?.(delta.content);
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const toolDelta of delta.tool_calls) {
        const index = typeof toolDelta.index === "number" ? toolDelta.index : 0;
        const toolCall = getOrCreateToolCall(index);
        if (typeof toolDelta.id === "string" && toolDelta.id.length > 0) {
          toolCall.id = toolDelta.id;
        }
        if (typeof toolDelta.function?.name === "string") {
          toolCall.function.name += toolDelta.function.name;
        }
        if (typeof toolDelta.function?.arguments === "string") {
          toolCall.function.arguments += toolDelta.function.arguments;
        }
      }
    }
  }

  let streamDone = false;
  while (!streamDone) {
    const { done, value } = await readWithIdleTimeout(
      reader,
      Math.max(1, idleTimeoutMs)
    );
    if (done) {
      streamDone = true;
      continue;
    }
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      processLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    for (const line of buffer.split("\n")) {
      processLine(line);
    }
  }

  return {
    content,
    tool_calls: [...toolCalls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, toolCall]) => toolCall),
  };
}

async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number
): Promise<{ done: boolean; value?: Uint8Array }> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<{ done: boolean; value?: Uint8Array }>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`OpenAI stream idle timeout after ${idleTimeoutMs}ms`));
        }, idleTimeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function parseToolInput(argumentsJson: string): Record<string, unknown> {
  try {
    return JSON.parse(argumentsJson) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Invalid tool arguments JSON: ${String(err)}`);
  }
}

function getStringInput(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

function createThinkingTokenEmitter(
  emitter: EventEmitter,
  stepNumber: number,
  ids: { stepId: string; correlationId: string }
) {
  let tokenIndex = 0;
  let emittedCount = 0;
  let carry = "";

  function emitToken(token: string) {
    if (!token || emittedCount >= MAX_THINKING_TOKENS_PER_STEP) return;
    emittedCount++;
    tokenIndex++;
    emitter.emit(
      "thinking.token",
      {
        token,
        tokenIndex,
        stepNumber,
      },
      { stepId: ids.stepId, correlationId: ids.correlationId }
    );
  }

  return {
    onDelta(delta: string) {
      if (emittedCount >= MAX_THINKING_TOKENS_PER_STEP) return;
      const normalized = delta.replace(/\r?\n/g, " ");
      const combined = `${carry}${normalized}`;
      const parts = combined.split(/\s+/);
      const endsWithWhitespace = /\s$/.test(combined);

      if (!endsWithWhitespace) {
        carry = parts.pop() ?? "";
      } else {
        carry = "";
      }

      for (const part of parts) {
        const token = part.trim();
        if (!token) continue;
        emitToken(token);
        if (emittedCount >= MAX_THINKING_TOKENS_PER_STEP) {
          carry = "";
          break;
        }
      }
    },
    flush() {
      if (carry.trim().length > 0) {
        emitToken(carry.trim());
      }
      carry = "";
    },
  };
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  policy?: WorkingDirectoryPolicy
): Promise<string> {
  const defaultCwd = policy?.resolvedPath;
  switch (name) {
    case "search_files": {
      const requestedSearchPath = getStringInput(input, "path");
      const searchPath =
        defaultCwd && requestedSearchPath && !path.isAbsolute(requestedSearchPath)
          ? path.resolve(defaultCwd, requestedSearchPath)
          : requestedSearchPath ?? defaultCwd;
      if (searchPath) assertReadablePath(searchPath, policy);
      return runFileSearch(
        getStringInput(input, "pattern") ?? "",
        (getStringInput(input, "type") as "glob" | "content") ?? "content",
        searchPath
      );
    }
    case "read_file": {
      const filePath = getStringInput(input, "path") ?? "";
      const resolvedPath =
        defaultCwd && filePath && !path.isAbsolute(filePath)
          ? path.resolve(defaultCwd, filePath)
          : filePath;
      assertReadablePath(resolvedPath, policy);
      return runFileRead(filePath, defaultCwd);
    }
    case "read_file_range": {
      const filePath = getStringInput(input, "path") ?? "";
      const resolvedPath =
        defaultCwd && filePath && !path.isAbsolute(filePath)
          ? path.resolve(defaultCwd, filePath)
          : filePath;
      assertReadablePath(resolvedPath, policy);
      const startLine = typeof input.start_line === "number" ? input.start_line : 1;
      const endLine = typeof input.end_line === "number" ? input.end_line : startLine + 50;
      return runFileReadRange(filePath, startLine, endLine, defaultCwd);
    }
    case "apply_patch": {
      const patchPath = getStringInput(input, "path") ?? "";
      const resolvedPath =
        defaultCwd && patchPath && !path.isAbsolute(patchPath)
          ? path.resolve(defaultCwd, patchPath)
          : patchPath;
      assertWritablePath(resolvedPath, policy);
      return runPatch(resolvedPath, getStringInput(input, "patch") ?? "");
    }
    case "run_shell": {
      const cwd = getStringInput(input, "cwd") ?? defaultCwd;
      if (cwd) assertExecutableCwd(cwd, policy);
      return runShell(getStringInput(input, "command") ?? "", cwd);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

interface ValidationResult {
  status: "passed" | "failed" | "skipped";
  command?: string;
  output?: string;
}

async function runInferredValidation(
  policy: WorkingDirectoryPolicy | undefined,
  stepId: string,
  correlationId: string,
  emitter: EventEmitter
): Promise<ValidationResult> {
  const inferred = await inferValidationCommand(policy?.resolvedPath);
  if (!inferred) {
    return { status: "skipped" };
  }

  const toolUseId = `inferred-validation-${randomUUID().slice(0, 8)}`;
  const input: Record<string, unknown> = { command: inferred.command, cwd: inferred.cwd };
  const toolEventId = emitter.emit(
    "tool.started",
    { toolName: "run_shell", toolUseId, input },
    { stepId, correlationId, actorType: "tool" }
  );

  try {
    const output = await executeTool("run_shell", input, policy);
    const normalizedOutput =
      typeof output === "string" ? output : String(output ?? "(no output)");
    const failed = /^Exit code [1-9]\d*:/.test(normalizedOutput);
    emitter.emit(
      failed ? "tool.failed" : "tool.completed",
      {
        toolName: "run_shell",
        toolUseId,
        result: normalizedOutput.slice(0, 2000),
        parentEventId: toolEventId,
      },
      { stepId, correlationId, actorType: "tool" }
    );
    return {
      status: failed ? "failed" : "passed",
      command: inferred.command,
      output: normalizedOutput,
    };
  } catch (err) {
    const output = `Error: ${String(err)}`;
    emitter.emit(
      "tool.failed",
      {
        toolName: "run_shell",
        toolUseId,
        result: output.slice(0, 2000),
        parentEventId: toolEventId,
      },
      { stepId, correlationId, actorType: "tool" }
    );
    return {
      status: "failed",
      command: inferred.command,
      output,
    };
  }
}

const INFERRED_VALIDATION_SCRIPT_ORDER = ["typecheck", "build", "test", "lint"] as const;

async function inferValidationCommand(
  startDir?: string
): Promise<{ command: string; cwd: string } | undefined> {
  const cwd = path.resolve(startDir ?? process.cwd());

  for (const dir of walkUpDirectories(cwd)) {
    const packageJsonPath = path.join(dir, "package.json");
    try {
      const packageJsonRaw = await readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(packageJsonRaw) as { scripts?: Record<string, unknown> };
      const scripts = packageJson.scripts ?? {};
      for (const scriptName of INFERRED_VALIDATION_SCRIPT_ORDER) {
        if (typeof scripts[scriptName] === "string") {
          return {
            command: `npm run ${scriptName}`,
            cwd: dir,
          };
        }
      }
    } catch {
      // Ignore missing/invalid package.json and continue walking up.
    }
  }

  return undefined;
}

function* walkUpDirectories(start: string): Generator<string> {
  let current = start;
  while (true) {
    yield current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
