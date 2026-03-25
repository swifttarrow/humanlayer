# Task 003: Enforce Agent/Provider Compatibility at Session Creation

## Goal
Block incompatible agent and provider/model combinations before a run starts.

## Deliverables
- [ ] `apps/server/src/services/sessionService.ts` validates selected `agentType` and provider/model compatibility via shared policy selection.
- [ ] Session creation error responses include typed reason codes for unsupported capability combinations.
- [ ] Server tests cover compatibility acceptance/denial paths.

## Notes
Tie compatibility checks to registry metadata rather than hard-coded lists.

## Verification
Run `npm run test --workspace=apps/server` and confirm invalid combinations fail pre-run with deterministic typed errors.
