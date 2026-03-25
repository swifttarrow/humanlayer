## [2026-03-24] Requirements 4-11 Expansion Defaults

**Context:** A unified implementation plan was needed for requirements 4 through 11, spanning runtime mode selection, in-session steering, tool/provider extensibility, CLI/headless operation, workspace UX, and repo-level customization.
**Options considered:** (A) Deliver each requirement independently with separate precedence and lifecycle logic; (B) Use a shared cross-cutting policy/selection foundation with staged feature rollout. Option A reduces initial coupling but increases long-term drift and contradictory behavior.
**Decision:** Choose Option B and implement requirements 4-11 through a shared policy/selection contract plus phased delivery.
**Rationale:** These requirements overlap in override precedence, policy gating, error semantics, and observability. A shared foundation minimizes divergence across runtime mode, agent type, provider/model, and tool availability.
**Impact:** Plan phases start with contracts and selection logic, then layer runtime controls, registries/integrations, CLI/headless UX, workspace UX, and repo hooks behind staged rollout flags.
**Owner:** Agent + developer confirmation pending
