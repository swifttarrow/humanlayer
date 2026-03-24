# Milestone 7: Server Validation, Canonicalization, and Persistence

## Overview
Implement server-side validation and policy normalization at session creation, and persist normalized policy in session metadata.

## Dependencies
- [ ] Milestone 6: `m6-shared-contract-policy-model`

## Changes Required
- Extend session-create Zod validation for `workingDirectory` and optional exposed surfaces.
- Add policy normalization service for canonicalization, allowlist checks, and reason-code mapping.
- Persist original and canonical workdir policy data in session metadata.
- Source plan section: [Phase 2 in `docs/plans/2-working-directory.md`](../../2-working-directory.md).

## Success Criteria

### Automated Verification
- [x] `npm run test --workspace=apps/server`
- [x] `npm run typecheck --workspace=apps/server`

### Manual Verification
- [ ] Invalid directory requests fail before session creation
- [ ] Valid request stores both input and resolved paths in metadata
- [ ] Claim/pull response includes metadata needed for agent enforcement

## Tasks
- [001-extend-session-create-validation-and-errors](./001-extend-session-create-validation-and-errors.md)
- [002-add-workdir-policy-service-and-tests](./002-add-workdir-policy-service-and-tests.md)
