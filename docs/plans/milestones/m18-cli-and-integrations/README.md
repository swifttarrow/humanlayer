# Milestone 18: CLI and Integrations

## Overview
Ship first external integrations (MCP and browser tool categories) and a thin API-backed CLI for interactive and headless automation.

## Dependencies
- [ ] Milestone 17: `m17-extensible-runtime-core`

## Changes Required
- Implement MCP and browser tool providers and expose them through the tool registry under policy gates.
- Add a new CLI workspace with interactive and headless commands, auth/target wiring, and deterministic exit-code mapping.
- Define JSONL event streaming contract and document usage for automation workflows.
- Source plan section: [Phase 5 in `docs/plans/4-stretch-goals.md`](../../4-stretch-goals.md).

## Success Criteria

### Automated Verification
- [ ] `npm run test --workspace=apps/agent`
- [ ] `npm run test --workspace=apps/cli`
- [ ] `npm run typecheck --workspace=apps/cli`

### Manual Verification
- [ ] CLI interactive mode can run and steer sessions from terminal.
- [ ] Headless mode emits valid JSONL to stdout or file.
- [ ] Exit codes are deterministic for success, policy denial, timeout, and runtime failure.

## Tasks
- [001-add-mcp-and-browser-tool-providers](./001-add-mcp-and-browser-tool-providers.md)
- [002-create-cli-workspace-and-run-commands](./002-create-cli-workspace-and-run-commands.md)
- [003-define-jsonl-contract-and-cli-docs](./003-define-jsonl-contract-and-cli-docs.md)
