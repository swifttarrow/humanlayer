import fs from "fs/promises";
import path from "path";
import type { WorkingDirectoryPolicy } from "@humanlayer/shared";
import { validateWorkingDirectory } from "./workdirPolicyService.js";

/**
 * Default directory where the agent reads/writes when no githubRepoUrl or workingDirectory
 * is provided. In Docker Compose this should match the bind mount (e.g. /workspace).
 */
export function getDefaultLocalWorkdirRaw(): string {
  const v = process.env.SESSION_DEFAULT_WORKDIR?.trim();
  if (v) return v;
  return "/workspace";
}

export interface PrepareLocalWorkspaceResult {
  workdirPolicy: WorkingDirectoryPolicy;
  workdirDetails: Record<string, unknown>;
}

/**
 * Ensures the default local workspace exists and returns a policy for the agent.
 */
export async function prepareDefaultLocalWorkspace(): Promise<PrepareLocalWorkspaceResult> {
  const raw = getDefaultLocalWorkdirRaw();
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  await fs.mkdir(absolute, { recursive: true });
  try {
    await fs.chmod(absolute, 0o777);
  } catch {
    // best-effort (e.g. on some filesystems)
  }
  const policy = await validateWorkingDirectory(absolute);
  return {
    workdirPolicy: policy,
    workdirDetails: {
      enteredPath: raw,
      canonicalPath: policy.resolvedPath,
      selectedMode: policy.runtimeMode,
      effectiveMode: policy.runtimeMode,
      source: "local_bind_mount",
    },
  };
}
