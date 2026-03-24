# Milestone 8: UI Working Directory Selection

## Overview
Implement UI-based working-directory selection so users can configure path policy from the product surface, not only APIs.

## Dependencies
- [ ] Milestone 7: `m7-server-validation-canonicalization-persistence`

## Changes Required
- Add working-directory and exposed-surface inputs to the new-session form.
- Extend UI API client typing and payload wiring for new fields.
- Render server-side validation errors while preserving entered values for retry.
- Source plan section: [Phase 3 in `docs/plans/2-working-directory.md`](../../2-working-directory.md).

## Success Criteria

### Automated Verification
- [x] `npm run test --workspace=apps/ui`
- [x] `npm run typecheck --workspace=apps/ui`

### Manual Verification
- [ ] User can set `working_directory` from UI session-creation flow
- [ ] Server-side validation failures display actionable feedback in UI
- [ ] UI preserves user-entered path and surfaces after failed submission

## Tasks
- [001-add-workdir-inputs-to-new-session-form](./001-add-workdir-inputs-to-new-session-form.md)
- [002-wire-api-payload-and-ui-error-handling](./002-wire-api-payload-and-ui-error-handling.md)
