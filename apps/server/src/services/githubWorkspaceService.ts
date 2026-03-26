import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import type { RuntimeMode, WorkingDirectoryPolicy } from "@humanlayer/shared";

const execFileAsync = promisify(execFile);

export type GithubRepoValidationCode =
  | "GITHUB_URL_INVALID"
  | "GITHUB_REPO_NOT_PUBLIC"
  | "GITHUB_API_ERROR"
  | "GIT_PUSH_TOKEN_MISSING"
  | "GITHUB_CLONE_FAILED"
  | "GITHUB_BRANCH_FAILED";

export class GithubRepoValidationError extends Error {
  code: GithubRepoValidationCode;

  constructor(code: GithubRepoValidationCode, message: string) {
    super(message);
    this.name = "GithubRepoValidationError";
    this.code = code;
  }
}

export interface ParsedGithubRepo {
  owner: string;
  repo: string;
  cloneHttpsUrl: string;
}

/**
 * Parse a GitHub repository URL or owner/repo shorthand. Only github.com is allowed.
 */
export function parseGithubRepoUrl(raw: string): ParsedGithubRepo | null {
  const input = raw.trim();
  if (!input) return null;

  const https =
    /^https:\/\/github\.com\/([a-z0-9_.-]+)\/([a-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(input);
  if (https) {
    const owner = https[1];
    const repo = https[2];
    return {
      owner,
      repo,
      cloneHttpsUrl: `https://github.com/${owner}/${repo}.git`,
    };
  }

  const ssh = /^git@github\.com:([a-z0-9_.-]+)\/([a-z0-9_.-]+?)(?:\.git)?$/i.exec(input);
  if (ssh) {
    const owner = ssh[1];
    const repo = ssh[2];
    return {
      owner,
      repo,
      cloneHttpsUrl: `https://github.com/${owner}/${repo}.git`,
    };
  }

  const short = /^([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/i.exec(input);
  if (short) {
    const owner = short[1];
    const repo = short[2];
    return {
      owner,
      repo,
      cloneHttpsUrl: `https://github.com/${owner}/${repo}.git`,
    };
  }

  return null;
}

function getPushToken(): string | undefined {
  const t = process.env.GITHUB_TOKEN ?? process.env.GIT_PUSH_TOKEN;
  return t?.trim() || undefined;
}

function sessionBranchName(sessionId: string): string {
  const slug = sessionId.replace(/-/g, "").slice(0, 12);
  return `humanlayer/session-${slug}`;
}

/**
 * Verify the repository exists and is public (unauthenticated GitHub API).
 */
export async function assertGithubRepoIsPublic(owner: string, repo: string): Promise<void> {
  const token = getPushToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "humanlayer-session-server",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
  });

  if (res.status === 404) {
    throw new GithubRepoValidationError(
      "GITHUB_REPO_NOT_PUBLIC",
      "Repository not found or not public. Session creation requires a public GitHub repository."
    );
  }

  if (!res.ok) {
    throw new GithubRepoValidationError(
      "GITHUB_API_ERROR",
      `GitHub API error (${res.status}) while checking repository visibility.`
    );
  }

  const body = (await res.json()) as { private?: boolean };
  if (body.private === true) {
    throw new GithubRepoValidationError(
      "GITHUB_REPO_NOT_PUBLIC",
      "Repository is private. Session creation requires a public GitHub repository."
    );
  }
}

async function chmodRecursiveWorldWritable(dir: string): Promise<void> {
  try {
    await execFileAsync("chmod", ["-R", "ugo+rwX", dir]);
  } catch {
    // Best-effort (e.g. non-POSIX); agent may still work if UIDs align.
  }
}

export interface GithubSessionMetadata {
  repoUrl: string;
  owner: string;
  repo: string;
  branch: string;
  cloneHttpsUrl: string;
}

export interface PrepareGithubWorkspaceResult {
  workdirPolicy: WorkingDirectoryPolicy;
  githubSession: GithubSessionMetadata;
  workdirDetails: Record<string, unknown>;
}

function getSessionWorkspaceRoot(): string {
  const fromEnv = process.env.SESSION_WORKSPACE_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "data", "session-workspaces");
}

/**
 * Clone a public GitHub repo into a per-session directory, create a dedicated branch,
 * and configure origin for HTTPS push using GITHUB_TOKEN / GIT_PUSH_TOKEN.
 */
export async function prepareGithubSessionWorkspace(
  sessionId: string,
  githubRepoUrl: string
): Promise<PrepareGithubWorkspaceResult> {
  const parsed = parseGithubRepoUrl(githubRepoUrl);
  if (!parsed) {
    throw new GithubRepoValidationError(
      "GITHUB_URL_INVALID",
      "Invalid GitHub URL. Use https://github.com/owner/repo, git@github.com:owner/repo.git, or owner/repo."
    );
  }

  await assertGithubRepoIsPublic(parsed.owner, parsed.repo);

  const token = getPushToken();
  if (!token) {
    throw new GithubRepoValidationError(
      "GIT_PUSH_TOKEN_MISSING",
      "GITHUB_TOKEN (or GIT_PUSH_TOKEN) must be set on the server to clone and push session branches."
    );
  }

  const root = getSessionWorkspaceRoot();
  const dest = path.join(root, sessionId, "repo");
  await fs.mkdir(path.dirname(dest), { recursive: true });

  try {
    await fs.rm(dest, { recursive: true, force: true });
  } catch {
    // ignore
  }

  const branch = sessionBranchName(sessionId);
  const authRemote = `https://x-access-token:${token}@github.com/${parsed.owner}/${parsed.repo}.git`;

  try {
    await execFileAsync("git", ["clone", "--depth", "1", parsed.cloneHttpsUrl, dest], {
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GithubRepoValidationError(
      "GITHUB_CLONE_FAILED",
      `git clone failed: ${msg}`
    );
  }

  try {
    await execFileAsync("git", ["-C", dest, "checkout", "-b", branch], {
      maxBuffer: 1024 * 1024,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GithubRepoValidationError(
      "GITHUB_BRANCH_FAILED",
      `Failed to create session branch: ${msg}`
    );
  }

  try {
    await execFileAsync("git", ["-C", dest, "remote", "set-url", "origin", authRemote], {
      maxBuffer: 1024 * 1024,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GithubRepoValidationError(
      "GITHUB_CLONE_FAILED",
      `Failed to configure git remote: ${msg}`
    );
  }

  const authorEmail =
    process.env.GIT_AUTHOR_EMAIL ?? "humanlayer-agent@users.noreply.github.com";
  const authorName = process.env.GIT_AUTHOR_NAME ?? "HumanLayer Agent";
  try {
    await execFileAsync("git", ["-C", dest, "config", "user.email", authorEmail], {
      maxBuffer: 1024 * 1024,
    });
    await execFileAsync("git", ["-C", dest, "config", "user.name", authorName], {
      maxBuffer: 1024 * 1024,
    });
  } catch {
    // non-fatal
  }

  await chmodRecursiveWorldWritable(dest);

  const runtimeMode: RuntimeMode = "docker";
  const workdirPolicy: WorkingDirectoryPolicy = {
    inputPath: githubRepoUrl.trim(),
    resolvedPath: dest,
    runtimeMode,
  };

  const githubSession: GithubSessionMetadata = {
    repoUrl: githubRepoUrl.trim(),
    owner: parsed.owner,
    repo: parsed.repo,
    branch,
    cloneHttpsUrl: parsed.cloneHttpsUrl,
  };

  return {
    workdirPolicy,
    githubSession,
    workdirDetails: {
      enteredPath: githubRepoUrl.trim(),
      canonicalPath: dest,
      selectedMode: runtimeMode,
      effectiveMode: runtimeMode,
      source: "github",
    },
  };
}
