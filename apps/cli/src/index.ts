#!/usr/bin/env node
/**
 * HumanLayer CLI — thin API-backed client for interactive and headless session execution.
 *
 * Usage:
 *   humanlayer run "Refactor auth middleware"            # Interactive mode
 *   humanlayer run "Fix bug" --headless --output out.jsonl  # Headless mode
 *   humanlayer status <session-id>                       # Check session status
 *   humanlayer stop <session-id>                         # Stop a session
 *   humanlayer list                                      # List sessions
 */

import type {
  CreateSessionResponse,
  GetSessionResponse,
  ListSessionsResponse,
  StopSessionResponse,
  SSESessionEvent,
} from "@humanlayer/shared";
import { formatJsonlEvent, type JsonlEvent } from "./jsonl.js";
import {
  EXIT_SUCCESS,
  EXIT_FAILURE,
  EXIT_POLICY_DENIED,
  EXIT_TIMEOUT,
  EXIT_RUNTIME_ERROR,
  EXIT_USAGE,
} from "./exitCodes.js";

// ============================================================
// Configuration
// ============================================================

const SERVER_URL = process.env.HUMANLAYER_SERVER_URL ?? process.env.SERVER_URL ?? "http://localhost:3000";
const API_TOKEN = process.env.HUMANLAYER_API_TOKEN;

// ============================================================
// HTTP Client
// ============================================================

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (API_TOKEN) h.Authorization = `Bearer ${API_TOKEN}`;
  return h;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new CliError(`API error ${res.status}: ${text}`, res.status >= 400 && res.status < 500 ? EXIT_POLICY_DENIED : EXIT_RUNTIME_ERROR);
  }
  return res.json() as Promise<T>;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new CliError(`API error ${res.status}: ${text}`, EXIT_RUNTIME_ERROR);
  }
  return res.json() as Promise<T>;
}

