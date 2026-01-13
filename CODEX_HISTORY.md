# Codex History

This file preserves the historical intent and decisions for the Universal Arena web game. Append new entries after each major Codex task.

## Project Intent
- Deliver a modern, maintainable web game for Universal Arena.
- Keep rules/data canonical in the docs repo and export into this game repo.
- Provide a clean local hot-seat experience first, then add multiplayer.

## Architecture
- `apps/client`: React + Vite UI.
- `packages/core`: deterministic rules engine.
- `packages/data`: exported canonical data (JSON + types).

## Data Source of Truth
- Canonical data lives in `C:\Git\UniversalArena\docs\data`.
- Exporter outputs into `packages/data/src` and copies art into `apps/client/public/assets/characters`.

## Current Implementation (as of 2026-01-03)
- Monorepo scaffolded with pnpm workspaces.
- Local hot-seat client UI with basic combat flow.
- Minimal rules engine: damage/shield/heal/ultimate/status counters.
- Full roster exported from the docs repo.

## Log
- 2026-01-03: Bootstrapped the monorepo, wired data export from docs, implemented a local hot-seat UI, and added a minimal rules engine with current character roster.
- 2026-01-03: Added typed exports for keywords, status effects, terms, card types, and roles to align with the expanded docs-side data pipeline.
- 2026-01-03: Added structured effect types, rewired the core engine for zones/clash/priority flow, and updated the client to pick zones with live Active Zone status.
- 2026-01-03: Updated README and TODO to reflect current engine status and structured effect coverage.
- 2026-01-03: Added status-state handling, conditional effect/transforms, multihit support, and updated the UI status display while syncing Goku's structured effects.
- 2026-01-03: Updated AGENTS/README/TODO to capture the status-state model, structured effect extensions, and current roadmap.
- 2026-01-04: Added card instances with hand/deck/discard/exhaust zones, draw-to-hand start, spend/draw/create/reload/switch text handling, Stagnate cost adjustments, follow-up cost modifiers, and updated the client UI to play from hand with deck/discard counts and X/choice prompts.
- 2026-01-05: Reordered TODO priorities to focus on rules completeness, then UI polish, then multiplayer.
- 2026-01-05: Added set-status structured effects support in the core/types to model State-setting and Death Note resets.
- 2026-01-05: Added structured spend, per-spend damage, reload, and switch-equipment effects in core/data to cover Leon's missing cards.
- 2026-01-05: Added reduce-status effects with caps/floors and structured Light's Death Note: Judgment with variable Ultimate spend.
- 2026-01-05: Enforced Death Note: Judgment target requirements via data export (use restriction line).
- 2026-01-05: Added structured card restrictions support in data/core and wired Judgment's requirement into structured data.
- 2026-01-05: Added structured restrictions to remaining gated cards and synced exported data.
- 2026-01-05: Added harness coverage for structured restrictions (block invalid plays, allow valid plays).
- 2026-01-05: Hardened the harness to pull required cards from the deck when not in hand.
- 2026-01-05: Removed text parsing for restriction enforcement; only structured `restrictions` are honored.
- 2026-01-05: Updated README/TODO/AGENTS/skills notes to reflect structured-only restrictions and remaining text parsing scope.
- 2026-01-05: Excluded transform-target cards from deck/hand population so alternates only appear via transforms, tightened UI affordability gating for ultimates, and added a front-page last-updated stamp with doc updates.
- 2026-01-05: Removed the in-client last-updated stamp and updated the docs front-page timestamp.
- 2026-01-05: Transform resolution now uses the last matching transform in the list (priority by ordering).
- 2026-01-06: Added seeded RNG, deterministic replay, and transcript support in the core engine.
- 2026-01-06: Added a golden test runner (`pnpm golden`) and expanded coverage for timing windows, status expiry, cost/speed modifiers, mitigation stacking, and spend/hand flows.
- 2026-01-06: Applied Turn End decay for Barrier/Invulnerable/Regen/Renewal/Thorns and stack statuses (Disarm/Root/Seal/Silence/Stagger/Taunt/Wound/Wither), added Thorns on-hit damage, enforced Wound/Wither healing reduction via a shared core helper, and reorganized AGENTS/SKILLS/TODO to separate repo-owned tasks.
- 2026-01-06: Added golden tests for healing reduction (Wound/Wither + Regen/Renewal), Thorns on-hit damage, and Turn End decay for newly added statuses.
- 2026-01-06: Implemented Invulnerable and Barrier damage handling across core damage application (shield/barrier absorption and invulnerable zeroing).
- 2026-01-06: Enforced Disarm/Silence/Seal play gating and Stagger defense cancellation in core resolution.
- 2026-01-06: Added Taunt targeting enforcement for single-target enemy cards (excluding random/AoE/Splash/Bounce).
- 2026-01-06: Added a golden test to ensure transform-target cards are excluded from deck and hand population.
- 2026-01-06: Added a positional model (line size + per-player position) and adjacency/opposed helpers in core to unblock future adjacency mechanics.
- 2026-01-06: Implemented Cover redirect consumption for single-target enemy attacks and added Root movement/swap guard helpers for future movement logic.
- 2026-01-06: Added an Active Zone banner, resolution rail, and nested event log UI for explainability in the client.
- 2026-01-06: Added rule tooltips for card flow and timing labels in the client UI.
- 2026-01-06: Added zone stack visualization with clash previews and entry animations in the client.
- 2026-01-06: Added keyword and status tooltips in the client UI (keyword tier, status Mode, and Turn End details).
- 2026-01-06: Added structured support for optional spend and bonus damage, plus per-spend status and draw/create effects, and enabled spend-driven keyword grants (Evade) in core/data.
- 2026-01-06: Added a CI workflow to run `pnpm golden` on pull requests that touch core/data files.
- 2026-01-06: Audited remaining status/keyword effects; no current cards use unimplemented keywords and no deck reshuffle rule exists in docs.
- 2026-01-06: Implemented automatic draw pile reshuffle when drawing from an empty deck, added reshuffle logging, and covered it with a golden test.
- 2026-01-06: Added pile inspection modals for deck/discard/exhaust and labeled the active hand in the client UI.
- 2026-01-06: Added lifecycle tags in the rail/stack and event log (Played/Used/Cancelled) for clearer resolution status.
- 2026-01-06: Added combat-round play locks (`block_play` effect), enforced "cannot play cards" in core, and covered it with a golden test.
- 2026-01-07: Upgraded the core engine to 3v3 teams with shared deck/hand, per-character HP/status/defeat handling, and character-scoped targeting; updated the client UI for three-character team setup, per-character panels, owner-labeled hand cards, target selection, and transcript v2 golden snapshots.
- 2026-01-10: Added action-level choice hooks for Redirect/Scry/Search/Seek/Push direction with deterministic fallback, and updated RULES_IMPLEMENTATION/README/TODO/AGENTS to reflect choice support.
- 2026-01-10: Added UI prompts for Scry/Seek/Search choices, redirect selection, and opposed push direction, wiring the new action fields through the client modal.
- 2026-01-11: Fixed the redirect choice golden test to use explicit 3v3 cover slots so Cover consumption/logging is exercised and the golden suite passes.
- 2026-01-11: Moved the relay server and data export tooling into this repo, with a docs-repo checkout workflow for syncing `packages/data`.
- 2026-01-11: Temporarily documented `UA_DOCS_REPO`/`UA_DOCS_TOKEN` for a game-repo export workflow (later reverted).
- 2026-01-13: Restored docs-owned auto-sync; exporter/workflow now live in the docs repo again.
