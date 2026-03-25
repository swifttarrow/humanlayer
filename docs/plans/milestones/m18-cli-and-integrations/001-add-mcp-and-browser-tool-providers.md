# Task 001: Add MCP and Browser Tool Providers

## Goal
Integrate MCP and browser tool categories into registry-driven runtime discovery and policy filtering.

## Deliverables
- [ ] `apps/agent/src/providers/mcpToolProvider.ts` handles discovery, auth state, and health for MCP-backed tools.
- [ ] `apps/agent/src/providers/browserToolProvider.ts` provides browser capabilities under explicit external-action policy gates.
- [ ] Tool registry metadata reflects provider availability and policy gating in runtime selection.

## Notes
Start with minimal capability sets that validate provider lifecycle and policy contracts before scaling breadth.

## Verification
Run `npm run test --workspace=apps/agent` and verify tool availability changes based on auth and policy state.
