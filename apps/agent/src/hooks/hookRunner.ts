/**
 * Hook Runner — executes repo-scoped setup and validation hooks with trust-policy enforcement.
 * Reports hook execution as events for audit visibility.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import type { RepoHookDefinition, HookExecutionResult } from "@humanlayer/shared";

const execFileAsync = promisify(execFile);

const DEFAULT_HOOK_TIMEOUT_MS = 30_000; // 30 seconds
const MAX_OUTPUT_LENGTH = 10_000; // Cap output to prevent memory issues

/**
 * Execute a single hook with timeout and output capture.
 */
export async function executeHook(
  hook: RepoHookDefinition,
  repoRoot: string
): Promise<HookExecutionResult> {
  const startTime = Date.now();
  const timeoutMs = hook.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS;
  const cwd = hook.cwd ? `${repoRoot}/${hook.cwd}` : repoRoot;

  try {
    const { stdout, stderr } = await execFileAsync("sh", ["-c", hook.command], {
      cwd,
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_LENGTH * 2,
      env: { ...process.env, HUMANLAYER_HOOK_EVENT: hook.event },
    });

    const output = [stdout, stderr].filter(Boolean).join("\n").slice(0, MAX_OUTPUT_LENGTH);

    return {
      hook,
      status: "completed",
      exitCode: 0,
      output: output || undefined,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const error = err as Error & { code?: string | number; killed?: boolean; stdout?: string; stderr?: string };

    if (error.killed || error.code === "ETIMEDOUT") {
      return {
        hook,
        status: "failed",
        error: `Hook timed out after ${timeoutMs}ms`,
        durationMs: Date.now() - startTime,
      };
    }

    const exitCode = typeof error.code === "number" ? error.code : 1;
    const output = [error.stdout, error.stderr].filter(Boolean).join("\n").slice(0, MAX_OUTPUT_LENGTH);

    return {
      hook,
      status: "failed",
      exitCode,
      output: output || undefined,
      error: error.message,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute a list of hooks in sequence.
 * Stops early if a blocking hook fails (when stopOnBlockingFailure is true).
 */
export async function executeHooks(
  hooks: RepoHookDefinition[],
  repoRoot: string,
  opts: { stopOnBlockingFailure?: boolean } = {}
): Promise<HookExecutionResult[]> {
  const results: HookExecutionResult[] = [];
  const stopOnBlockingFailure = opts.stopOnBlockingFailure ?? true;

  for (const hook of hooks) {
    const result = await executeHook(hook, repoRoot);
    results.push(result);

    if (result.status === "failed" && hook.blocking && stopOnBlockingFailure) {
      // Mark remaining hooks as skipped
      const remaining = hooks.slice(results.length);
      for (const skipped of remaining) {
        results.push({
          hook: skipped,
          status: "skipped",
          reason: `Skipped due to blocking hook failure: ${hook.command}`,
          durationMs: 0,
        });
      }
      break;
    }
  }

  return results;
}

/**
 * Filter hooks by lifecycle event type.
 */
export function filterHooksByEvent(
  hooks: RepoHookDefinition[],
  event: RepoHookDefinition["event"]
): RepoHookDefinition[] {
  return hooks.filter((h) => h.event === event);
}
