---
name: ua-content-authoring
description: Update MkDocs rules/reference content in the docs repo (C:\Git\UniversalArena); use for characters, keywords, status effects, roles, card types, terminology, or FAQ changes.
---

# UA Content Authoring

## Overview

Docs live in `C:\Git\UniversalArena`. Use this repo only to run the exporter and consume the generated data.

## Workflow

1. Switch to `C:\Git\UniversalArena` and follow `docs/adding-content.md`.
2. Update the relevant docs pages and `docs/data` there.
3. Export into this repo with:
   `node C:\Git\UniversalArena\docs\scripts\export-game-data.mjs --out C:\Git\UniversalArena-Web\packages\data\src --assets-out C:\Git\UniversalArena-Web\apps\client\public\assets\characters`
4. Do not add or edit `docs/` content in this repo.

## References

- `C:\Git\UniversalArena\docs/adding-content.md`
- `C:\Git\UniversalArena\docs/data/README.md`
- `C:\Git\UniversalArena\docs/characters/character-creation-guide.md`
