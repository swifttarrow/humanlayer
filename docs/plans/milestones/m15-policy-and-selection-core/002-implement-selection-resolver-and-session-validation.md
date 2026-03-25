# Task 002: Implement Selection Resolver and Session Validation

## Goal
Centralize layered selection precedence and apply it at session creation time.

## Deliverables
- [ ] `apps/server/src/services/policySelectionService.ts` resolves system/user/session choices with allow/deny reason output.
- [ ] `apps/server/src/routes/sessions.ts` validates runtime mode, provider/model, and agent type through the shared resolver.
- [ ] Server tests cover accepted and denied combinations, including typed reason-code responses.

## Notes
Prefer one reusable resolver entrypoint over ad hoc per-field logic to prevent precedence drift.

## Verification
Run `npm run test --workspace=apps/server` and confirm create-session rejects invalid selections with typed errors.
