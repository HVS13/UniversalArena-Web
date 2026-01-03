# TODO

## Core rules
- Implement zones (Fast/Normal/Slow), priority passing, and clash resolution.
- Encode full timing windows (On Play, Before Clash, After Clash, Before Use, On Use, On Hit, After Use, Always).
- Replace text parsing with structured effect data and rule handlers.
- Add full status/keyword handling (potency/count/stack caps, expiry, triggers).

## UI/UX
- Add zone visualization and stack/clash animations.
- Add card hand/deck/discard tracking and turn start/end automation.
- Add tooltips for keywords/status effects from data.

## Multiplayer
- Add relay server and client sync (room codes, reconnect, host authority).

## Tooling
- Add schema validation for data exports.
- Add automated tests for core rules engine.
