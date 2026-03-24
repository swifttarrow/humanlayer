# Task 001: Configure Compose Mounts and Agent Runtime Path

## Goal
Set explicit Docker mounts and runtime paths so only approved surfaces are available in the agent container.

## Deliverables
- [ ] `docker-compose.yml` mounts resolved workspace path to deterministic in-container location (e.g. `/workspace`)
- [ ] Compose exposes only explicitly configured additional surfaces
- [ ] `apps/agent/Dockerfile` runtime defaults support isolated execution model

## Notes
Do not introduce broad host mounts; maintain outbound-only networking for agent service.

## Verification
Run `docker compose config` and inspect mount list, then run a smoke test with `docker compose up --build`.
