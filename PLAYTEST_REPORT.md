# Friend Alpha Playtest Report

> Historical evidence: this report covers the schema-1 baseline identified below. It does not by itself validate the current schema-2 candidate; repeat the smoke and full-flow scenarios before release approval.

Date: 2026-07-15 (Asia/Jakarta)  
Baseline commit: `03b59f8`  
Roster data: schema 1, `sha256:53b9ba0b035458dec1702de2c34e313c73b6a380d8d1d240c598e71077f71600`

## Scope

This report records structured local-browser and independent two-browser relay checks for Friend Alpha milestone 10. It is evidence, not a release approval. Unexecuted acceptance cases remain explicitly open.

## Executed scenarios

| Scenario | Result | Evidence observed |
| --- | --- | --- |
| Local setup and default 3v3 roster | Pass | Nine fighters rendered; both teams had three unique selections; Start Match entered turn 1. |
| Movement priority | Pass | P1 pass transferred control to P2; P2 pass ended movement and entered combat. |
| Legal card play and targeting | Pass | P1 played Kamehameha into Normal, selected Leon, spent 3 Energy, and transferred priority. |
| Stack resolution | Pass | Two passes resolved Normal; Kamehameha dealt 35 HP damage; card moved to discard; combat ended cleanly. |
| Debug-bundle UI workflow | Pass with tool limitation | Export action reported success and produced no console error. The in-app automation surface did not expose the programmatic Blob as a capturable download event; schema/replay/privacy remain covered by the golden contract test. |
| Relay lobby and seats | Pass | Independent in-app host and Chrome guest connected to lobby `DBM4T8` as P1/P2. |
| Readiness gate | Pass | Start remained gated until both seats locked Ready, then enabled for host only. |
| Relay match start | Pass | Both clients entered Multiplayer Match at turn 1 with identical movement state. |
| Host action propagation | Pass | Host movement pass changed guest view to active P2. |
| Guest action propagation | Pass | Guest movement pass advanced both clients to combat with active P1. |
| Guest refresh recovery | Pass | After refresh, Connect reclaimed P2 and restored the authoritative turn-1 combat snapshot. |
| Relay protocol regression suite | Pass | Authority, sequencing, deduplication, resync, and lobby reset integration tests passed. |
| Deterministic rules suite | Pass | All 37 golden checks passed. |

## Finding addressed

`FA-PT-001` (P1 risk, fixed): the debug export used a detached anchor and revoked its object URL immediately. The export now attaches the anchor for the click and delays URL revocation, avoiding browser-dependent cancellation while preserving the privacy-conscious bundle contents.

No reproducible gameplay, synchronization, winner, card conservation, or illegal-action P0 defect was found in the executed scope.

## Still required before release approval

- Complete a local UI match from setup through winner declaration and verify its exported bundle.
- Complete an independent two-browser relay match through the same winner and final state on both clients.
- Exercise host recovery plus reconnects during a reaction window and a pending decision.
- Verify the explicit lobby-expired message after relay restart.
- Complete one real remote-network friend match.
- Perform a normal user download/open of the debug JSON outside the automation limitation and run `verifyDebugBundle` on that file.

These items remain P0/P1 release evidence under `FRIEND_ALPHA.md`; milestone 11 must not claim Friend Alpha is shippable until they are recorded.
