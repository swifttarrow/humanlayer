/**
 * Repo Config Loader — discovers and loads .humanlayer.json from the working directory.
 * Applies trust-mode filtering to hooks and instructions.
 */
import { readFile, stat } from "fs/promises";
import path from "path";
import type { RepoTrustMode } from "@humanlayer/shared";
import type { RepoConfig, ResolvedRepoConfig, RepoHookDefinition, InstructionSource } from "@humanlayer/shared";
import { REPO_CONFIG_FILENAME, REPO_CONFIG_SCHEMA_VERSION } from "@humanlayer/shared";

function getTrustMode(): RepoTrustMode {
  const val = process.env.REPO_TRUST_MODE;
  if (val === "trusted" || val === "restricted" || val === "disabled") return val;
  return "restricted";
}

/**
 * Walk up from workdir to find repo root (contains .git or config file).
 */
async function findRepoRoot(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (current !== root) {
    try {
      await stat(path.join(current, ".git"));
      return current;
    } catch {
      // Not a git repo root, try parent
    }
    try {
      await stat(path.join(current, REPO_CONFIG_FILENAME));
      return current;
    } catch {
      // No config here either
    }
    current = path.dirname(current);
  }
  return null;
}

/**
 * Load and parse repo config from a directory.
 */
async function loadConfigFile(repoRoot: string): Promise<RepoConfig | null> {
  const configPath = path.join(repoRoot, REPO_CONFIG_FILENAME);
  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as RepoConfig;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Filter hooks by trust mode.
 */
function filterHooks(
  hooks: RepoHookDefinition[],
  trustMode: RepoTrustMode
): { allowed: RepoHookDefinition[]; blocked: Array<{ hook: RepoHookDefinition; reason: string }> } {
  if (trustMode === "disabled") {
    return {
      allowed: [],
      blocked: hooks.map((h) => ({ hook: h, reason: "Hooks disabled by trust mode" })),
    };
  }

  if (trustMode === "trusted") {
    return { allowed: hooks, blocked: [] };
  }

  // Restricted: only allow non-blocking hooks
  const allowed: RepoHookDefinition[] = [];
  const blocked: Array<{ hook: RepoHookDefinition; reason: string }> = [];
  for (const hook of hooks) {
    if (hook.blocking) {
      blocked.push({ hook, reason: "Blocking hooks not allowed in restricted trust mode" });
    } else {
      allowed.push(hook);
    }
  }
  return { allowed, blocked };
}

/**
 * Discover, load, and resolve repo config for a working directory.
 * Returns null if no config is found.
 */
export async function loadRepoConfig(workdir: string): Promise<ResolvedRepoConfig | null> {
  const repoRoot = await findRepoRoot(workdir);
  if (!repoRoot) return null;

  const config = await loadConfigFile(repoRoot);
  if (!config) return null;

  const trustMode = getTrustMode();
  const configPath = path.join(repoRoot, REPO_CONFIG_FILENAME);

  // Build merged instructions
  const mergedInstructions: InstructionSource[] = [];

  // Inline instructions from config
  if (config.instructions) {
    for (let i = 0; i < config.instructions.length; i++) {
      mergedInstructions.push({
        type: "repo",
        priority: 10 + i,
        content: config.instructions[i],
      });
    }
  }

  // File-based instructions
  if (config.instructionFiles && trustMode !== "disabled") {
    for (let i = 0; i < config.instructionFiles.length; i++) {
      const filePath = path.join(repoRoot, config.instructionFiles[i]);
      try {
        const content = await readFile(filePath, "utf-8");
        mergedInstructions.push({
          type: "repo",
          path: config.instructionFiles[i],
          priority: 20 + i,
          content,
        });
      } catch {
        // Skip missing instruction files
      }
    }
  }

  // Filter hooks by trust mode
  const { allowed: allowedHooks, blocked: blockedHooks } = filterHooks(
    config.hooks ?? [],
    trustMode
  );

  return {
    config,
    trustMode,
    repoRoot,
    configPath,
    mergedInstructions,
    allowedHooks,
    blockedHooks,
  };
}
