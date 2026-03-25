/**
 * Tool Registry — registry-backed tool dispatch for the agent step loop.
 * Tools register with metadata and execution handlers.
 */
import type { ToolMetadata } from "@humanlayer/shared";

export interface ToolExecutionContext {
  cwd: string;
  sessionId: string;
  attemptId: string;
}

export interface ToolDefinition {
  metadata: ToolMetadata;
  /** OpenAI-compatible function definition */
  functionDef: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  /** Execute the tool with parsed arguments */
  execute: (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<string>;
  /** Optional validation hook before execution */
  validate?: (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<void>;
}

const registry = new Map<string, ToolDefinition>();

/**
 * Register a tool in the registry.
 */
export function registerTool(tool: ToolDefinition): void {
  registry.set(tool.metadata.toolId, tool);
}

/**
 * Get a registered tool by ID.
 */
export function getTool(toolId: string): ToolDefinition | undefined {
  return registry.get(toolId);
}

/**
 * Get all registered tools.
 */
export function getAllTools(): ToolDefinition[] {
  return Array.from(registry.values());
}

/**
 * Get available tools filtered by policy state.
 */
export function getAvailableTools(): ToolDefinition[] {
  return getAllTools().filter((t) => t.metadata.available);
}

/**
 * Get OpenAI-compatible tool definitions for available tools.
 */
export function getOpenAIToolDefinitions(): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return getAvailableTools().map((t) => ({
    type: "function" as const,
    function: t.functionDef,
  }));
}

/**
 * Execute a tool by name with parsed arguments.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<string> {
  const tool = registry.get(toolName);
  if (!tool) {
    throw new Error(`Tool '${toolName}' is not registered`);
  }
  if (!tool.metadata.available) {
    throw new Error(`Tool '${toolName}' is not available: ${tool.metadata.unavailableReason ?? "unknown reason"}`);
  }
  if (tool.validate) {
    await tool.validate(args, ctx);
  }
  return tool.execute(args, ctx);
}

/**
 * Clear registry (for testing).
 */
export function clearRegistry(): void {
  registry.clear();
}

/**
 * Register built-in tools. Called once during agent initialization.
 */
export function registerBuiltinTools(): void {
  registerTool({
    metadata: {
      toolId: "search_files",
      displayName: "Search Files",
      providerCategory: "builtin",
      requiresAuth: false,
      isExternalAction: false,
      available: true,
    },
    functionDef: {
      name: "search_files",
      description: "Search for files matching a glob pattern or containing a string",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern or search string" },
          type: { type: "string", enum: ["glob", "content"], description: "Search type" },
          path: { type: "string", description: "Directory to search (default: cwd)" },
        },
        required: ["pattern", "type"],
      },
    },
    execute: async () => "Delegated to stepLoop inline handler",
  });

  registerTool({
    metadata: {
      toolId: "read_file",
      displayName: "Read File",
      providerCategory: "builtin",
      requiresAuth: false,
      isExternalAction: false,
      available: true,
    },
    functionDef: {
      name: "read_file",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
        },
        required: ["path"],
      },
    },
    execute: async () => "Delegated to stepLoop inline handler",
  });

  registerTool({
    metadata: {
      toolId: "read_file_range",
      displayName: "Read File Range",
      providerCategory: "builtin",
      requiresAuth: false,
      isExternalAction: false,
      available: true,
    },
    functionDef: {
      name: "read_file_range",
      description: "Read a specific line range from a file. Prefer this over read_file for targeted context gathering.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
          start_line: { type: "number", description: "1-based start line (inclusive)" },
          end_line: { type: "number", description: "1-based end line (inclusive). Max 200 lines per call." },
        },
        required: ["path", "start_line", "end_line"],
      },
    },
    execute: async () => "Delegated to stepLoop inline handler",
  });

  registerTool({
    metadata: {
      toolId: "apply_patch",
      displayName: "Apply Patch",
      providerCategory: "builtin",
      requiresAuth: false,
      isExternalAction: false,
      available: true,
    },
    functionDef: {
      name: "apply_patch",
      description: "Apply a unified diff patch to a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Target file path" },
          patch: { type: "string", description: "Unified diff content" },
        },
        required: ["path", "patch"],
      },
    },
    execute: async () => "Delegated to stepLoop inline handler",
  });

  registerTool({
    metadata: {
      toolId: "run_shell",
      displayName: "Run Shell",
      providerCategory: "builtin",
      requiresAuth: false,
      isExternalAction: true,
      available: true,
    },
    functionDef: {
      name: "run_shell",
      description: "Run a shell command (non-interactive). Use for tests, builds, etc.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          cwd: { type: "string", description: "Working directory (default: cwd)" },
        },
        required: ["command"],
      },
    },
    execute: async () => "Delegated to stepLoop inline handler",
  });
}
