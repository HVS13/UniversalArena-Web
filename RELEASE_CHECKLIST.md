# Friend Alpha Release Checklist

Assessment date: 2026-07-15 (Asia/Jakarta)  
Target: `v0.2.0-friend-alpha`  
Current decision: **NO-GO — local release candidate is prepared; required human/full-flow evidence remains open.**

## Candidate identity

- Client, engine, relay, and package version: `0.2.0-friend-alpha`
- Relay protocol: 1
- Transcript version: 3
- Debug bundle version: 1
- Canonical source: `HVS13/UniversalArena@546baba6da30a7359bd91addd85c8f8680b6c257`
- Data schema: 1
- Data content: `sha256:53b9ba0b035458dec1702de2c34e313c73b6a380d8d1d240c598e71077f71600`
- Roster: 9 characters

## Automated and local evidence

| Gate | Status | Evidence |
| --- | --- | --- |
| Markdown/YAML canonical validation | Pass | `npm run validate` reports no mismatches. |
| Strict documentation build | Pass | `python -m mkdocs build --strict`. |
| Fresh export comparison | Pass | Generated JSON content hash/source identity and all character assets match the checked-in web package. |
| Core deterministic/contract suite | Pass | 37/37 checks via `pnpm golden`. |
| Focused invariant harness | Pass | 6/6 checks via `pnpm harness`. |
| Client production build | Pass | TypeScript and Vite via `pnpm build`. |
| Relay integration | Pass | Authority, sequencing, deduplication, resync, and reset via server test. |
| Combined release command | Pass | `pnpm release:check`. |
| Local browser smoke flow | Pass | Setup, movement, targeted play, resolution, damage, and discard; see `PLAYTEST_REPORT.md`. |
| Independent relay smoke flow | Pass | Lobby, readiness, start, bidirectional actions, and guest recovery; see `PLAYTEST_REPORT.md`. |
| Replay/debug schema | Pass | Golden test reproduces final canonical hash and checks privacy/version rejection. |

## Open release blockers

- [ ] Local UI match completes through winner declaration.
- [ ] Independent relay match completes with the same winner and final state on both clients.
- [ ] Host refresh recovery is recorded.
- [ ] Recovery during reaction and pending-decision windows is recorded.
- [ ] Relay restart produces the documented lobby-expired path.
- [ ] A real remote-network friend match completes.
- [ ] The completed match's downloaded JSON is opened and verified with `verifyDebugBundle`.
- [ ] All defects found by those sessions are triaged; all P0/P1 defects are closed.

## Release procedure after blockers close

1. Record the missing evidence and defect disposition in `PLAYTEST_REPORT.md`.
2. Run canonical validation, strict docs build, fresh export comparison, and `pnpm release:check` again from clean repositories.
3. Confirm both repositories are synchronized and the data manifest does not contain a `-dirty` source revision.
4. Change this decision to **GO** only when every P0/P1 evidence checkbox is complete.
5. Create and push the annotated `v0.2.0-friend-alpha` tag from the verified web commit; do not tag the current NO-GO state.
