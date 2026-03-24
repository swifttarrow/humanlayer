# Milestone 1: Project Bootstrap + Shared Contracts

## Overview
Create the monorepo skeleton, baseline tooling, and shared types/status enums so all components use one contract.

## Dependencies
- [ ] None

## Changes Required
- Create workspace root tooling and scripts in `package.json`.
- Add shared TypeScript config in `tsconfig.base.json`.
- Scaffold baseline package structure for `apps/server`, `apps/agent`, `apps/ui`, and `packages/shared`.
- Define shared lifecycle statuses, event types, and API DTO contracts in `packages/shared/src/contracts.ts`.
- Source plan section: [Phase 1 in `docs/plans/mvp.md`](../../mvp.md).

## Success Criteria

### Automated Verification
- [x] `npm install`
- [x] `npm run typecheck`
- [x] `npm run lint`

### Manual Verification
- [x] Workspace builds with no missing references
- [x] Shared status/event types imported in all apps

## Tasks
- [001-scaffold-workspace-and-apps](./001-scaffold-workspace-and-apps.md)
- [002-define-shared-contracts-and-types](./002-define-shared-contracts-and-types.md)
- [003-run-bootstrap-validation](./003-run-bootstrap-validation.md)
