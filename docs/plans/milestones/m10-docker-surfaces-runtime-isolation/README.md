# Milestone 10: Docker Surfaces + Runtime Isolation

## Overview
Make Docker behavior mirror local policy semantics while preserving container isolation and explicit exposure.

## Dependencies
- [ ] Milestone 9: `m9-agent-local-boundary-enforcement`

## Changes Required
- Add explicit compose mounts for workspace and optional exposed surfaces only.
- Harden agent container defaults for runtime isolation.
- Document Docker/local configuration and policy examples in docs/env examples.
- Source plan section: [Phase 5 in `docs/plans/2-working-directory.md`](../../2-working-directory.md).

## Success Criteria

### Automated Verification
- [x] `docker compose config`
- [ ] `docker compose up --build` (smoke)

### Manual Verification
- [ ] Agent container sees only declared mounts
- [ ] Undeclared host paths are inaccessible in-container
- [ ] Local and Docker requests produce equivalent allow/deny outcomes for same policy input

## Tasks
- [001-configure-compose-mounts-and-agent-runtime-path](./001-configure-compose-mounts-and-agent-runtime-path.md)
- [002-document-docker-policy-configuration](./002-document-docker-policy-configuration.md)
