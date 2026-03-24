import { realpath, stat } from "fs/promises";
import path from "path";
import type {
  ExposedSurface,
  RuntimeMode,
  WorkingDirectoryPolicy,
  WorkdirErrorCode,
} from "@humanlayer/shared";

/**
 * Custom error class for workdir validation failures.
 * Carries a machine-readable reason code.
 */
export class WorkdirValidationError extends Error {
  code: WorkdirErrorCode;
  path?: string;

  constructor(code: WorkdirErrorCode, message: string, failedPath?: string) {
    super(message);
    this.name = "WorkdirValidationError";
    this.code = code;
    this.path = failedPath;
  }
}

export interface PolicyServiceConfig {
  /** Allowed root directories for working directories */
  allowedRoots: string[];
  /** Runtime mode */
  runtimeMode: RuntimeMode;
}

const DEFAULT_CONFIG: PolicyServiceConfig = {
  allowedRoots: process.env.WORKDIR_ALLOWED_ROOTS
    ? process.env.WORKDIR_ALLOWED_ROOTS.split(",").map((r) => r.trim())
    : ["/tmp"],
  runtimeMode: (process.env.RUNTIME_MODE as RuntimeMode) ?? "local",
};

/**
 * Check if a canonical path is under one of the allowed roots.
 */
function isUnderAllowedRoot(canonicalPath: string, allowedRoots: string[]): boolean {
  return allowedRoots.some((root) => {
    const normalizedRoot = root.endsWith("/") ? root : root + "/";
    return canonicalPath === root || canonicalPath.startsWith(normalizedRoot);
  });
}

/**
 * Validate and canonicalize a working directory path.
 * Returns a normalized WorkingDirectoryPolicy on success, throws WorkdirValidationError on failure.
 */
/**
 * Resolve allowed roots to their canonical paths (handles /tmp -> /private/tmp on macOS etc.)
 */
async function resolveAllowedRoots(roots: string[]): Promise<string[]> {
  const resolved: string[] = [];
  for (const root of roots) {
    try {
      resolved.push(await realpath(path.resolve(root)));
    } catch {
      // Skip roots that don't exist
      resolved.push(path.resolve(root));
    }
  }
  return resolved;
}

export async function validateWorkingDirectory(
  inputPath: string,
  exposedSurfaces: ExposedSurface[] = [],
  config: PolicyServiceConfig = DEFAULT_CONFIG
): Promise<WorkingDirectoryPolicy> {
  // Resolve to absolute path
  const absolutePath = path.resolve(inputPath);
  const absoluteRoots = config.allowedRoots.map((root) => path.resolve(root));

  // Resolve allowed roots to canonical paths
  const resolvedRoots = await resolveAllowedRoots(config.allowedRoots);

  // Check input/source path is under allowed roots before symlink resolution
  if (!isUnderAllowedRoot(absolutePath, absoluteRoots)) {
    throw new WorkdirValidationError(
      "WORKDIR_NOT_ALLOWED",
      `Working directory is outside allowed roots: ${inputPath}`,
      inputPath
    );
  }

  // Check existence and resolve symlinks
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(absolutePath);
  } catch {
    throw new WorkdirValidationError(
      "WORKDIR_NOT_FOUND",
      `Working directory not found: ${inputPath}`,
      inputPath
    );
  }

  // Check it's a directory
  try {
    const stats = await stat(resolvedPath);
    if (!stats.isDirectory()) {
      throw new WorkdirValidationError(
        "WORKDIR_NOT_DIRECTORY",
        `Path is not a directory: ${inputPath}`,
        inputPath
      );
    }
  } catch (err) {
    if (err instanceof WorkdirValidationError) throw err;
    throw new WorkdirValidationError(
      "WORKDIR_NOT_FOUND",
      `Cannot access working directory: ${inputPath}`,
      inputPath
    );
  }

  // Check the resolved path is within allowed roots
  if (!isUnderAllowedRoot(resolvedPath, resolvedRoots)) {
    throw new WorkdirValidationError(
      "WORKDIR_NOT_ALLOWED",
      `Working directory is outside allowed roots: ${inputPath}`,
      inputPath
    );
  }

  // Validate exposed surfaces
  for (const surface of exposedSurfaces) {
    const surfaceAbsolute = path.resolve(surface.hostPath);
    if (!isUnderAllowedRoot(surfaceAbsolute, absoluteRoots)) {
      throw new WorkdirValidationError(
        "EXPOSED_SURFACE_NOT_ALLOWED",
        `Exposed surface is outside allowed roots: ${surface.hostPath}`,
        surface.hostPath
      );
    }

    let surfaceResolved: string;
    try {
      surfaceResolved = await realpath(surfaceAbsolute);
    } catch {
      throw new WorkdirValidationError(
        "EXPOSED_SURFACE_NOT_ALLOWED",
        `Exposed surface path not found: ${surface.hostPath}`,
        surface.hostPath
      );
    }

    if (!isUnderAllowedRoot(surfaceResolved, resolvedRoots)) {
      throw new WorkdirValidationError(
        "EXPOSED_SURFACE_NOT_ALLOWED",
        `Exposed surface is outside allowed roots: ${surface.hostPath}`,
        surface.hostPath
      );
    }
  }

  return {
    inputPath,
    resolvedPath,
    runtimeMode: config.runtimeMode,
    exposedSurfaces,
  };
}
