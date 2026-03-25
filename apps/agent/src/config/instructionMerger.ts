/**
 * Instruction Merger — deterministic merge ordering for system, repo, and user instructions.
 * Instructions are merged in priority order, with later entries overriding earlier ones.
 */
import type { InstructionSource } from "@humanlayer/shared";

/**
 * Default system instruction that forms the base layer.
 */
const SYSTEM_INSTRUCTION: InstructionSource = {
  type: "system",
  priority: 0,
  content:
    "You are a coding agent. Complete tasks step by step using tools. Search and read relevant files before making edits. Validate changes after applying them. If the working directory is empty or missing project files and the task asks to build an app/feature, bootstrap a minimal runnable project scaffold in-place using tools (run_shell and/or apply_patch), then continue implementation.",
};

/**
 * Merge instructions from multiple sources in deterministic priority order.
 * Returns a single combined system prompt string.
 *
 * Merge order: system (priority 0) < repo (priority 10-29) < user (priority 30+)
 */
export function mergeInstructions(
  repoInstructions: InstructionSource[] = [],
  userInstructions: InstructionSource[] = []
): string {
  const all: InstructionSource[] = [
    SYSTEM_INSTRUCTION,
    ...repoInstructions,
    ...userInstructions,
  ];

  // Sort by priority (stable sort preserves insertion order for equal priorities)
  all.sort((a, b) => a.priority - b.priority);

  // Join all instruction content with double newlines
  return all.map((i) => i.content.trim()).filter(Boolean).join("\n\n");
}

/**
 * Create user-level instruction source (for session-specific context).
 */
export function createUserInstruction(content: string, priority: number = 30): InstructionSource {
  return {
    type: "user",
    priority,
    content,
  };
}
