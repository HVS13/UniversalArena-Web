---
name: ua-content-authoring
description: Create or update UniversalArena MkDocs content pages in docs/ and navigation in mkdocs.yml; use for characters, keywords, status effects, roles, card types, terminology, FAQ, or any rules/reference content updates.
---

# UA Content Authoring

## Overview

Use the repo's documented markup patterns to keep content consistent, linkable, and easy to maintain.

## Workflow

1. Identify the content type and follow the exact markup in `docs/adding-content.md`.
2. For filterable lists, ensure item styles respect `hidden` (add `[hidden] { display: none; }` if your custom styles set a display value).
3. Cross-check `docs/faq.md` for rule clarifications and ensure durable rules are also reflected in the relevant reference pages, using the target page's native format. When clarifying timing or keyword interactions, add a short FAQ example and cross-link from the relevant glossary entry.
4. For characters, start from `docs/characters/template.md`, add art in `docs/assets/characters/`, create `docs/data/characters/<slug>.yml` (see `docs/data/README.md`), set portrait `src` to `../../assets/characters/<file>`, add a card to `docs/characters/index.md` (include a Power line and role tags), and update `mkdocs.yml`.
5. Apply basic naming: Basic + Attack cards must be named Strike; Basic + Defense cards must be named Defend; Basic + Special cards can use any name.
6. Conditional "this card becomes X" effects are automatic in any zone; do not make them optional.
7. "Spend X" is mandatory; if optional, it must say "may." If the Spend cannot be paid, that part of the effect does not happen.
8. For character Power numbers, follow `docs/characters/character-creation-guide.md` (including variable/0-cost handling). Document any character-specific exceptions in that guide.
9. For keywords, status effects, roles, card types, terms, or FAQ entries, append the correct block markup in the corresponding file and use the shared link classes.
10. When referencing keywords/status effects/roles/terms in content, use `ua-*-link` markup; only link status effects that live in `docs/status-effects.md` (unique ones stay plain text).
11. Avoid undefined mechanics; if a global keyword/status/term appears in content, ensure it exists in the reference pages.
12. If a card references remaining Multihit Count, make sure the base count is explicit in the card text or defined by the Multihit rules.
13. Keep `site/` untouched; it is build output.
14. Export actions (page PDF/MD/TXT + all-pages ZIP with format/character-combine options and `html/`, `md/`, `txt/`) live in `docs/overrides/main.html` and `docs/javascripts/print.js`; keep exports free of permalinks, URLs, and images when editing them.
15. Run `mkdocs build --strict` or `mkdocs serve` when asked to validate.

## References

- `docs/adding-content.md`
- `docs/characters/template.md`
- `docs/characters/character-creation-guide.md`
- `docs/characters/index.md`
- `docs/keywords.md`
- `docs/status-effects.md`
- `docs/roles.md`
- `docs/card-types.md`
- `docs/terminology.md`
- `docs/faq.md`
- `docs/data/README.md`
- `mkdocs.yml`
