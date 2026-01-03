---
name: ua-game-client
description: Modify the UniversalArena in-docs game client UI, logic, or config; use when changing gameplay flow, interactions, or styles in docs/javascripts/game and docs/stylesheets/game.css.
---

# UA Game Client

## Overview

Edit the static JS/CSS game client embedded in the MkDocs site without breaking the static build.

## Workflow

1. Locate feature code in `docs/javascripts/game/game.js`; keep changes localized and avoid breaking the static build.
2. Update config in `docs/javascripts/game/config.js` for relay URLs or player limits.
3. Adjust UI styles in `docs/stylesheets/game.css`; keep class naming consistent with existing patterns.
4. Do not edit `site/` output.

## Notes

- The docs site is static; the relay server handles real-time messaging.
- Prefer small, testable changes over large refactors.

## References

- `docs/javascripts/game/game.js`
- `docs/javascripts/game/config.js`
- `docs/stylesheets/game.css`
- `docs/javascripts/guide.js`
