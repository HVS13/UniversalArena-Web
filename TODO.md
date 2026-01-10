# TODO

## Priority order
1. Engine determinism and rules completeness (structured effects coverage, trigger audit, deterministic replay, golden tests).
2. UI explainability (Active Zone banner, resolution rail, nested event log, status/keyword tooltips).
3. Pipeline automation and consistency (data export workflow, template enforcement, power budget checks).
4. Multiplayer (relay server + client sync), only after 1-3 are done.

## Core rules
- DONE: deterministic replay support (seed + action list) and combat transcript output.
- DONE: initial golden tests for fast interrupt chain and cancelled vs always (includes attack tie).
- DONE: defined a positional model (columns/line) and adjacency/opposed helpers for future mechanics.
- DONE: expanded golden tests for timing windows, status expiry, cost/speed modifiers, mitigation stacking, and hand/deck spend flows.
- DONE: 3v3 teams with shared deck/hand/energy/ultimate and per-character HP/status/defeat handling.
- DONE: structured effect coverage for optional spend/bonus damage/draw/create mechanics (legacy parsing still needed for unique triggers).
- DONE: Turn End triggers for Barrier, Invulnerable, Regen, Renewal, Thorns, Disarm, Root, Seal, Silence, Stagger, Taunt, Wound, Wither, and Cover/Stun expiry.
- DONE: Thorns on-hit damage and Wound/Wither healing reduction across all healing (including Regen/Renewal).
- DONE: Audit remaining status/keyword effects; no current cards use unimplemented keywords.
- DONE: regression test ensures transform-target cards are not dealt into the deck/hand.
- DONE: Enforced combat-round "cannot play cards" via structured `block_play` + golden test.
- Track remaining core gaps in `RULES_IMPLEMENTATION.md` as new mechanics land.

## UI/UX
- DONE: Active Zone banner with "why can't I play here" tooltip.
- DONE: resolution rail showing right-to-left order and next pairing.
- DONE: event log with nested entries and parsed damage/heal details.
- DONE: tooltips for "Played vs Used vs Cancelled vs Negated" and "On Hit vs On Damage vs On HP Damage".
- DONE: zone visualization with stack ordering and clash preview animations.
- DONE: Add tooltips for keywords/status effects from data (including keyword tier and status Mode/Turn End lines).
- DONE: Add discard/deck/exhaust inspection modal with pile summaries.
- DONE: Label the active hand with player name to reduce hot-seat confusion.
- DONE: Add clearer card lifecycle indicators in the rail/stack and log (Played/Used/Cancelled tags).
- DONE: Team setup for three characters, per-character panels, and target selection UI for multi-legal targets.
- DONE: Add choice prompts for Scry/Seek/Search, Redirect (defender selection), and opposed Push direction.

## Multiplayer
- Add relay server and client sync (room codes, reconnect, host authority) only after 1-3 are complete.

## Tooling
- DONE: golden test runner for core engine (seeded replay + transcript snapshot).
- DONE: Add CI step to run `pnpm golden` on PRs.
- DONE: Verify the golden CI by opening a PR that touches `packages/core` or `packages/data`.

## Docs/data pipeline
- Tracked in `C:\Git\UniversalArena\TODO.md` (template enforcement, power budgets, schema validation).
