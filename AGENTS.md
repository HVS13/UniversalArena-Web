# AGENTS

This repo is the Universal Arena web game monorepo (React client + core engine + data package).

Project rules
- Skills manifest lives in `SKILLS.md`.
- Keep source-of-truth data in the docs repo (`C:\Git\UniversalArena\docs\data`), then export into `packages/data`.
- Do not hand-edit `packages/data/src/characters.json`; re-run the exporter instead.
- If core or UI changes affect rules/keywords/status effects/terms, update the docs repo reference pages and `docs/data`, then re-export.
- Keyword data includes an optional Core/Advanced tier; status entries in docs include Mode and explicit Turn End lines.
- Client UI lives in `apps/client/src/`; core rules live in `packages/core/src/`.
- Character art assets live in `apps/client/public/assets/characters`.
- Prefer deterministic, testable rules logic in `packages/core` over UI-side effects.
- Structured effects include conditions, transforms, multihit hits, and set/reduce/spend handling; status state is tracked as potency/count/stack/value in core.
- Restriction enforcement is structured-only; text parsing no longer gates card use. Keep `restrictions` in exported data for any gating text.
- Core now enforces timing windows and status caps/expiry/trigger hooks (cost/speed/power/damage modifiers) plus hand/deck play and spend/draw/creation handling. Legacy text parsing remains for unmodeled mechanics (optional spend, bonus damage, draw/create, unique triggers).

Data workflow
- Export command (run from docs repo):  
  `node C:\Git\UniversalArena\docs\scripts\export-game-data.mjs --out C:\Git\UniversalArena-Web\packages\data\src --assets-out C:\Git\UniversalArena-Web\apps\client\public\assets\characters`

Quality checks
- `pnpm --filter @ua/client build` before release.

Response style
- Tell it like it is; no sugar-coating. Be skeptical, practical, and direct.

Historical context
- Hand display shows the active player's hand (hot-seat flow); add UI labeling if this causes confusion.
- Transform-target cards are excluded from deck/hand population; alternates only appear via transforms at play time.
- UI disables cards unless base energy/ultimate costs are affordable (variable X no longer bypasses).
- Update the docs front-page "Last updated" stamp when shipping user-visible changes.
- Transform priority uses the last matching entry in a card's `transforms` list.
