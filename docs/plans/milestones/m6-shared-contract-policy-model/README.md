# Milestone 6: Shared Contract + Policy Model

## Overview
Define the typed policy envelope and session request contract that all components consume.

## Dependencies
- [x] Milestone 5: `m5-reliability-sweep-docker-compose-docs-demo`

## Changes Required
- Add `workingDirectory` request support and shared policy DTOs in `packages/shared/src/contracts.ts`.
- Align requirement wording in `docs/requirements/2-working-directory.md` with implementation defaults.
- Source plan section: [Phase 1 in `docs/plans/2-working-directory.md`](../../2-working-directory.md).

## Success Criteria

### Automated Verification
- [x] `npm run typecheck --workspace=packages/shared`
- [x] `npm run lint --workspace=packages/shared`

### Manual Verification
- [ ] Shared types clearly describe local vs docker runtime policy
- [ ] Error reason codes map to requirement (`WORKDIR_NOT_FOUND`, etc.)

## Tasks
- [001-add-shared-workdir-policy-contracts](./001-add-shared-workdir-policy-contracts.md)
- [002-align-requirement-language-with-contract](./002-align-requirement-language-with-contract.md)
