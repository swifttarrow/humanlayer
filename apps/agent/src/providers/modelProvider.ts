/**
 * Model Provider Interface — normalized abstraction for LLM provider integration.
 * All providers implement this interface for use by the step loop.
 */

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ProviderToolCall[];
  tool_call_id?: string;
}

export interface ProviderToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ProviderToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ProviderCompletionResult {
  content: string | null;
  tool_calls: ProviderToolCall[];
}

export interface ProviderStreamDelta {
  content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: "function";
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

export interface ProviderCapabilities {
  streaming: boolean;
  toolUse: boolean;
  extendedThinking: boolean;
}

/**
 * Normalized error for provider-level failures.
 */
export class ProviderError extends Error {
  code: string;
  statusCode?: number;
  retryable: boolean;

  constructor(code: string, message: string, opts?: { statusCode?: number; retryable?: boolean }) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.statusCode = opts?.statusCode;
    this.retryable = opts?.retryable ?? false;
  }
}

/**
 * Model Provider interface — all providers must implement this.
 */
export interface ModelProvider {
  /** Unique provider identifier */
  readonly providerId: string;

  /** Human-readable display name */
  readonly displayName: string;

  /** List of supported model IDs */
  readonly supportedModels: string[];

  /** Provider capabilities */
  readonly capabilities: ProviderCapabilities;

  /** Check if credentials are configured */
  isAvailable(): boolean;

  /** Call the completion API with streaming delta callback */
  complete(
    messages: ProviderMessage[],
    tools: ProviderToolDefinition[],
    model: string,
    onDelta?: (delta: ProviderStreamDelta) => void
  ): Promise<ProviderCompletionResult>;
}

// ---- Provider Registry ----

const providers = new Map<string, ModelProvider>();

export function registerProvider(provider: ModelProvider): void {
  providers.set(provider.providerId, provider);
}

export function getProvider(providerId: string): ModelProvider | undefined {
  return providers.get(providerId);
}

export function getAllProviders(): ModelProvider[] {
  return Array.from(providers.values());
}

export function getAvailableProviders(): ModelProvider[] {
  return getAllProviders().filter((p) => p.isAvailable());
}

export function clearProviderRegistry(): void {
  providers.clear();
}
