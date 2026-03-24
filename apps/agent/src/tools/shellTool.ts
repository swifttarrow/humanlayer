import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

const SHELL_TIMEOUT_MS = parseInt(process.env.SHELL_TIMEOUT_MS ?? "30000", 10);
const MAX_OUTPUT_CHARS = 10_000;

// Disallow obviously destructive commands
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/(?!\w)/,       // rm -rf /
  /mkfs\./,
  /dd\s+.*of=\/dev/,
  />\s*\/dev\/sd/,
  /shutdown|reboot|halt/,
  /passwd|sudo\s+su/,
];

export async function runShell(command: string, cwd?: string): Promise<string> {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Blocked command pattern: ${command}`);
    }
  }

  const workDir = cwd ? path.resolve(cwd) : process.cwd();

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workDir,
      timeout: SHELL_TIMEOUT_MS,
      maxBuffer: 5 * 1024 * 1024,
    });

    const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
    if (combined.length > MAX_OUTPUT_CHARS) {
      return combined.slice(0, MAX_OUTPUT_CHARS) + "\n... [truncated]";
    }
    return combined || "(no output)";
  } catch (err: unknown) {
    if (err instanceof Error && "stdout" in err && "stderr" in err) {
      const e = err as Error & { stdout: string; stderr: string; code: number };
      const out = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
      return `Exit code ${e.code}:\n${out.slice(0, MAX_OUTPUT_CHARS)}`;
    }
    throw err;
  }
}