class CliError extends Error {
  exitCode: number;
  constructor(message: string, exitCode: number = EXIT_FAILURE) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

// ============================================================
// Commands
// ============================================================

interface RunOptions {
  goal: string;
  headless: boolean;
  outputPath?: string;
  githubRepoUrl?: string;
  workingDirectory?: string;
  agentType?: string;
  timeout?: number;
}

async function cmdRun(opts: RunOptions): Promise<number> {
  const body: Record<string, unknown> = {
    goal: opts.goal,
    ...(opts.githubRepoUrl?.trim() ? { githubRepoUrl: opts.githubRepoUrl.trim() } : {}),
    ...(opts.workingDirectory?.trim() ? { workingDirectory: opts.workingDirectory.trim() } : {}),
    ...(opts.agentType ? { agentType: opts.agentType } : {}),
  };

  const createRes = await apiPost<CreateSessionResponse>("/sessions", body);
  const sessionId = createRes.session.id;

  if (!opts.headless) {
    console.log(`Session created: ${sessionId}`);
    console.log(`Status: ${createRes.session.status}`);
    console.log(`Goal: ${createRes.session.goal}`);
    console.log("Streaming events...\n");
  }

  // Stream events
  const outputLines: string[] = [];
  const timeoutMs = opts.timeout ?? 30 * 60 * 1000; // 30 min default
  const startTime = Date.now();

  return new Promise<number>((resolve) => {
    const es = new EventSource(`${SERVER_URL}/sessions/${sessionId}/stream?since=-1`);
    const timeoutHandle = setTimeout(() => {
      es.close();
      if (opts.headless) {
        process.stdout.write(outputLines.join(""));
      }
      resolve(EXIT_TIMEOUT);
    }, timeoutMs);

    es.onmessage = (e: MessageEvent) => {
      try {
        const sseEvent = JSON.parse(e.data as string) as SSESessionEvent;

        if (opts.headless) {
          const jsonlEvent: JsonlEvent = {
            version: "1",
            timestamp: new Date().toISOString(),
            sessionId,
            type: sseEvent.type,
            data: sseEvent.data,
          };
          const line = formatJsonlEvent(jsonlEvent);
          outputLines.push(line);
          process.stdout.write(line);
        } else {
          if (sseEvent.type === "event") {
            const ev = sseEvent.data as Record<string, unknown>;
            const eventType = ev.eventType as string;
            const payload = ev.payload as Record<string, unknown>;

            if (eventType === "message.completed") {
              console.log(`[message] ${(payload.text as string)?.slice(0, 200)}`);
            } else if (eventType === "tool.started") {
              process.stdout.write(`  → ${payload.toolName as string}...`);
            } else if (eventType === "tool.completed") {
              process.stdout.write(" done\n");
            } else if (eventType === "session.completed") {
              console.log("\nSession completed.");
            } else if (eventType === "session.failed") {
              console.error(`\nSession failed: ${payload.error as string}`);
            } else if (eventType === "session.blocked") {
              console.log(`\nSession blocked: ${payload.reason as string}`);
            } else if (eventType === "session.stopped") {
              console.log("\nSession stopped.");
            }
          }
        }

        // Check for terminal events
        if (sseEvent.type === "event") {
          const ev = sseEvent.data as Record<string, unknown>;
          const eventType = ev.eventType as string;
          if (["session.completed", "session.failed", "session.stopped", "session.blocked"].includes(eventType)) {
            clearTimeout(timeoutHandle);
            es.close();

            const exitCode = eventType === "session.completed" ? EXIT_SUCCESS
              : eventType === "session.blocked" ? EXIT_POLICY_DENIED
              : EXIT_FAILURE;
            resolve(exitCode);
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      // Reconnect on error if still within timeout
      if (Date.now() - startTime < timeoutMs) {
        // EventSource auto-reconnects
      } else {
        clearTimeout(timeoutHandle);
        es.close();
        resolve(EXIT_TIMEOUT);
      }
    };
  });
}

async function cmdStatus(sessionId: string): Promise<number> {
  const res = await apiGet<GetSessionResponse>(`/sessions/${sessionId}`);
  console.log(`Session: ${res.session.id}`);
  console.log(`Status:  ${res.session.status}`);
  console.log(`Goal:    ${res.session.goal}`);
  console.log(`Agent:   ${res.session.agentType}`);
  console.log(`Created: ${res.session.createdAt}`);
  if (res.session.endedAt) console.log(`Ended:   ${res.session.endedAt}`);
  if (res.state?.currentTool) console.log(`Tool:    ${res.state.currentTool}`);
  return EXIT_SUCCESS;
}

async function cmdStop(sessionId: string, reason?: string): Promise<number> {
  const res = await apiPost<StopSessionResponse>(`/sessions/${sessionId}/stop`, { reason });
  console.log(`Session ${res.session.id} → ${res.session.status}`);
  return EXIT_SUCCESS;
}

async function cmdList(): Promise<number> {
  const res = await apiGet<ListSessionsResponse>("/sessions");
  if (res.sessions.length === 0) {
    console.log("No sessions found.");
    return EXIT_SUCCESS;
  }
  console.log("ID                                   STATUS      GOAL");
  console.log("-".repeat(80));
  for (const s of res.sessions) {
    const goal = s.goal.slice(0, 40);
    console.log(`${s.id}  ${s.status.padEnd(10)}  ${goal}`);
  }
  return EXIT_SUCCESS;
}

// ============================================================
// Argument Parsing
// ============================================================

function parseArgs(argv: string[]): { command: string; args: string[]; flags: Record<string, string | boolean> } {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else {
      args.push(arg);
      i++;
    }
  }

  return { command: args[0] ?? "", args: args.slice(1), flags };
}

function printUsage(): void {
  console.log(`Usage:
  humanlayer run <goal> [options]    Create and stream a session
  humanlayer status <session-id>    Check session status
  humanlayer stop <session-id>      Stop a session
  humanlayer list                   List sessions

Options:
  --headless                        Emit JSONL output instead of interactive display
  --output <path>                   Write JSONL output to file (headless only)
  --repo <url>                      Optional public GitHub repo (clone + push; needs server GITHUB_TOKEN)
  --workdir <path>                  Optional workspace path (default: server SESSION_DEFAULT_WORKDIR, e.g. /workspace)
  --agent-type <type>               Agent type selection
  --timeout <ms>                    Timeout in milliseconds (default: 1800000)

Environment:
  HUMANLAYER_SERVER_URL             Server URL (default: http://localhost:3000)
  HUMANLAYER_API_TOKEN              Optional API token for authentication
`);
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<number> {
  const { command, args, flags } = parseArgs(process.argv.slice(2));

  try {
    switch (command) {
      case "run": {
        const goal = args.join(" ");
        if (!goal) {
          console.error("Error: goal is required for 'run' command");
          printUsage();
          return EXIT_USAGE;
        }
        return await cmdRun({
          goal,
          headless: flags.headless === true,
          outputPath: typeof flags.output === "string" ? flags.output : undefined,
          githubRepoUrl: typeof flags.repo === "string" ? flags.repo : undefined,
          workingDirectory: typeof flags.workdir === "string" ? flags.workdir : undefined,
          agentType: typeof flags["agent-type"] === "string" ? flags["agent-type"] : undefined,
          timeout: typeof flags.timeout === "string" ? parseInt(flags.timeout, 10) : undefined,
        });
      }
      case "status":
        if (!args[0]) {
          console.error("Error: session-id is required");
          return EXIT_USAGE;
        }
        return await cmdStatus(args[0]);
      case "stop":
        if (!args[0]) {
          console.error("Error: session-id is required");
          return EXIT_USAGE;
        }
        return await cmdStop(args[0], typeof flags.reason === "string" ? flags.reason : undefined);
      case "list":
        return await cmdList();
      case "help":
      case "--help":
      case "-h":
      case "":
        printUsage();
        return EXIT_SUCCESS;
      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        return EXIT_USAGE;
    }
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`Error: ${err.message}`);
      return err.exitCode;
    }
    console.error(`Error: ${String(err)}`);
    return EXIT_FAILURE;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`Fatal: ${String(err)}`);
    process.exit(EXIT_FAILURE);
  });
