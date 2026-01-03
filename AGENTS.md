# AGENTS

This repo is the Universal Arena web game monorepo (React client + core engine + data package).

Project rules
- Keep source-of-truth data in the docs repo (`C:\Git\UniversalArena\docs\data`), then export into `packages/data`.
- Do not hand-edit `packages/data/src/characters.json`; re-run the exporter instead.
- Client UI lives in `apps/client/src/`; core rules live in `packages/core/src/`.
- Character art assets live in `apps/client/public/assets/characters`.
- Prefer deterministic, testable rules logic in `packages/core` over UI-side effects.
- Structured effects include conditions, transforms, and multihit hits; status state is tracked as potency/count/stack/value in core.
- Core now enforces timing windows and status caps/expiry/trigger hooks (cost/speed/power/damage modifiers) plus hand/deck play and spend/draw/creation handling. Legacy text parsing remains for unmodeled mechanics (set-value effects, unique triggers, etc.).

Data workflow
- Export command (run from docs repo):  
  `node C:\Git\UniversalArena\docs\scripts\export-game-data.mjs --out C:\Git\UniversalArena-Web\packages\data\src --assets-out C:\Git\UniversalArena-Web\apps\client\public\assets\characters`

Quality checks
- `pnpm --filter @ua/client build` before release.

Response style
- Tell it like it is; no sugar-coating. Be skeptical, practical, and direct.
