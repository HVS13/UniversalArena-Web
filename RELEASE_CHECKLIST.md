# Friend Alpha Release Checklist

Assessment date: 2026-07-28 (Asia/Jakarta)
Target: `v0.2.0-friend-alpha`
Current decision: **NO-GO — automated validation passes; current-candidate human/full-flow evidence remains open.**

## Candidate identity

- Client and relay version: `0.2.1-friend-alpha`
- Package target: `0.2.0-friend-alpha`
- Engine version: `0.2.1-friend-alpha`
- Relay protocol: 2
- Transcript version: 4 (safe version-3 replay compatibility retained)
- Debug bundle version: 1
- Canonical source: `HVS13/UniversalArena@def16b684d509001f2c165be08bdac1c91d75e30`
- Data schema: 2
- Data content: `sha256:2a9df703f469a7b4096350bca90c158b20ff4c835c21a8b1ecc797736ea7a4c1`
- Roster: 9 characters

## Automated and local evidence

| Gate | Status | Evidence |
| --- | --- | --- |
| Strict documentation build | Pass | `python -m mkdocs build --strict`. |
| Fresh export comparison | Pass | Generated JSON content hash/source identity and all character assets match the checked-in web package. |
| Web data manifest validation | Pass | `pnpm data:validate`; canonical JSON hashing is stable across LF/CRLF checkouts. |
| Core deterministic/contract suite | Pass | 39/39 checks via `pnpm golden`. |
| Focused invariant harness | Pass | 6/6 checks via `pnpm harness`. |
| Client production build | Pass | TypeScript and Vite via `pnpm build`. |
| Network privacy | Pass | Client redaction contract plus relay integration cover seat-owned setup, private guest snapshots, sequencing, resync, and reset. |
| Combined release command | Pass | `pnpm release:check`. |
| Two-client ownership UX | Pass | Isolated Host/Guest browser check verifies local-first formation, persistent own hand, turn/priority messaging, and private opponent deck controls through turn handoff. |
| Local browser smoke flow | Rerun required | Existing evidence in `PLAYTEST_REPORT.md` covers the prior schema-1 baseline. |
| Independent relay smoke flow | Rerun required | Existing evidence in `PLAYTEST_REPORT.md` covers the prior schema-1 baseline. |
| Replay/debug schema | Pass | Golden test reproduces the final canonical hash and checks privacy/version rejection. |

## Open release blockers

- [ ] Repeat the local browser smoke flow on the current schema-2 candidate.
- [ ] Repeat the independent relay smoke flow on the current schema-2 candidate.
- [ ] Local UI match completes through winner declaration.
- [ ] Independent relay match completes with the same winner and final state on both clients.
- [ ] Host refresh recovery is recorded.
- [ ] Recovery during reaction and pending-decision windows is recorded.
- [ ] Relay restart produces the documented lobby-expired path.
- [ ] A real LAN friend match completes.
- [ ] The completed match's downloaded JSON is opened and verified with `verifyDebugBundle`.
- [ ] All defects found by those sessions are triaged; all P0/P1 defects are closed.

## Release procedure after blockers close

1. Record the missing evidence and defect disposition in `PLAYTEST_REPORT.md`.
2. Run canonical validation, strict docs build, fresh export comparison, and `pnpm release:check` again from clean repositories.
3. Confirm both repositories are synchronized and the data manifest does not contain a `-dirty` source revision.
4. Change this decision to **GO** only when every P0/P1 evidence checkbox is complete.
5. Create and push the annotated `v0.2.0-friend-alpha` tag from the verified web commit; do not tag the current NO-GO state.
