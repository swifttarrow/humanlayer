/**
 * MCP Tool Provider — handles discovery, auth state, and health for MCP-backed tools.
 * Registers MCP-discovered tools into the tool registry under policy gates.
 */
import type { ToolMetadata } from "@humanlayer/shared";
import { registerTool, type ToolDefinition, type ToolExecutionContext } from "../runner/toolRegistry.js";

export interface McpServerConfig {
  /** Unique server identifier */
  serverId: string;
  /** Display name */
  displayName: string;
  /** MCP server URL or transport config */
  url: string;
  /** Whether authentication is configured */
  authConfigured: boolean;
}

export interface McpDiscoveredTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * MCP Tool Provider state.
 */
export class McpToolProvider {
  private servers: McpServerConfig[] = [];
  private discoveredTools: Map<string, McpDiscoveredTool[]> = new Map();
  private healthStatus: Map<string, boolean> = new Map();

  /**
   * Register an MCP server configuration.
   */
  addServer(config: McpServerConfig): void {
    this.servers.push(config);
    this.healthStatus.set(config.serverId, false);
  }

  /**
   * Discover tools from a configured MCP server.
   * In production, this calls the MCP server's tool listing endpoint.
   * For now, returns an empty set — real discovery added when MCP SDK is integrated.
   */
  async discoverTools(serverId: string): Promise<McpDiscoveredTool[]> {
    const server = this.servers.find((s) => s.serverId === serverId);
    if (!server) {
      throw new Error(`MCP server '${serverId}' not configured`);
    }

    // Placeholder: real MCP discovery will use the MCP SDK
    const tools: McpDiscoveredTool[] = [];
    this.discoveredTools.set(serverId, tools);
    this.healthStatus.set(serverId, true);
    return tools;
  }

  /**
   * Check health of an MCP server.
   */
  async checkHealth(serverId: string): Promise<boolean> {
    const server = this.servers.find((s) => s.serverId === serverId);
    if (!server) return false;

    try {
      // Placeholder: real health check will ping the MCP server
      this.healthStatus.set(serverId, true);
      return true;
    } catch {
      this.healthStatus.set(serverId, false);
      return false;
    }
  }

  /**
   * Register all discovered MCP tools into the tool registry.
   */
  registerDiscoveredTools(): void {
    for (const [serverId, tools] of this.discoveredTools) {
      const server = this.servers.find((s) => s.serverId === serverId);
      if (!server) continue;

      const healthy = this.healthStatus.get(serverId) ?? false;

      for (const tool of tools) {
        const toolId = `mcp:${serverId}:${tool.name}`;
        const metadata: ToolMetadata = {
          toolId,
          displayName: `${server.displayName}: ${tool.name}`,
          providerCategory: "mcp",
          requiresAuth: !server.authConfigured,
          isExternalAction: true,
          available: healthy && server.authConfigured,
          unavailableReason: !server.authConfigured
            ? "MCP server auth not configured"
            : !healthy
              ? "MCP server unhealthy"
              : undefined,
        };

        const toolDef: ToolDefinition = {
          metadata,
          functionDef: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
          execute: async (args: Record<string, unknown>, _ctx: ToolExecutionContext) => {
            // Placeholder: real execution will call the MCP server
            return JSON.stringify({ result: "MCP tool execution not yet implemented", args });
          },
        };

        registerTool(toolDef);
      }
    }
  }

  /**
   * Get status of all configured servers.
   */
  getStatus(): Array<{ serverId: string; displayName: string; healthy: boolean; toolCount: number }> {
    return this.servers.map((s) => ({
      serverId: s.serverId,
      displayName: s.displayName,
      healthy: this.healthStatus.get(s.serverId) ?? false,
      toolCount: this.discoveredTools.get(s.serverId)?.length ?? 0,
    }));
  }
}

/**
 * Create a global MCP tool provider instance.
 */
export function createMcpToolProvider(): McpToolProvider {
  return new McpToolProvider();
}
