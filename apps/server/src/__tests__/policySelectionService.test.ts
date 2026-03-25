import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveRuntimeMode,
  resolveAgentType,
  resolveProvider,
  resolveModel,
  checkAgentProviderCompatibility,
  resolveSessionSelections,
} from "../services/policySelectionService.js";

describe("policySelectionService", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    // Reset to known state
    process.env.RUNTIME_MODE_POLICY = "dual_mode";
    process.env.RUNTIME_MODE = "local";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.ANTHROPIC_API_KEY = "";
    process.env.DEFAULT_PROVIDER = "openai";
    process.env.DEFAULT_MODEL = "gpt-4.1-mini";
    process.env.DEFAULT_AGENT_TYPE = "default";
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  describe("resolveRuntimeMode", () => {
    it("returns system default when no override", () => {
      const result = resolveRuntimeMode();
      expect(result.outcome).toBe("allowed");
      expect(result.value).toBe("local");
      expect(result.decidedBy).toBe("system");
    });

    it("allows docker in dual_mode policy", () => {
      const result = resolveRuntimeMode("docker");
      expect(result.outcome).toBe("allowed");
      expect(result.value).toBe("docker");
      expect(result.decidedBy).toBe("session");
    });

    it("denies docker in local_only policy", () => {
      process.env.RUNTIME_MODE_POLICY = "local_only";
      const result = resolveRuntimeMode("docker");
      expect(result.outcome).toBe("denied");
      expect(result.reason).toBe("RUNTIME_MODE_POLICY_DENIED");
    });

    it("denies local in docker_only policy", () => {
      process.env.RUNTIME_MODE_POLICY = "docker_only";
      const result = resolveRuntimeMode("local");
      expect(result.outcome).toBe("denied");
      expect(result.reason).toBe("RUNTIME_MODE_POLICY_DENIED");
    });
  });

  describe("resolveAgentType", () => {
    it("returns default agent type when none specified", () => {
      const result = resolveAgentType();
      expect(result.outcome).toBe("allowed");
      expect(result.value).toBe("default");
    });

    it("allows known agent type", () => {
      const result = resolveAgentType("coding");
      expect(result.outcome).toBe("allowed");
      expect(result.value).toBe("coding");
    });

    it("denies unknown agent type", () => {
      const result = resolveAgentType("unknown_type");
      expect(result.outcome).toBe("denied");
      expect(result.reason).toBe("AGENT_TYPE_NOT_REGISTERED");
    });
  });

  describe("resolveProvider", () => {
    it("returns default provider when none specified (lenient)", () => {
      // Even without API key, default provider is allowed (resolved at agent runtime)
      process.env.OPENAI_API_KEY = "";
      const result = resolveProvider();
      expect(result.outcome).toBe("allowed");
      expect(result.value).toBe("openai");
      expect(result.decidedBy).toBe("system");
    });

    it("denies unavailable provider when explicitly requested", () => {
      process.env.ANTHROPIC_API_KEY = "";
      const result = resolveProvider("anthropic");
      expect(result.outcome).toBe("denied");
      expect(result.reason).toBe("PROVIDER_NOT_AVAILABLE");
    });

    it("denies unknown provider when explicitly requested", () => {
      const result = resolveProvider("unknown_provider");
      expect(result.outcome).toBe("denied");
      expect(result.reason).toBe("PROVIDER_NOT_REGISTERED");
    });

    it("allows available provider when explicitly requested", () => {
      process.env.OPENAI_API_KEY = "test-key";
      const result = resolveProvider("openai");
      expect(result.outcome).toBe("allowed");
      expect(result.value).toBe("openai");
      expect(result.decidedBy).toBe("session");
    });
  });

  describe("resolveModel", () => {
    it("allows known model for provider", () => {
      const result = resolveModel("openai", "gpt-4o");
      expect(result.outcome).toBe("allowed");
      expect(result.value).toBe("gpt-4o");
    });

    it("denies unsupported model", () => {
      const result = resolveModel("openai", "nonexistent-model");
      expect(result.outcome).toBe("denied");
      expect(result.reason).toBe("MODEL_NOT_SUPPORTED");
    });
  });

  describe("checkAgentProviderCompatibility", () => {
    it("allows compatible agent and provider", () => {
      const result = checkAgentProviderCompatibility("default", "openai");
      expect(result.outcome).toBe("allowed");
    });

    it("denies unknown agent type", () => {
      const result = checkAgentProviderCompatibility("bogus", "openai");
      expect(result.outcome).toBe("denied");
      expect(result.reason).toBe("AGENT_TYPE_NOT_REGISTERED");
    });
  });

  describe("resolveSessionSelections", () => {
    it("resolves all defaults with no overrides", () => {
      const result = resolveSessionSelections({});
      expect(result.overall).toBe("allowed");
      expect(result.denials).toHaveLength(0);
      expect(result.runtimeMode.value).toBe("local");
      expect(result.agentType.value).toBe("default");
      expect(result.provider.value).toBe("openai");
      expect(result.model.value).toBe("gpt-4.1-mini");
    });

    it("returns denials for invalid runtime mode under policy", () => {
      process.env.RUNTIME_MODE_POLICY = "local_only";
      const result = resolveSessionSelections({ runtimeMode: "docker" });
      expect(result.overall).toBe("denied");
      expect(result.denials.length).toBeGreaterThan(0);
      expect(result.denials[0].field).toBe("runtimeMode");
      expect(result.denials[0].reason).toBe("RUNTIME_MODE_POLICY_DENIED");
    });

    it("returns denials for explicitly requested unknown provider", () => {
      const result = resolveSessionSelections({ provider: "fake" });
      expect(result.overall).toBe("denied");
      expect(result.denials.some((d) => d.field === "provider")).toBe(true);
    });

    it("returns denials for explicitly requested unsupported model", () => {
      const result = resolveSessionSelections({ model: "nonexistent" });
      expect(result.overall).toBe("denied");
      expect(result.denials.some((d) => d.field === "model")).toBe(true);
    });
  });
});
