/**
 * Repo Config Schema — versioned, repo-scoped customization contracts.
 * Defines the schema for .humanlayer.json config files found at repo roots.
 */
import type { RepoTrustMode } from "./contracts.js";

export const REPO_CONFIG_SCHEMA_VERSION = "1";
export const REPO_CONFIG_FILENAME = ".humanlayer.json";

/**
 * Instruction source descriptor for merge ordering.
 */
export interface InstructionSource {
  /** Source type: builtin system prompt, repo config, or user override */
  type: "system" | "repo" | "user";
  /** Path to instruction file (for repo type) */
  path?: string;
  /** Priority: higher = later in merge order */
  priority: number;
  /** Content of the instruction block */
  content: string;
}

/**
 * Hook definition in repo config.
 */
export interface RepoHookDefinition {
  /** Hook lifecycle event */
  event: "setup" | "pre-run" | "post-run" | "validation";
  /** Command to execute */
  command: string;
  /** Working directory (relative to repo root) */
  cwd?: string;
  /** Timeout in ms */
  timeoutMs?: number;
  /** Whether hook failure blocks execution */
  blocking: boolean;
}

/**
 * Full repo config schema.
 */
export interface RepoConfig {
  /** Schema version */
  schemaVersion: string;
  /** Repo-level instructions to merge into agent system prompt */
  instructions?: string[];
  /** Instruction file paths to merge (relative to repo root) */
  instructionFiles?: string[];
  /** Hook definitions */
  hooks?: RepoHookDefinition[];
  /** Default agent type for this repo */
  defaultAgentType?: string;
  /** Default runtime mode for this repo */
  defaultRuntimeMode?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
}

/**
 * Validated and resolved repo config with trust metadata.
 */
export interface ResolvedRepoConfig {
  config: RepoConfig;
  trustMode: RepoTrustMode;
  repoRoot: string;
  configPath: string;
  /** Merged instructions in priority order */
  mergedInstructions: InstructionSource[];
  /** Hooks allowed under current trust mode */
  allowedHooks: RepoHookDefinition[];
  /** Hooks blocked under current trust mode */
  blockedHooks: Array<{ hook: RepoHookDefinition; reason: string }>;
}

/**
 * Hook execution result.
 */
export interface HookExecutionResult {
  hook: RepoHookDefinition;
  status: "completed" | "failed" | "skipped" | "blocked";
  exitCode?: number;
  output?: string;
  error?: string;
  durationMs: number;
  /** Reason if skipped or blocked */
  reason?: string;
}
