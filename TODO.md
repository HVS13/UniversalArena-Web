# TODO

## Core rules
- Extend structured effect coverage for spend/draw/creation/set-value mechanics, then remove legacy text parsing once coverage is high.
- Audit remaining status/keyword triggers (deck reshuffle rules if needed, unique per-card triggers) and add them to core.
- Add regression tests for timing windows, status expiry, cost/speed modifiers, mitigation stacking, and hand/deck spend flows.

## UI/UX
- Add zone visualization and stack/clash animations.
- Add tooltips for keywords/status effects from data.
- Add discard/deck inspection and clearer card lifecycle indicators.

## Multiplayer
- Add relay server and client sync (room codes, reconnect, host authority).

## Tooling
- Extend schema validation for new effect types as they are introduced.
- Add automated tests for core rules engine.
