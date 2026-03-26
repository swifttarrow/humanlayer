import { realpath, stat } from "fs/promises";
import path from "path";
import os from "os";
import type {
  RuntimeMode,
  RuntimeModePolicy,
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
  /** Runtime mode */
  runtimeMode: RuntimeMode;
  /** Runtime mode policy — controls which modes are available */
  runtimeModePolicy?: RuntimeModePolicy;
}

const DEFAULT_CONFIG: PolicyServiceConfig = {
  runtimeMode: (process.env.RUNTIME_MODE as RuntimeMode) ?? "docker",
  runtimeModePolicy: (process.env.RUNTIME_MODE_POLICY as RuntimeModePolicy) ?? "docker_only",
};

/**
 * RuntimeModeDenialError — thrown when selected runtime mode violates system policy.
 */
export class RuntimeModeDenialError extends Error {
  code: "RUNTIME_MODE_DENIED";
  selectedMode: RuntimeMode;
  effectiveMode: RuntimeMode;
  policy: RuntimeModePolicy;
  guidance: string;

  constructor(selectedMode: RuntimeMode, effectiveMode: RuntimeMode, policy: RuntimeModePolicy) {
    const guidance = policy === "local_only"
      ? "Only local runtime mode is available. Remove the runtimeMode override or change RUNTIME_MODE_POLICY."
      : policy === "docker_only"
        ? "Only docker runtime mode is available. Remove the runtimeMode override or change RUNTIME_MODE_POLICY."
        : `Mode '${selectedMode}' is not available in the current environment.`;
    super(`Runtime mode '${selectedMode}' denied under '${policy}' policy. ${guidance}`);
    this.name = "RuntimeModeDenialError";
    this.code = "RUNTIME_MODE_DENIED";
    this.selectedMode = selectedMode;
    this.effectiveMode = effectiveMode;
    this.policy = policy;
    this.guidance = guidance;
  }
}

function expandHomeDir(inputPath: string): string {
  if (inputPath === "~") {
    return os.homedir();
  }
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

/**
 * Validate and canonicalize a working directory path.
 * Returns a normalized WorkingDirectoryPolicy on success, throws WorkdirValidationError on failure.
 */
export async function validateWorkingDirectory(
  inputPath: string,
  config: PolicyServiceConfig = DEFAULT_CONFIG
): Promise<WorkingDirectoryPolicy> {
  const expandedInputPath = expandHomeDir(inputPath);
  const absolutePath = path.resolve(expandedInputPath);

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

  return {
    inputPath,
    resolvedPath,
    runtimeMode: config.runtimeMode,
  };
}
