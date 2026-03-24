import { randomUUID } from "crypto";
import path from "path";
import { EventEmitter } from "./eventEmitter.js";
import { heartbeat, listSessionEvents } from "../api.js";
import { runFileSearch, runFileRead } from "../tools/fileTools.js";
import { runPatch } from "../tools/patchTool.js";
import { runShell } from "../tools/shellTool.js";
import type { WorkingDirectoryPolicy } from "@humanlayer/shared";
import { assertReadablePath, assertWritablePath, assertExecutableCwd, PolicyDeniedError } from "../tools/workspacePolicy.js";

// Keep step numbers monotonic across follow-up runs in the same session.
const sessionStepCounts = new Map<string, number>();

const MODEL = process.env.AGENT_MODEL ?? "gpt-4.1-mini";
const MAX_STEPS = parseInt(process.env.MAX_STEPS ?? "20", 10);
const MAX_THINKING_TOKENS_PER_STEP = parseInt(
  process.env.MAX_THINKING_TOKENS_PER_STEP ?? "300",
  10
);
const HEARTBEAT_INTERVAL_MS = parseInt(
  process.env.HEARTBEAT_INTERVAL_MS ?? "15000",
  10
);

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
  /** Server-resolved working directory policy from session metadata */
  workdirPolicy?: WorkingDirectoryPolicy;
}

export interface StepLoopResult {
  outcome: "completed" | "stopped" | "failed";
  summary?: string;
  error?: string;
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
        "You are a coding agent. Complete tasks step by step using tools. Search and read relevant files before making edits. Validate changes after applying them.",
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
  let stepCount = await getStartingStepCount(opts.sessionId);
  let summary = "";

  try {
    while (runStepCount < MAX_STEPS) {
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
        emitter.emit(
          "step.completed",
          { stepNumber: stepCount, terminal: true },
          { stepId, correlationId, isTerminal: true }
        );
        await emitter.flush();
        break;
      }

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
      }

      emitter.emit(
        "step.completed",
        { stepNumber: stepCount },
        { stepId, correlationId }
      );
      await emitter.flush();
    }

    clearInterval(heartbeatTimer);

    if (stopRequested) {
      emitter.emit("session.stopped", { reason: "stop_requested" }, { isTerminal: true });
      await emitter.flush();
      return { outcome: "stopped", summary };
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

async function getStartingStepCount(sessionId: string): Promise<number> {
  const inMemory = sessionStepCounts.get(sessionId);
  if (typeof inMemory === "number") {
    return inMemory;
  }

  // After process restarts, recover monotonic numbering from persisted history.
  try {
    const { events } = await listSessionEvents(sessionId);
    const maxPersistedStep = events.reduce((max, event) => {
      if (event.eventType !== "step.started") return max;
      const rawStep = event.payload.stepNumber;
      const stepNumber = typeof rawStep === "number" ? rawStep : Number(rawStep);
      return Number.isFinite(stepNumber) ? Math.max(max, stepNumber) : max;
    }, 0);
    sessionStepCounts.set(sessionId, maxPersistedStep);
    return maxPersistedStep;
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

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
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
      });
    } catch (err) {
      const canRetry = attempt < maxRetries;
      if (!canRetry) {
        throw new Error(`OpenAI chat.completions request failed: ${String(err)}`);
      }
      const delayMs = computeRetryDelayMs(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `[agent] OpenAI retry ${attempt + 1}/${maxRetries} after request error: ${String(err)} (delay=${delayMs}ms)`
      );
      await sleep(delayMs);
      continue;
    }

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
      return parseStreamingChatCompletion(res.body, onTextDelta);
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
  onTextDelta?: (delta: string) => void
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
    const { done, value } = await reader.read();
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
      const searchPath = getStringInput(input, "path") ?? defaultCwd;
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
