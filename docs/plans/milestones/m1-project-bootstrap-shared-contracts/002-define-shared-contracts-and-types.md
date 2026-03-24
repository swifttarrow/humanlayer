# Task 002: Define Shared Contracts and Types

## Goal
Establish the shared lifecycle, event, and API DTO contract types consumed across all applications.

## Deliverables
- [ ] `packages/shared/src/contracts.ts` defines status enums, event types, and DTO interfaces
- [ ] Server, agent, and UI import the shared types instead of local duplicates

## Notes
Keep contract definitions aligned with the PRD lifecycle semantics and event model documented in the MVP plan.

## Verification
Run `npm run typecheck` and confirm imports resolve in all workspaces.
