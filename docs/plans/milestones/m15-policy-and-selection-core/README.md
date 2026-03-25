# Milestone 15: Policy and Selection Core

## Overview
Establish shared contracts and precedence resolution primitives used by runtime mode, provider/model, agent type, and tool/provider policy decisions.

## Dependencies
- [ ] Milestone 14: `m14-tooling-ladder-write-validate-and-observability`

## Changes Required
- Add shared typed contracts for runtime mode policy, approval/pause metadata, provider/model selection envelopes, and repo-config metadata.
- Add a server-side selection resolver service that applies layered system/user/session precedence with explicit allow/deny reasons.
- Extend session create validation to consume shared resolver outputs for runtime mode, provider/model, and agent type.
- Source plan section: [Phase 1 in `docs/plans/4-stretch-goals.md`](../../4-stretch-goals.md).

## Success Criteria

### Automated Verification
- [ ] `npm run typecheck --workspace=packages/shared`
- [ ] `npm run test --workspace=apps/server`

### Manual Verification
- [ ] Precedence behavior is consistent across runtime mode, provider/model, and agent type.
- [ ] Disallowed selections return typed pre-run failures with actionable reason codes.

## Tasks
- [001-add-shared-selection-policy-contracts](./001-add-shared-selection-policy-contracts.md)
- [002-implement-selection-resolver-and-session-validation](./002-implement-selection-resolver-and-session-validation.md)
