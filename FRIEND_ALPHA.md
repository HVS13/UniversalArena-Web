# v0.2 Friend Alpha Contract

Status: Proposed acceptance contract  
Target release: `v0.2.1-friend-alpha`
Roster: Frozen at the existing nine characters

## Product promise

Two friends can create a private lobby, select teams, complete a full match, reconnect after a brief interruption, and reproduce a match-state bug from exported compatibility and replay evidence.

Friend Alpha is a trusted-host playtest build. It is not a competitive or commercially hardened service.

## Governing constraints

1. `@ua/core` is the only gameplay authority.
2. Canonical structured data controls gameplay; prose is presentation only.
3. The relay remains host-authoritative, temporary, and in memory.
4. The roster remains fixed at nine characters during stabilization.
5. No major mechanic is added during stabilization.
6. Every match-state defect receives deterministic regression coverage.
7. Refactoring is incremental and must preserve accepted behavior.

## Acceptance matrix

Each requirement must have recorded automated or manual evidence before release. P0 and P1 failures block release.

### Setup

| ID | Requirement | Required evidence |
| --- | --- | --- |
| FA-SETUP-01 | Host can create a private lobby and receives a shareable code. | Relay integration test and two-browser check |
| FA-SETUP-02 | Guest can join the lobby with the code. | Relay integration test and two-browser check |
| FA-SETUP-03 | Each player can edit only their assigned team's name and selection, and both clients display the same accepted setup. | Relay integration test and two-browser check |
| FA-SETUP-04 | Both players must confirm Ready before a match starts. | Relay integration test |
| FA-SETUP-05 | Only the host can start or return the match to setup. | Protocol rejection test and browser check |
| FA-SETUP-06 | A changed name or team selection clears the affected player's readiness. | Relay integration test |
| FA-SETUP-07 | The roster contains exactly nine selectable characters. | Canonical export and data-contract test |

### Match play

| ID | Requirement | Required evidence |
| --- | --- | --- |
| FA-MATCH-01 | Each player can submit intent only for their assigned team. | Core/client test and protocol rejection test |
| FA-MATCH-02 | Every submitted action is validated and applied by `@ua/core`. | Action-path integration tests |
| FA-MATCH-03 | Both clients agree on turn, phase, active player, and initiative. | State-hash comparison |
| FA-MATCH-04 | Both clients agree on Energy, Ultimate Meter, HP, Shield, and statuses. | State-hash comparison |
| FA-MATCH-05 | Both clients agree on public pile counts, discard, exhaust, zones, stack, and pending decisions, while each browser keeps only its own hand and deck contents visible. | Personalized snapshot test and two-browser check |
| FA-MATCH-06 | Both clients agree on the winner and final state. | Full relay flow test and completed playtest |
| FA-MATCH-07 | A local hot-seat match can complete from setup to winner. | Full local flow test and completed playtest |
| FA-MATCH-08 | A relay match can complete from setup to winner. | Full relay flow test and completed friend playtest |

### Recovery and synchronization

| ID | Requirement | Required evidence |
| --- | --- | --- |
| FA-REC-01 | Guest refresh restores the latest authoritative setup or match. | Reconnect integration test |
| FA-REC-02 | Host refresh restores the latest authoritative setup or match. | Reconnect integration test |
| FA-REC-03 | A brief interruption restores the same seat within the configured grace period. | Timed relay integration test |
| FA-REC-04 | Manual resync restores the latest host-approved state. | Protocol and two-browser test |
| FA-REC-05 | Duplicate action requests do not apply an action twice. | Protocol integration test |
| FA-REC-06 | Stale action requests cannot overwrite or advance newer state. | Action-ID/state-hash rejection test |
| FA-REC-07 | State or compatibility mismatches produce an explicit error and resync path. | Client/protocol integration test |
| FA-REC-08 | Relay restart produces a clear lobby-expired failure; persistence is not implied. | Relay restart playtest |

### Replay and diagnostics

| ID | Requirement | Required evidence |
| --- | --- | --- |
| FA-DEBUG-01 | A match seed and complete transcript can be exported. | Replay export test |
| FA-DEBUG-02 | Transcript replay produces the same canonical final-state hash. | Deterministic replay test |
| FA-DEBUG-03 | Data schema version, content hash, and source revision are identifiable. | Manifest contract test |
| FA-DEBUG-04 | Client, engine, relay, and protocol versions are identifiable. | Debug-bundle test and UI inspection |
| FA-DEBUG-05 | Unsupported transcript or data compatibility fails clearly. | Negative replay tests |
| FA-DEBUG-06 | Desync detection records expected/actual action IDs and state hashes. | Protocol integration test |
| FA-DEBUG-07 | A downloadable debug bundle contains the replay and compatibility evidence without unnecessary personal data. | Bundle schema and manual export test |

## Release-blocking severity

### P0 — Friend Alpha cannot ship

- Match cannot continue.
- Host and guest gameplay state differs.
- Replay final state differs from the original state.
- Winner is incorrect.
- A card instance is duplicated or lost.
- An illegal gameplay action is accepted.

### P1 — Must be fixed before release

- Host or guest recovery fails within the documented grace period.
- HP, status, resource cost, targeting, or reaction behavior is incorrect.
- UI prevents a legal core action or presents an action the core rejects.
- Stale or duplicate action handling can mutate gameplay state incorrectly.
- Required compatibility or debugging evidence cannot be exported.

### P2 — May be deferred with documentation

- Misleading or incomplete explanation text.
- Non-blocking visual, sound, or animation issue.
- Presentation polish that does not affect legal play or state comprehension.

## Explicit non-goals

- Ranked play or competitive guarantees
- Matchmaking
- Accounts or persistent profiles
- Databases or permanent match history
- Anti-cheat against a malicious host
- Spectators or chat
- Progression, cosmetics, or monetization
- Native mobile applications
- Relay persistence across process restarts

## Release evidence

The release checklist must link or record:

- Canonical validation, strict docs build, and export comparison.
- TypeScript build, unit/contract/golden/invariant tests, and relay integration tests.
- Local and relay full-flow tests through winner declaration.
- Host and guest reconnect tests during setup, combat, reactions, and decisions.
- A completed remote friend match.
- Transcript replay with an identical final-state hash.
- A downloadable debug bundle from the completed match.
- Confirmation that all P0 and P1 defects are closed.

## Current status

Milestones 0-11 have prepared a locally verified `0.2.1-friend-alpha` candidate. Automated gates and structured smoke evidence are recorded in [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) and [`PLAYTEST_REPORT.md`](PLAYTEST_REPORT.md).

The current release decision is **NO-GO**. A real LAN or remote friend match remains required. A listed requirement is not considered complete until its evidence exists.
