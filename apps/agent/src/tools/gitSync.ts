import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

/**
 * Stage all changes, commit if needed, and push to the session branch.
 * Returns a user-visible suffix for the tool result, or undefined if there was nothing to commit.
 */
export async function commitAndPushSessionBranch(opts: {
  repoRoot: string;
  branch: string;
  sessionId: string;
}): Promise<string | undefined> {
  const { repoRoot, branch, sessionId } = opts;
  const safeArg = `safe.directory=${repoRoot}`;
  const base = ["-c", safeArg, "-C", repoRoot];

  try {
    await execFileAsync("git", [...base, "add", "-A"], {
      maxBuffer: 4 * 1024 * 1024,
      env: GIT_ENV,
    });
  } catch (err) {
    return `[git] git add failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  let porcelain: string;
  try {
    const { stdout } = await execFileAsync("git", [...base, "status", "--porcelain"], {
      maxBuffer: 1024 * 1024,
      env: GIT_ENV,
    });
    porcelain = stdout;
  } catch (err) {
    return `[git] git status failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (!porcelain.trim()) {
    return undefined;
  }

  const msg = `humanlayer(agent): session ${sessionId.slice(0, 8)}`;
  try {
    await execFileAsync("git", [...base, "commit", "-m", msg], {
      maxBuffer: 1024 * 1024,
      env: GIT_ENV,
    });
  } catch (err) {
    return `[git] commit failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    await execFileAsync("git", [...base, "push", "-u", "origin", branch], {
      maxBuffer: 10 * 1024 * 1024,
      env: GIT_ENV,
    });
  } catch (err) {
    return `[git] push failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return "[git] Committed and pushed to session branch.";
}
