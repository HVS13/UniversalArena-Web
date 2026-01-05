# Universal Arena Web

Web-based Universal Arena prototype (local hot-seat). Data is exported from the docs repo and the rules engine is still incomplete.

## Repo layout

- `apps/client`: React + Vite UI.
- `packages/core`: rules engine (deterministic, no UI).
- `packages/data`: exported character data + types.

## Prerequisites

- Node.js 18+.
- pnpm (workspace package manager).

Note: On Windows with restricted PowerShell scripts, use `cmd /c` for pnpm commands.

## Install

```powershell
cd C:\Git\UniversalArena-Web
cmd /c pnpm install
```

## Sync data from docs (required)

The canonical data lives in `C:\Git\UniversalArena\docs\data`. Export it before running the game:

```powershell
node C:\Git\UniversalArena\docs\scripts\export-game-data.mjs --out C:\Git\UniversalArena-Web\packages\data\src --assets-out C:\Git\UniversalArena-Web\apps\client\public\assets\characters
```

Do not edit `packages/data/src/characters.json` by hand.

## Cross-repo workflow

1. Update rules/reference content and `docs/data` in `C:\Git\UniversalArena`.
2. Export to this repo after any data change.
3. If core logic or UI changes affect rules, mirror the change in the docs repo and re-export.

## Run locally

```powershell
cd C:\Git\UniversalArena-Web
cmd /c pnpm --filter @ua/client dev
```

Open http://localhost:5173.

## Build

```powershell
cmd /c pnpm --filter @ua/client build
```

## Current limitations

- Structured effects now cover all cards and restrictions; legacy text parsing still handles unmodeled mechanics (optional spend, bonus damage, draw/create, unique triggers).
- Status/keyword handling covers timing windows, caps/expiry, and cost/speed/power/damage modifiers plus spend/draw/creation hooks, but not all unique triggers.
- Hand/deck/discard/exhaust are implemented, but there is no deck reshuffle or deck/discard inspection UI yet.
- Multiplayer is not implemented yet.
- Keyword data includes a Core/Advanced tier; status entries include Mode and explicit Turn End lines in docs (not yet surfaced in UI).

## What's next

See `TODO.md` for the planned roadmap.

