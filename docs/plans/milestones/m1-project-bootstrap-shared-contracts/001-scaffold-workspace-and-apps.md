# Task 001: Scaffold Workspace and Apps

## Goal
Create the initial monorepo/workspace structure and app/package entrypoints used by server, agent, UI, and shared contracts.

## Deliverables
- [ ] Root `package.json` defines workspaces and baseline scripts (`dev`, `build`, `typecheck`, `lint`, `test`)
- [ ] `apps/server`, `apps/agent`, `apps/ui`, and `packages/shared` directories exist with initial package manifests and entry files

## Notes
Follow the Phase 1 file targets in `docs/plans/mvp.md` and keep structure compatible with Express, React (Vite), Prisma, and shared TS packages.

## Verification
Run `npm install` and confirm package linking resolves without missing workspace errors.
