/**
 * Agent Registry — maps agentType values to shared runtime implementations.
 * Dispatches step-loop execution through registered agent type handlers.
 */
import type { AgentTypeMetadata } from "@humanlayer/shared";
import type { StepLoopOptions, StepLoopResult } from "./stepLoop.js";

export interface AgentImplementation {
  metadata: AgentTypeMetadata;
  /** Run the agent step loop for this agent type */
  run: (opts: StepLoopOptions) => Promise<StepLoopResult>;
}

const registry = new Map<string, AgentImplementation>();

/**
 * Register an agent implementation.
 */
export function registerAgent(agent: AgentImplementation): void {
  registry.set(agent.metadata.agentTypeId, agent);
}

/**
 * Get a registered agent implementation by type.
 */
export function getAgent(agentTypeId: string): AgentImplementation | undefined {
  return registry.get(agentTypeId);
}

/**
 * Get all registered agent implementations.
 */
export function getAllAgents(): AgentImplementation[] {
  return Array.from(registry.values());
}

/**
 * Dispatch a run to the appropriate agent implementation.
 * Falls back to the default agent if the requested type is not registered.
 */
export async function dispatchAgentRun(
  agentTypeId: string,
  opts: StepLoopOptions
): Promise<StepLoopResult> {
  const agent = registry.get(agentTypeId) ?? registry.get("default");
  if (!agent) {
    throw new Error(`No agent implementation registered for type '${agentTypeId}' and no default available`);
  }
  return agent.run(opts);
}

/**
 * Clear registry (for testing).
 */
export function clearAgentRegistry(): void {
  registry.clear();
}

/**
 * Register built-in agent types. Called once during agent initialization.
 */
export function registerBuiltinAgents(
  defaultRunner: (opts: StepLoopOptions) => Promise<StepLoopResult>
): void {
  registerAgent({
    metadata: {
      agentTypeId: "default",
      displayName: "Default Agent",
      compatibleProviders: ["openai", "anthropic"],
      isDefault: true,
    },
    run: defaultRunner,
  });

  registerAgent({
    metadata: {
      agentTypeId: "coding",
      displayName: "Coding Agent",
      compatibleProviders: ["openai", "anthropic"],
      isDefault: false,
    },
    // Coding agent uses same runner for now; specialization comes later
    run: defaultRunner,
  });
}
