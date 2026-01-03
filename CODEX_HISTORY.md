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
