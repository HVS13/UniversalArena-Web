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
