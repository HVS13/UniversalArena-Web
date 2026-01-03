---
name: ua-relay-server
description: Maintain the UniversalArena WebSocket relay server; use when changing lobby logic, message routing, room limits, or environment configuration in server/.
---

# UA Relay Server

## Overview

Maintain the lightweight in-memory relay that powers 2-player lobbies.

## Workflow

1. Update `server/index.js` for room logic, message routing, or limits; keep state in memory.
2. Keep environment variables aligned with `server/README.md` (`PORT`, `MAX_PLAYERS`).
3. If server URL or limits change, update `docs/javascripts/game/config.js`.

## References

- `server/index.js`
- `server/README.md`
- `server/package.json`
- `docs/javascripts/game/config.js`
