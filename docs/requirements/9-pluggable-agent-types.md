# Requirement: Pluggable Agent Types and Runtime Selection

## Summary

The platform must support multiple agent implementations selectable at runtime, rather than a single hard-wired step loop.

Agent type must be an executable runtime decision with a shared contract, not metadata-only labeling.

## Problem

A single fixed agent loop limits experimentation, specialization, and reliability tuning.

Current gaps include:

- no meaningful runtime behavior difference by `agentType`
- difficult A/B evaluation between agent strategies
- constrained roadmap for specialized agents (planner, reviewer, browser-heavy, etc.)

## Scope

This requirement defines:

- agent abstraction contract
- runtime selection and fallback behavior
- registration and lifecycle for multiple agent types
- observability per agent type

This requirement does not prescribe specific algorithm internals for each agent.

## User Stories

### Primary

As a user, I want to choose an agent type suited to my task so I can optimize for speed, quality, or safety.

### Platform

As an engineer, I want to add a new agent implementation without rewriting orchestration plumbing.

### Operations

As an operator, I want metrics by agent type so I can compare outcomes and detect regressions.

## Functional Requirements

## 1. Agent Interface Contract

The runtime must define a shared agent interface with at least:

- `initialize(context)`
- `runStep(state)`
- `handleSteering(input)`
- `finalize(outcome)`

All agent implementations must conform to this interface.

## 2. Agent Registry

The system must include an `AgentRegistry` that maps `agentType` identifiers to implementations and capability metadata.

Registry entries must include:

- stable agent type ID
- human-readable name
- capability tags
- status (`beta`, `ga`, `deprecated`)

## 3. Runtime Selection

Session creation must support selecting agent type by:

- explicit per-session value
- user default
- system default fallback

If selected agent type is unavailable, run creation must fail with a typed error or policy-defined fallback.

## 4. Concurrency and Attempt Model

The daemon/runtime must support scheduling runs independently of a single implementation lock.

At minimum, concurrency controls must not assume only one hard-coded loop implementation.

## 5. Capability Negotiation

Agent type selection must validate compatibility with enabled tools/providers/policies.

Incompatible combinations must be rejected pre-run with machine-readable reason codes.

## 6. Observability by Agent Type

Run metadata and events must include:

- selected agent type
- effective agent type after fallback/policy
- version or build identifier

Metrics must be segmentable by agent type for success rate, latency, and failure reasons.

## 7. Backward Compatibility

Existing default behavior must remain available through a designated `default` agent type.

Legacy sessions without explicit `agentType` must continue to run via configured default mapping.

## Acceptance Criteria

1. At least two agent implementations can be registered and selected at session creation.
2. `agentType` affects runtime behavior through implementation selection, not metadata only.
3. Invalid or unavailable agent type selections fail with machine-readable reason codes.
4. Run events and metadata include selected/effective agent type.
5. Adding a new agent type requires registry registration, not core loop rewrite.

## Implementation Notes

- Extract current step loop into a `default` agent implementation first, then generalize.
- Keep shared orchestration (status transitions, persistence, policy checks) outside agent-specific logic.
- Add integration tests that assert agent dispatch correctness for each registered type.

## Open Questions

- Should agent-type availability be role-gated or workspace-gated?
- How should long-lived sessions handle deprecation of an agent type mid-run?
