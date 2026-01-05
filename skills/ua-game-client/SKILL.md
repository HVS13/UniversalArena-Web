---
name: ua-game-client
description: Modify the UniversalArena web game client in C:\Git\UniversalArena-Web; use when changing gameplay flow, interactions, or UI in apps/client or rules logic in packages/core.
---

# UA Game Client

## Overview

This repo hosts the React client and rules engine. Rules text and canonical data live in the docs repo.

## Workflow

1. Update UI code in `apps/client/src/`.
2. Update rules logic in `packages/core/src/`.
3. If rules, keywords, status effects, or terms change, update the docs repo (`C:\Git\UniversalArena`) reference pages and `docs/data`.
4. Re-export data from the docs repo into `packages/data/src` (and assets).
5. Do not edit generated JSON in `packages/data/src` by hand.

## Notes

- Prefer deterministic, testable changes in `packages/core` over UI-side effects.
- Keyword data includes an optional Core/Advanced tier; status entries include Mode and explicit Turn End lines in docs.

## References

- `apps/client/src/`
- `packages/core/src/`
- `packages/data/src/`
