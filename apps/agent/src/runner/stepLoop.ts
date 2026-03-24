import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { EventEmitter } from "./eventEmitter.js";
import { heartbeat } from "../api.js";
import { runFileSearch, runFileRead } from "../tools/fileTools.js";
import { runPatch } from "../tools/patchTool.js";
import { runShell } from "../tools/shellTool.js";

const MODEL = process.env.AGENT_MODEL ?? "claude-haiku-4-5-20251001";
const MAX_STEPS = parseInt(process.env.MAX_STEPS ?? "20", 10);
const HEARTBEAT_INTERVAL_MS = parseInt(
  process.env.HEARTBEAT_INTERVAL_MS ?? "15000",
  10
);

const client = new Anthropic();

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_files",
    description: "Search for files matching a glob pattern or containing a string",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern or search string" },
        type: { type: "string", enum: ["glob", "content"], description: "Search type" },
        path: { type: "string", description: "Directory to search (default: cwd)" },
      },
      required: ["pattern", "type"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "apply_patch",
    description: "Apply a unified diff patch to a file",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Target file path" },
        patch: { type: "string", description: "Unified diff content" },
      },
      required: ["path", "patch"],
    },
  },
  {
    name: "run_shell",
    description: "Run a shell command (non-interactive). Use for tests, builds, etc.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        cwd: { type: "string", description: "Working directory (default: cwd)" },
      },
      required: ["command"],
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

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `You are a coding agent. Complete the following task step by step, using the provided tools.\n\nTask: ${opts.goal}\n\nBe methodical: search and read relevant files before making changes. Validate changes after applying them.`,
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

      // Call Claude
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        tools: TOOLS,
        messages,
      });

      // Add assistant response to history
      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );

      if (textBlocks.length > 0) {
        const text = textBlocks.map((b) => b.text).join("\n");
        emitter.emit(
          "message.completed",
          { text, stepNumber: stepCount },
          { stepId, correlationId }
        );
        summary = text;
      }

      // If no tool use and stop_reason is end_turn, we're done
      if (toolUseBlocks.length === 0 && response.stop_reason === "end_turn") {
        emitter.emit(
          "step.completed",
          { stepNumber: stepCount, terminal: true },
          { stepId, correlationId, isTerminal: true }
        );
        await emitter.flush();
        break;
      }

      // Execute tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const toolEventId = emitter.emit(
          "tool.started",
          { toolName: toolUse.name, toolUseId: toolUse.id, input: toolUse.input },
          { stepId, correlationId, actorType: "tool" }
        );

        let result: string;
        let isError = false;

        try {
          result = await executeTool(toolUse.name, toolUse.input as Record<string, string>);
        } catch (err) {
          result = `Error: ${String(err)}`;
          isError = true;
        }

        emitter.emit(
          isError ? "tool.failed" : "tool.completed",
          {
            toolName: toolUse.name,
            toolUseId: toolUse.id,
            result: result.slice(0, 2000),
            parentEventId: toolEventId,
          },
          { stepId, correlationId, actorType: "tool" }
        );

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
          is_error: isError,
        });
      }

      // Add tool results to message history
      if (toolResults.length > 0) {
        messages.push({ role: "user", content: toolResults });
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

async function executeTool(name: string, input: Record<string, string>): Promise<string> {
  switch (name) {
    case "search_files":
      return runFileSearch(input.pattern, input.type as "glob" | "content", input.path);
    case "read_file":
      return runFileRead(input.path);
    case "apply_patch":
      return runPatch(input.path, input.patch);
    case "run_shell":
      return runShell(input.command, input.cwd);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
