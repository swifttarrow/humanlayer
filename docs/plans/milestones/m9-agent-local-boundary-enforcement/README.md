# Milestone 9: Agent Local Boundary Enforcement

## Overview
Enforce server-provided policy in agent runtime and tools so local mode cannot read/write outside allowed surfaces.

## Dependencies
- [ ] Milestone 8: `m8-ui-working-directory-selection`

## Changes Required
- Carry resolved policy context from claim response through the step loop.
- Add reusable path-boundary helpers for read/write checks.
- Enforce policy in file tools, patch tool, and shell tool.
- Source plan section: [Phase 4 in `docs/plans/2-working-directory.md`](../../2-working-directory.md).

## Success Criteria

### Automated Verification
- [ ] `npm run test --workspace=apps/agent`
- [ ] `npm run typecheck --workspace=apps/agent`

### Manual Verification
- [ ] Agent runs with policy-derived default `cwd`
- [ ] Read/write attempts outside allowed roots fail safely
- [ ] Denied operations produce structured, inspectable errors/events

## Tasks
- [001-thread-policy-context-through-agent-runtime](./001-thread-policy-context-through-agent-runtime.md)
- [002-enforce-path-boundaries-across-tools](./002-enforce-path-boundaries-across-tools.md)
