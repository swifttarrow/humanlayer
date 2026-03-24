# Task 001: Thread Policy Context Through Agent Runtime

## Goal
Propagate server-normalized workdir policy from session claim to tool execution.

## Deliverables
- [x] `apps/agent/src/main.ts` reads workdir policy from claimed session metadata
- [x] `apps/agent/src/runner/stepLoop.ts` accepts policy context and passes it to tool executors
- [x] Shell tool default `cwd` is derived from resolved working directory

## Notes
Keep default behavior safe when policy metadata is absent (e.g., fallback policy or explicit rejection).

## Verification
Run an agent session and confirm command/tool execution defaults to the resolved workdir path.
