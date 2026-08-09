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

## Current schema-2 smoke verification

Date: 2026-08-01 (Asia/Jakarta)

Verification base commit: `3cfa7bcc6f60b0f954049d882f94bf336ef77b92`

Roster data: schema 2, `sha256:2a9df703f469a7b4096350bca90c158b20ff4c835c21a8b1ecc797736ea7a4c1`

This pass used isolated Playwright browser sessions against the local production preview and relay. It closes the current-candidate smoke, host-refresh, and relay-restart evidence. It does not replace the remaining full-match or real-network checks.

| Scenario | Result | Evidence observed |
| --- | --- | --- |
| Current local setup | Pass | Nine fighters rendered and the default 3v3 teams entered turn 1. |
| Local handoff accessibility | Pass | Enter confirmed the Player 1 handoff; Space confirmed the Player 2 handoff exactly once. |
| Local movement and resolution | Pass | Two movement passes entered combat. Ichigo Strike resolved once in Normal, dealt 10 damage to Leon, gained 1 Reiatsu, cleared the zone, and returned priority to Player 1. |
| Independent relay setup | Pass | Host and Guest joined lobby `43PTG4`, both locked Ready, and host alone started the match. |
| Relay ownership and privacy | Pass | Each browser showed its own hand and enabled deck inspection only for its own seat. Network mode showed no local handoff overlay. |
| Relay action propagation | Pass | Host and Guest movement passes advanced both clients to turn-1 combat with Player 1 active. |
| Relay ordinary resolution | Pass | DIO's Vampiric Drain resolved once on both clients, dealt 28 damage to Leon, left Leon at 72 HP, gained 4 Stolen Blood, applied Weak, cleared the zone, and produced the same event sequence. |
| Guest refresh recovery | Pass | Reload, Network Match, and Connect reclaimed P2 and restored the authoritative combat state with the private P2 hand. |
| Host refresh recovery | Pass | Reload, Network Match, and Connect reclaimed P1 with current priority and the authoritative combat state. |
| Relay restart failure path | Pass | Both clients reported relay disconnection. Reconnecting to the restarted relay returned `Lobby not found`, cleared active lobby membership, and kept the client connected for a new lobby. |
| Browser consoles | Pass | Local, Host, and Guest sessions each reported zero errors and zero warnings. |

### Findings addressed

- `FA-PT-002` (P2 copy): the match footer still described an earlier prototype and unconverted-card migration. It now gives a stable player-facing product description and a discreet project-document entry point.
- `FA-PT-003` (P2 clarity): separate status value and Count changes produced identical event-log text. Structured status logs now label Count changes explicitly, for example `Weak` and `Weak Count`.
- `FA-PT-004` (P2 documentation): the project overview still called the client an incomplete prototype and listed an obsolete Node.js floor. It now describes the supported modes, points to the canonical source, and matches the installed Vite runtime requirements and pinned pnpm version.
- `FA-PT-005` (P1 responsive UI): the first document modal was positioned relative to the long setup shell on mobile and could open outside the viewport. Rendering it through a body-level portal keeps it visible at desktop and 390px widths; Escape closes it and restores page scrolling.

### Evidence still open

- Complete local and independent relay matches through the same winner and final state.
- Recover during a reaction window and a pending-decision window.
- Complete one real LAN or remote friend match.
- Download, open, and verify a completed-match debug JSON with `verifyDebugBundle`.

## Current release-readiness full-flow verification

Date: 2026-08-09 (Asia/Jakarta)

| Scenario | Result | Evidence observed |
| --- | --- | --- |
| Local match through victory | Pass | The default 3v3 match completed at turn 15 with Player 1 declared as winner, phase `finished`, no handoff or reaction window left visible, and a clean browser console. |
| Relay match through victory | Pass | Independent Host and Guest clients completed at turn 17 with Player 1 declared as winner and phase `finished`. Normalized final summary, formation, and event-log hashes matched on both clients. |
| Reaction-window recovery | Pass | Host refreshed during Player 1's Normal-zone Follow-Up or Assist window, reconnected through Network Match, reclaimed P1 in lobby `MAXASW`, recovered the same reaction window, and continued the match through victory. |
| Completed debug bundle | Pass | The relay winner bundle opened successfully and `verifyDebugBundle` returned `ok: true`, winner `p1`, phase `finished`, and state hash `sha256:c6bdcf27aa25b4d6e12cee1baf1131c1f9a3bc2e07fc7b15faad4f6544338417`. |
| Browser consoles | Pass | Local, Host, and Guest sessions reported zero errors and zero warnings. |

### Finding addressed

`FA-PT-006` (P1 victory state, fixed): a finished match could retain its final `pendingResolution` and expose a stale Follow-Up or Assist prompt while labeling the phase as Combat Round. Finished matches now suppress pending decision windows and render the phase as Finished.

### Evidence still open

- Recover during a pending-decision window.
- Complete one real LAN or remote friend match.
