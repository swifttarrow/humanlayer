# Milestone 17: Extensible Runtime Core

## Overview
Refactor the runtime core around registries so tools, agent implementations, and model providers are pluggable with compatibility checks.

## Dependencies
- [ ] Milestone 16: `m16-runtime-mode-and-steering`

## Changes Required
- Introduce tool registry and agent registry abstractions and route step-loop dispatch through them.
- Introduce provider adapter interfaces and move OpenAI integration behind normalized provider contracts.
- Validate agent type and provider/model compatibility during session creation using shared selection logic.
- Source plan section: [Phase 4 in `docs/plans/4-stretch-goals.md`](../../4-stretch-goals.md).

## Success Criteria

### Automated Verification
- [x] `npm run test --workspace=apps/agent`
- [x] `npm run typecheck --workspace=apps/agent`
- [x] `npm run test --workspace=apps/server`

### Manual Verification
- [ ] At least two registered agent implementations dispatch through shared registry APIs.
- [ ] At least two model providers are selectable while OpenAI remains default.
- [ ] Tool availability reflects auth, policy, and provider discovery state.

## Tasks
- [001-add-tool-and-agent-registries-with-step-loop-dispatch](./001-add-tool-and-agent-registries-with-step-loop-dispatch.md)
- [002-add-provider-adapter-layer-and-openai-extraction](./002-add-provider-adapter-layer-and-openai-extraction.md)
- [003-enforce-agent-provider-compatibility-at-session-creation](./003-enforce-agent-provider-compatibility-at-session-creation.md)
