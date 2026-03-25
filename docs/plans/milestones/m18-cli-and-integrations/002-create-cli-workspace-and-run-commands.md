# Task 002: Create CLI Workspace and Run Commands

## Goal
Introduce a first-class CLI package for interactive and headless session execution.

## Deliverables
- [ ] `apps/cli/package.json` defines workspace metadata and `bin` entrypoint.
- [ ] `apps/cli/src/index.ts` implements command parsing, auth, target environment selection, and API-backed run execution.
- [ ] Exit code handling maps success and common failure classes to deterministic codes.

## Notes
Keep initial CLI thin and API-backed rather than duplicating server orchestration logic.

## Verification
Run `npm run typecheck --workspace=apps/cli` and validate basic interactive/headless command paths against the server API.
