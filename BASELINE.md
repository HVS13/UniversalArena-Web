# Friend Alpha Baseline

Captured: 2026-07-15 (Asia/Jakarta)

This document records the repository state before Friend Alpha stabilization. It is evidence for Milestone 0, not a release claim.

## Repository revisions

| Repository | Branch | Commit | Working tree | Upstream |
| --- | --- | --- | --- | --- |
| `UniversalArena` | `main` | `8dd1c1e43ac99f7e8d54363ece63d05155f2d5da` (`Add structured character innate data`) | Clean | `origin/main`, 0 ahead / 0 behind |
| `UniversalArena-Web` | `main` | `95e94ddd388b8199520b18ede7a4892bd26b8d2b` (`Implement structured character innates`) | Clean before this baseline document | `origin/main`, 0 ahead / 0 behind |

## Content and compatibility baseline

- Canonical roster: 9 characters.
- Structured character innates: 12 across the roster.
- Data schema version: not explicitly versioned.
- Export manifest: not present.
- Multiplayer protocol version: not explicitly versioned.
- Transcript version: 2.
- Engine/data content hash: not present.

## Passing commands

### `UniversalArena`

Run from the indicated working directory:

| Command | Working directory | Result |
| --- | --- | --- |
| `npm run validate` | `docs/scripts` | Pass: no Markdown/YAML mismatches |
| `mkdocs build --strict` | repository root | Pass |
| `node docs/scripts/export-game-data.mjs --out C:\Git\ua-friend-alpha-baseline\data --assets-out C:\Git\ua-friend-alpha-baseline\assets` | repository root | Pass: 9 characters exported |

Fresh-export comparison:

- 6 generated JSON files match `UniversalArena-Web/packages/data/src` by SHA-256.
- 9 character art assets match `UniversalArena-Web/apps/client/public/assets/characters` by SHA-256.
- Validator warnings: none.

### `UniversalArena-Web`

| Command | Working directory | Result |
| --- | --- | --- |
| `pnpm golden` | repository root | Pass: 31/31 golden checks |
| `npm test` | `server` | Pass: readiness, snapshot merge, sync, and lobby reset |
| `pnpm --filter @ua/client exec tsc --noEmit` | repository root | Pass |
| `pnpm --filter @ua/client build` | repository root | Pass when Vite can write its temporary config |

The production build initially received a sandbox `EPERM` while Vite attempted to write `node_modules/.vite-temp`. The same command passed outside that filesystem restriction. This is an execution-environment limitation, not a repository build failure.

## Interactive baseline

### Local hot-seat

Passed:

- Created a default 3v3 local match.
- Entered Movement Round and Combat Round.
- Advanced from Turn 1 to Turn 2.
- Confirmed active-player hand/control changes.
- No browser console errors were recorded.

Not yet proven:

- A full UI-driven local match through winner declaration.

### Two-browser relay

Passed with isolated Host and Guest browser sessions:

- Connected both clients to the local relay.
- Created and joined private lobby `T4888G`.
- Both players locked Ready.
- Only Host started the match.
- Both clients displayed Turn 1, Player 1, Movement Round, and matching formations.
- Host movement propagated to Guest.
- Guest movement request was applied by Host and propagated back.
- No browser console errors were recorded.

Not yet proven in this baseline session:

- A full relay match through winner declaration.
- Remote play across separate networks.
- Reconnect during every pending decision/reaction state.

## Known rules and card gaps

Current documented gaps, without introducing new findings during baseline capture:

- Several card and status mechanics still use legacy gameplay-text parsing.
- `Cleanse`, `Dispel`, and `Purge` remain text-parsed.
- Card/status mitigation rules retain legacy parsing even though character innate mitigation is structured.
- Some unique triggers and text-only edge cases remain outside structured effects.
- `Cannot Play Cards` is only structured for the combat-round `block_play` behavior.
- The canonical exporter validation is intentionally incomplete for some newer structured fields.
- Remaining discrepancies are tracked in `RULES_IMPLEMENTATION.md` and the two repository TODO files.

## Known multiplayer gaps

- Relay state is temporary and in memory; a relay restart destroys active lobbies.
- No protocol-version compatibility check exists.
- No data-content compatibility hash exists.
- Guest action requests do not carry request IDs, expected action IDs, or expected state hashes.
- Stale and duplicate action protection is not an explicit protocol contract.
- Desync detection is manual rather than hash-driven.
- Host and guest reconnect behavior has manual coverage, but not a complete automated integration matrix.
- A real remote friend session has not been captured for this baseline.

## Known UI and debugging gaps

- React still performs some affordability, legality, zone, target, and reaction calculations that can overlap core decisions.
- `App.tsx` combines setup, relay, match orchestration, prompts, playback, and rendering.
- Blocked-action explanations are not consistently sourced from a single core query API.
- The UI cannot export a complete debug bundle.
- Replay/transcript export is not exposed as a Friend Alpha workflow.
- Client, relay, engine, protocol, and canonical data revisions are not visible together in the UI.

## Milestone 0 conclusion

The repositories have a clean and reproducible technical baseline. Static validation, deterministic core checks, relay protocol checks, production build, local turn progression, and two-browser action synchronization pass. Full match-to-winner UI sessions and real remote-network play remain explicit validation work for later Friend Alpha milestones rather than hidden assumptions.
