---
name: ua-character-kit-design
description: Design or rebalance character kits in the docs repo (C:\Git\UniversalArena); use when writing card/innate text or adding characters.
---

# UA Character Kit Design

## Overview

Character kits and their data live in `C:\Git\UniversalArena` (docs + `docs/data`). Use this repo only to run the exporter and consume the generated data.

## Workflow

1. Switch to `C:\Git\UniversalArena` and follow `docs/characters/character-creation-guide.md`.
2. Update the character page and `docs/data/characters/<slug>.yml`.
3. Export the updated data into this repo with:
   `node C:\Git\UniversalArena\docs\scripts\export-game-data.mjs --out C:\Git\UniversalArena-Web\packages\data\src --assets-out C:\Git\UniversalArena-Web\apps\client\public\assets\characters`
4. Do not edit character docs or YAML files in this repo.

## References

- `C:\Git\UniversalArena\docs/characters/character-creation-guide.md`
- `C:\Git\UniversalArena\docs/data/README.md`
