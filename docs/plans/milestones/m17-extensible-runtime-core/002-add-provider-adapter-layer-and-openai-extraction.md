# Task 002: Add Provider Adapter Layer and OpenAI Extraction

## Goal
Normalize model-provider integration behind a provider interface while preserving current OpenAI behavior by default.

## Deliverables
- [x] `apps/agent/src/providers/modelProvider.ts` defines provider capability, invocation, and normalized error interfaces.
- [x] `apps/agent/src/providers/openaiProvider.ts` encapsulates existing OpenAI implementation behind the adapter contract.
- [x] Provider registration supports selecting at least one non-OpenAI provider path for compatibility checks.

## Notes
Preserve current environment-based defaults so rollout is non-breaking.

## Verification
Run `npm run typecheck --workspace=apps/agent && npm run test --workspace=apps/agent` and verify provider selection and fallback behavior.
