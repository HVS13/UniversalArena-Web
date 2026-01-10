# Universal Arena Web

Web-based Universal Arena prototype (local hot-seat 3v3 with shared team deck/hand). Data is exported from the docs repo and the rules engine is still incomplete.

## Repo layout

- `apps/client`: React + Vite UI.
- `packages/core`: rules engine (deterministic, no UI).
- `packages/data`: exported character data + types.

## Prerequisites

- Node.js 18+.
- pnpm (workspace package manager).

Note: On Windows with restricted PowerShell scripts, use `cmd /c` for pnpm commands.

## Step 1 - Install

```powershell
cd C:\Git\UniversalArena-Web
cmd /c pnpm install
```

## Step 2 - Sync data from docs (required)

The canonical data lives in `C:\Git\UniversalArena\docs\data`. Export it before running the game:

```powershell
node C:\Git\UniversalArena\docs\scripts\export-game-data.mjs --out C:\Git\UniversalArena-Web\packages\data\src --assets-out C:\Git\UniversalArena-Web\apps\client\public\assets\characters
```

Do not edit `packages/data/src/characters.json` by hand.

## Cross-repo workflow

1. Update rules/reference content and `docs/data` in `C:\Git\UniversalArena`.
2. Export to this repo after any data change.
3. If core logic or UI changes affect rules, mirror the change in the docs repo and re-export.

## Step 3 - Run locally

```powershell
cd C:\Git\UniversalArena-Web
cmd /c pnpm --filter @ua/client dev
```

Open http://localhost:5173.

## Step 4 - Run golden tests (recommended)

Golden tests validate deterministic replay and key combat edge cases.

```powershell
cd C:\Git\UniversalArena-Web
cmd /c pnpm golden
```

CI runs `pnpm golden` on pull requests that touch core/data files.

## Step 5 - Build (optional)

```powershell
cmd /c pnpm --filter @ua/client build
```

## Deterministic replay and transcripts

- Deterministic replay is built into `@ua/core`. Matches can be seeded and recorded.
- Golden tests live in `packages/core/src/golden.ts` and are executed via `pnpm golden`.
- If you change core rules, run `pnpm golden` after syncing data.

## Current limitations

- Structured effects now cover optional spend/bonus damage/draw/create mechanics; legacy text parsing still handles unique triggers and any remaining unmodeled text.
- Status/keyword handling covers timing windows, caps/expiry, and cost/speed/power/damage modifiers plus spend/draw/creation hooks, but not all unique triggers.
- Movement Round swaps are implemented; movement is mandatory before combat.
- Multi-target AoE/Splash/Bounce resolution is implemented; text-only edge cases still rely on legacy parsing.
- Push/Pull/Swap and Redirect/Cover resolve in core; UI prompts send redirect/push choices with deterministic fallback.
- Scry/Search/Seek prompt for discard/reorder/take/pick inputs and fall back deterministically if left on Auto.
- Multiplayer is not implemented yet.
- Keyword data includes a Core/Advanced tier; status entries include Mode and explicit Turn End lines, surfaced in UI tooltips.

## Gameplay notes

- Hand display is always the active team's hand (hot-seat flow, shared deck/hand).
- Cards are owned by specific characters; owners are shown on hand cards and ultimates.
- Target selection prompts appear when multiple legal targets exist.
- Transformable cards resolve to alternates at play time; transform targets are excluded from deck/hand population.
- Ultimates require the full base cost; variable X cannot bypass Ultimate meter requirements.

## What's next

See `TODO.md` for the planned roadmap.

