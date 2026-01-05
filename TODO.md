# TODO

## Priority order
1. Rules completeness (structured effects coverage, trigger audit, regression tests).
2. UI polish (tooltips, zone clarity, lifecycle indicators).
3. Multiplayer (relay server + client sync).

## Core rules
- Add deterministic replay support (seed + action list) and combat transcript output.
- Create golden tests for key edge cases: Fast interrupt chain, same-side adjacency, Attack vs Attack tie, Cancelled vs Always.
- Extend structured effect coverage for remaining optional spend/bonus damage/draw/create mechanics, then remove legacy text parsing once coverage is high.
- Audit remaining status/keyword triggers (deck reshuffle rules if needed, unique per-card triggers) and add them to core.
- Add regression tests for timing windows, status expiry, cost/speed modifiers, mitigation stacking, and hand/deck spend flows.

## UI/UX
- Add Active Zone banner with "why can/can't play here" tooltip.
- Add resolution rail that shows right-to-left order and next pairing.
- Add event log with nested damage causes (e.g., Fortified/Vulnerable/Shield/Barrier/HP).
- Add tooltips for "Played vs Used vs Cancelled vs Negated" and "On Hit vs On Damage vs On HP Damage".
- Add zone visualization and stack/clash animations.
- Add tooltips for keywords/status effects from data (including keyword tier and status Mode/Turn End lines).
- Add discard/deck inspection and clearer card lifecycle indicators.

## Multiplayer
- Add relay server and client sync (room codes, reconnect, host authority).

## Tooling
- Extend schema validation for new effect types as they are introduced.
- Add automated tests for core rules engine (seeded replay + transcript snapshot).

## Content pipeline
- Enforce template sections and timing label phrasing for all characters.
- Standardize card type tag order for data/UI filtering.
- Enforce power budgeting targets unless exceptions are documented.
