---
name: ua-character-kit-design
description: Design lore-accurate, synergistic, and fun character kits and output full character pages; use when creating new characters, rebalancing existing kits, or writing card/innate text for UniversalArena.
---

# UA Character Kit Design

## Overview

Design a cohesive kit, then output a complete character page that fits the project's structure and rules conventions.

## Inputs to confirm

- Theme/origin, version label, difficulty, and intended role.
- Roles are descriptive only (non-mechanical); confirm 1-2 roles that communicate playstyle.
- Power band and gameplay goals (burst, control, support, tempo).
- Required keywords or status effects, if any.

## Design workflow

1. Review 2-3 existing character pages to anchor power, speed, and cost ranges.
2. Define the gameplan paragraph and 1-2 innates that drive the kit.
3. Choose keywords/status effects and roles; add new ones only if absolutely necessary.
4. Use `ua-*-link` markup for keywords/status effects/roles in card and innate text; only link status effects that live in `docs/status-effects.md` (unique ones stay plain text).
5. Avoid undefined mechanics; if a global keyword/status/term appears in content, ensure it exists in the reference pages.
6. If a card references remaining Multihit Count, make sure the base count is explicit in the card text or defined by the Multihit rules.
7. Create five cards plus an Ultimate; keep effect text concise and tag order consistent with `docs/adding-content.md`.
8. Apply basic naming: Basic + Attack cards must be named Strike; Basic + Defense cards must be named Defend; Basic + Special cards can use any name.
9. Conditional "this card becomes X" effects are automatic in any zone; do not make them optional.
10. "Spend X" is mandatory; if optional, it must say "may." If the Spend cannot be paid, that part of the effect does not happen.
11. Apply the power budgeting rules in `docs/characters/character-creation-guide.md` (including variable/0-cost handling). Document any character-specific exceptions in that guide.
12. Ensure Potency/Count/Value/Stack caps align with what the kit can reach, including edge cases.
13. Prioritize lore-accurate, synergistic, and fun play feel over balance; avoid purely balance-driven nerfs that break fantasy.
14. Sanity-check for infinite loops, auto-win combos, or uncounterable turns.

## Output format

1. Use `docs/characters/template.md` structure verbatim (include Roles line).
2. Add artwork in `docs/assets/characters/` and set portrait `src` to `../../assets/characters/<file>` in the page.
3. Create `docs/data/characters/<slug>.yml` that matches the character page (see `docs/data/README.md`).
4. Update `docs/characters/index.md` (include role tags) and `mkdocs.yml` when adding a new character.

## References

- `docs/characters/template.md`
- `docs/characters/character-creation-guide.md`
- `docs/characters/index.md`
- `docs/adding-content.md`
- `docs/keywords.md`
- `docs/status-effects.md`
- `docs/roles.md`
- `docs/card-types.md`
- `docs/data/README.md`
- `mkdocs.yml`
