# SKILLS

Canonical skill index for Codex in this repo.

## Local skills

| Skill | When to use | Path |
| --- | --- | --- |
| ua-game-client | Modify the web game client or core rules in this repo. | skills/ua-game-client/SKILL.md |
| ua-relay-server | Maintain the relay server in `server/`. | skills/ua-relay-server/SKILL.md |

## Cross-repo skills

Use these when working in the docs repo (`C:\Git\UniversalArena`).

| Skill | When to use | Path |
| --- | --- | --- |
| ua-character-kit-design | Design lore-accurate character kits and output full character pages. | skills/ua-character-kit-design/SKILL.md |
| ua-content-authoring | Create or update MkDocs content and navigation for rules/reference pages. | skills/ua-content-authoring/SKILL.md |

## Notes
- Use `ua-game-client` for client/core changes; log behavioral fixes in `CODEX_HISTORY.md`.
- Run `pnpm golden` after core rules changes or when validating engine behavior.
- The game is 3v3 per team with shared deck/hand/energy/ultimate and per-character HP/status.
