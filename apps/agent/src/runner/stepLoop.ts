import { randomUUID } from "crypto";
import { EventEmitter } from "./eventEmitter.js";
import { heartbeat } from "../api.js";
import { runFileSearch, runFileRead } from "../tools/fileTools.js";
import { runPatch } from "../tools/patchTool.js";
import { runShell } from "../tools/shellTool.js";

const MODEL = process.env.AGENT_MODEL ?? "gpt-4.1-mini";
const MAX_STEPS = parseInt(process.env.MAX_STEPS ?? "20", 10);
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
  await emitter.flush();

  let stepCount = 0;
  let summary = "";

  try {
    while (stepCount < MAX_STEPS) {
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

      stepCount++;
      const stepId = randomUUID();
      const correlationId = randomUUID();

      emitter.emit(
        "step.started",
        { stepNumber: stepCount, goal: opts.goal },
        { stepId, correlationId }
      );
      await emitter.flush();

      const response = await callOpenAI(messages);
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
          result = await executeTool(toolUse.function.name, parsedInput);
        } catch (err) {
          result = `Error: ${String(err)}`;
          isError = true;
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

async function callOpenAI(messages: OpenAIMessage[]): Promise<{
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for agent step loop");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI chat.completions failed ${res.status}: ${raw}`);
  }

  const json = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: OpenAIToolCall[] } }>;
  };
  const message = json.choices?.[0]?.message;
  if (!message) {
    throw new Error("OpenAI response missing choices[0].message");
  }
  return message;
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

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "search_files":
      return runFileSearch(
        getStringInput(input, "pattern") ?? "",
        (getStringInput(input, "type") as "glob" | "content") ?? "content",
        getStringInput(input, "path")
      );
    case "read_file":
      return runFileRead(getStringInput(input, "path") ?? "");
    case "apply_patch":
      return runPatch(getStringInput(input, "path") ?? "", getStringInput(input, "patch") ?? "");
    case "run_shell":
      return runShell(getStringInput(input, "command") ?? "", getStringInput(input, "cwd"));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
