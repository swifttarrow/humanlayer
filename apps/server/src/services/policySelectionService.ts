import type {
  RuntimeMode,
  RuntimeModePolicy,
  SelectionLayer,
  SelectionResult,
  SelectionDenialReason,
  SessionSelectionResult,
  ProviderCapability,
  AgentTypeMetadata,
} from "@humanlayer/shared";

// ============================================================
// Configuration — read from env with sensible defaults
// ============================================================

function getRuntimeModePolicy(): RuntimeModePolicy {
  const val = process.env.RUNTIME_MODE_POLICY;
  if (val === "local_only" || val === "docker_only" || val === "dual_mode") return val;
  return "local_only";
}

function getDefaultRuntimeMode(): RuntimeMode {
  const val = process.env.RUNTIME_MODE;
  if (val === "local" || val === "docker") return val;
  return "local";
}

function getDefaultProvider(): string {
  return process.env.DEFAULT_PROVIDER ?? "openai";
}

function getDefaultModel(): string {
  return process.env.DEFAULT_MODEL ?? process.env.AGENT_MODEL ?? "gpt-4.1-mini";
}

function getDefaultAgentType(): string {
  return process.env.DEFAULT_AGENT_TYPE ?? "default";
}

// ============================================================
// Known registrations — extensible via registries in M17
// ============================================================

function getKnownProvidersInternal(): ProviderCapability[] {
  return [
    {
      providerId: "openai",
      displayName: "OpenAI",
      supportedModels: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o", "gpt-4o-mini", "o1-mini", "o1"],
      supportedAgentTypes: ["default", "coding"],
      available: !!process.env.OPENAI_API_KEY,
    },
    {
      providerId: "anthropic",
      displayName: "Anthropic",
      supportedModels: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001", "claude-opus-4-20250514"],
      supportedAgentTypes: ["default", "coding"],
      available: !!process.env.ANTHROPIC_API_KEY,
    },
  ];
}

const KNOWN_AGENT_TYPES: AgentTypeMetadata[] = [
  {
    agentTypeId: "default",
    displayName: "Default Agent",
    compatibleProviders: ["openai", "anthropic"],
    isDefault: true,
  },
  {
    agentTypeId: "coding",
    displayName: "Coding Agent",
    compatibleProviders: ["openai", "anthropic"],
    isDefault: false,
  },
];

// ============================================================
// Resolver entrypoint
// ============================================================

export interface SelectionInput {
  /** Requested runtime mode (session-layer override) */
  runtimeMode?: RuntimeMode;
  /** Requested agent type */
  agentType?: string;
  /** Requested provider */
  provider?: string;
  /** Requested model */
  model?: string;
}

function denied<T>(
  reason: SelectionDenialReason,
  message: string,
  decidedBy: SelectionLayer
): SelectionResult<T> {
  return { outcome: "denied", decidedBy, reason, message };
}

function allowed<T>(value: T, decidedBy: SelectionLayer): SelectionResult<T> {
  return { outcome: "allowed", value, decidedBy };
}

/**
 * Resolve runtime mode selection against system policy.
 */
export function resolveRuntimeMode(requested?: RuntimeMode): SelectionResult<RuntimeMode> {
  const policy = getRuntimeModePolicy();
  const systemDefault = getDefaultRuntimeMode();

  if (!requested) {
    // No session override: use system default
    return allowed(systemDefault, "system");
  }

  // Validate against policy
  switch (policy) {
    case "local_only":
      if (requested !== "local") {
        return denied(
          "RUNTIME_MODE_POLICY_DENIED",
          `Runtime mode '${requested}' is not allowed under 'local_only' policy`,
          "system"
        );
      }
      return allowed(requested, "session");

    case "docker_only":
      if (requested !== "docker") {
        return denied(
          "RUNTIME_MODE_POLICY_DENIED",
          `Runtime mode '${requested}' is not allowed under 'docker_only' policy`,
          "system"
        );
      }
      return allowed(requested, "session");

    case "dual_mode":
      if (requested !== "local" && requested !== "docker") {
        return denied(
          "RUNTIME_MODE_NOT_AVAILABLE",
          `Unknown runtime mode '${requested}'`,
          "session"
        );
      }
      return allowed(requested, "session");

    default:
      return allowed(systemDefault, "system");
  }
}

/**
 * Resolve agent type selection.
 */
