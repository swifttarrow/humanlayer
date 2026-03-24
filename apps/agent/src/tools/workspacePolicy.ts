import path from "path";
import { realpathSync } from "fs";
import type { WorkingDirectoryPolicy } from "@humanlayer/shared";

/**
 * Error thrown when a tool access is denied by workspace policy.
 */
export class PolicyDeniedError extends Error {
  requestedPath: string;
  operation: "read" | "write" | "execute";

  constructor(operation: "read" | "write" | "execute", requestedPath: string, reason: string) {
    super(`Policy denied ${operation} access to ${requestedPath}: ${reason}`);
    this.name = "PolicyDeniedError";
    this.requestedPath = requestedPath;
    this.operation = operation;
  }
}

/**
 * Get all readable roots from policy (workdir + read_only/read_write surfaces).
 */
function getReadableRoots(policy: WorkingDirectoryPolicy): string[] {
  const roots = [canonicalizeExisting(policy.resolvedPath)];
  for (const surface of policy.exposedSurfaces) {
    roots.push(canonicalizeExisting(surface.hostPath));
  }
  return roots;
}

/**
 * Get all writable roots from policy (workdir + read_write surfaces only).
 */
function getWritableRoots(policy: WorkingDirectoryPolicy): string[] {
  const roots = [canonicalizeExisting(policy.resolvedPath)];
  for (const surface of policy.exposedSurfaces) {
    if (surface.mode === "read_write") {
      roots.push(canonicalizeExisting(surface.hostPath));
    }
  }
  return roots;
}

/**
 * Check if a path is under one of the given roots.
 */
function isUnderRoots(targetPath: string, roots: string[]): boolean {
  return roots.some((root) => {
    const normalizedRoot = root.endsWith("/") ? root : root + "/";
    return targetPath === root || targetPath.startsWith(normalizedRoot);
  });
}

/**
 * Resolve a path to its canonical form for policy checking.
 * Falls back to path.resolve if realpath fails (file may not exist yet for writes).
 */
function canonicalizeExisting(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

/**
 * Canonicalize write targets even when file does not yet exist by resolving
 * the nearest existing ancestor and re-appending unresolved path segments.
 */
function canonicalizeForWrite(filePath: string): string {
  const absolute = path.resolve(filePath);
  const unresolvedSegments: string[] = [];
  let current = absolute;

  while (true) {
    try {
      const resolvedBase = realpathSync(current);
      return unresolvedSegments.length === 0
        ? resolvedBase
        : path.join(resolvedBase, ...unresolvedSegments.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return absolute;
      }
      unresolvedSegments.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Assert that a path is readable under the given policy.
 * No-op if no policy is provided (backward compatibility).
 */
export function assertReadablePath(
  filePath: string,
  policy?: WorkingDirectoryPolicy
): void {
  if (!policy) return;
  const canonical = canonicalizeExisting(filePath);
  const roots = getReadableRoots(policy);
  if (!isUnderRoots(canonical, roots)) {
    throw new PolicyDeniedError(
      "read",
      filePath,
      "Path is outside allowed readable surfaces"
    );
  }
}

/**
 * Assert that a path is writable under the given policy.
 * No-op if no policy is provided (backward compatibility).
 */
export function assertWritablePath(
  filePath: string,
  policy?: WorkingDirectoryPolicy
): void {
  if (!policy) return;
  const canonical = canonicalizeForWrite(filePath);
  const roots = getWritableRoots(policy);
  if (!isUnderRoots(canonical, roots)) {
    throw new PolicyDeniedError(
      "write",
      filePath,
      "Path is outside allowed writable surfaces"
    );
  }
}

/**
 * Assert that a cwd is allowed for execution under the given policy.
 * No-op if no policy is provided (backward compatibility).
 */
export function assertExecutableCwd(
  cwd: string,
  policy?: WorkingDirectoryPolicy
): void {
  if (!policy) return;
  const canonical = canonicalizeExisting(cwd);
  const roots = getReadableRoots(policy);
  if (!isUnderRoots(canonical, roots)) {
    throw new PolicyDeniedError(
      "execute",
      cwd,
      "Working directory for shell execution is outside allowed surfaces"
    );
  }
}
