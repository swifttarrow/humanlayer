# Requirement: Repository-Scoped Customization, Skills, and Hooks

## Summary

The platform must support repository-level runtime customization through a versioned config surface that can define skills/instructions and setup/pre-commit hook behavior.

Customization must be explicit, auditable, and policy-governed to avoid hidden behavior.

## Problem

Without repo-scoped customization:

- teams cannot encode repo-specific conventions for agents
- setup and validation behavior must be repeated manually across sessions
- onboarding quality varies by individual prompt quality

## Scope

This requirement defines:

- repo-local configuration discovery
- repo-scoped skills/instruction loading
- setup and pre-commit hook contracts
- safety and policy controls for hook execution

This requirement does not mandate a specific file/folder naming convention in MVP.

## User Stories

### Primary

As a repository maintainer, I want to define repo-specific agent behavior so runs follow project conventions by default.

### Consistency

As a developer, I want setup/pre-commit automation to run consistently so generated changes match team quality gates.

### Safety

As an admin, I want hook execution to be policy-controlled so repo config cannot bypass platform guardrails.

## Functional Requirements

## 1. Repo Configuration Discovery

The runtime must detect an optional repo-level config from the working directory scope.

Discovery rules must be deterministic and documented, including precedence between:

- repo config
- workspace/global defaults
- user/session overrides

## 2. Repo-Scoped Skills/Instructions

Repo config must support declarative skills/instructions that are injected into run context before task execution.

Instruction loading must include:

- source path metadata
- merge order metadata
- conflict resolution behavior

## 3. Setup Hook Contract

The platform must support optional setup hooks executed before agent task steps begin.

Setup hooks must support:

- command/script declaration
- timeout controls
- fail-fast policy (block run on failure or continue with warning)

Hook output must be captured in run artifacts.

## 4. Pre-Commit/Validation Hook Contract

The platform must support optional post-edit validation hooks before finalization.

At minimum, hooks must be able to:

- run lint/test/format checks
- return pass/fail status with logs
- gate completion status when configured

## 5. Policy and Security Controls

Hook and repo-skill execution must be policy-gated.

Policy must control:

- whether repo config is trusted by default
- which commands or directories hooks may access
- whether network access is allowed during hooks

Untrusted or disallowed hooks must be skipped or blocked with explicit reason codes.

## 6. Observability and Auditability

The run timeline must include:

- repo config detected or not detected
- loaded skills/instructions list
- setup and validation hook execution records
- hook exit codes and durations

## 7. Versioning and Compatibility

Repo config schema must be versioned.

Unsupported schema versions must fail clearly with migration guidance.

## Acceptance Criteria

1. A repo can define a config that is discovered and loaded automatically at run start.
2. Repo-scoped instructions are merged into run context with deterministic precedence.
3. Optional setup hooks can execute pre-task with timeout and failure policy controls.
4. Optional validation hooks can gate final run outcome when configured.
5. Policy can disable or restrict hook execution independent of repo config.
6. Run artifacts capture loaded config details and hook execution outcomes.

## Implementation Notes

- Start with read-only instruction loading before enabling executable hooks by default.
- Use explicit trust mode (`trusted`, `restricted`, `disabled`) for repo config execution.
- Keep hook execution environment close to normal run environment to reduce drift.

## Open Questions

- Should repo config be loaded from repository root only, or nearest ancestor within working directory?
- Should teams be able to require signed repo config files for trusted mode?