export function resolveAgentType(requested?: string): SelectionResult<string> {
  const defaultType = getDefaultAgentType();
  const agentType = requested ?? defaultType;
  const meta = KNOWN_AGENT_TYPES.find((a) => a.agentTypeId === agentType);

  if (!meta) {
    return denied(
      "AGENT_TYPE_NOT_REGISTERED",
      `Agent type '${agentType}' is not registered`,
      requested ? "session" : "system"
    );
  }

  return allowed(agentType, requested ? "session" : "system");
}

/**
 * Resolve provider selection.
 * When no provider is explicitly requested, availability is not enforced
 * (the agent will resolve at runtime).
 */
export function resolveProvider(requested?: string): SelectionResult<string> {
  const defaultProv = getDefaultProvider();
  const provider = requested ?? defaultProv;
  const cap = getKnownProvidersInternal().find((p) => p.providerId === provider);

  // Only strictly validate when explicitly requested
  if (requested) {
    if (!cap) {
      return denied(
        "PROVIDER_NOT_REGISTERED",
        `Provider '${provider}' is not registered`,
        "session"
      );
    }
    if (!cap.available) {
      return denied(
        "PROVIDER_NOT_AVAILABLE",
        `Provider '${provider}' is not available (missing credentials)`,
        "session"
      );
    }
  }

  return allowed(provider, requested ? "session" : "system");
}

/**
 * Resolve model selection within a provider.
 * When no model is explicitly requested, compatibility is not enforced.
 */
export function resolveModel(provider: string, requested?: string): SelectionResult<string> {
  const model = requested ?? getDefaultModel();

  // Only strictly validate when explicitly requested
  if (requested) {
    const cap = getKnownProvidersInternal().find((p) => p.providerId === provider);
    if (!cap) {
      return denied("PROVIDER_NOT_REGISTERED", `Provider '${provider}' is not registered`, "system");
    }
    if (!cap.supportedModels.includes(model)) {
      return denied(
        "MODEL_NOT_SUPPORTED",
        `Model '${model}' is not supported by provider '${provider}'`,
        requested ? "session" : "system"
      );
    }
  }

  return allowed(model, requested ? "session" : "system");
}

/**
 * Check agent type and provider compatibility.
 */
export function checkAgentProviderCompatibility(
  agentType: string,
  provider: string
): SelectionResult<string> {
  const agentMeta = KNOWN_AGENT_TYPES.find((a) => a.agentTypeId === agentType);
  if (!agentMeta) {
    return denied("AGENT_TYPE_NOT_REGISTERED", `Agent type '${agentType}' is not registered`, "system");
  }

  if (!agentMeta.compatibleProviders.includes(provider)) {
    return denied(
      "AGENT_PROVIDER_INCOMPATIBLE",
      `Agent type '${agentType}' is not compatible with provider '${provider}'`,
      "system"
    );
  }

  return allowed(`${agentType}:${provider}`, "system");
}

/**
 * Resolve all session-creation selections in a single pass.
 * Returns typed results with allow/deny reasons for each field.
 */
export function resolveSessionSelections(input: SelectionInput): SessionSelectionResult {
  const runtimeMode = resolveRuntimeMode(input.runtimeMode);
  const agentType = resolveAgentType(input.agentType);
  const provider = resolveProvider(input.provider);

  // Model resolution depends on provider being resolved
  const model = provider.outcome === "allowed"
    ? resolveModel(provider.value!, input.model)
    : denied<string>("PROVIDER_NOT_REGISTERED", "Cannot resolve model without valid provider", "system");

  // Compatibility check if both agent type and provider are resolved
  if (agentType.outcome === "allowed" && provider.outcome === "allowed") {
    const compat = checkAgentProviderCompatibility(agentType.value!, provider.value!);
    if (compat.outcome === "denied") {
      // Add as a denial on agent type
      agentType.outcome = "denied";
      agentType.reason = compat.reason;
      agentType.message = compat.message;
    }
  }

  const denials: SessionSelectionResult["denials"] = [];
  for (const [field, result] of Object.entries({ runtimeMode, agentType, provider, model })) {
    if (result.outcome === "denied" && result.reason && result.message) {
      denials.push({ field, reason: result.reason, message: result.message });
    }
  }

  return {
    runtimeMode,
    agentType,
    provider,
    model,
    overall: denials.length > 0 ? "denied" : "allowed",
    denials,
  };
}

/**
 * Return known providers list for UI display.
 */
export function getKnownProviders(): ProviderCapability[] {
  return getKnownProvidersInternal().map((p) => ({ ...p }));
}

/**
 * Return known agent types list for UI display.
 */
export function getKnownAgentTypes(): AgentTypeMetadata[] {
  return KNOWN_AGENT_TYPES.map((a) => ({ ...a }));
}
