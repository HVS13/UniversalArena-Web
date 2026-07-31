import { characters as roster } from "@ua/data";
import {
  createMatchState,
  hashMatchState,
  type StackEntry,
} from "@ua/core";
import { createGuestStateView } from "./relay-protocol.js";

const fail = (message: string): never => {
  throw new Error(message);
};

const characterIds = roster.slice(0, 6).map((character) => character.id);
if (characterIds.length !== 6) fail("Privacy fixture requires six roster characters.");

const state = createMatchState(
  roster,
  [
    { id: "p1", name: "Host", characterIds: characterIds.slice(0, 3) },
    { id: "p2", name: "Guest", characterIds: characterIds.slice(3, 6) },
  ],
  { seed: 987654, enableTranscript: true }
);

if (!state.players.p1.hand.length || !state.players.p1.deck.length) {
  fail("Privacy fixture requires host hand and deck cards.");
}

const hostPrivateIds = [
  ...state.players.p1.hand.map((card) => card.id),
  ...state.players.p1.deck.map((card) => card.id),
];
const sourceId = state.players.p1.characters[0]?.id ?? fail("Missing host character.");
const targetId = state.players.p2.characters[0]?.id ?? fail("Missing guest character.");
const privateEntry: StackEntry = {
  id: "private-choice-entry",
  cardSlot: "privacy-test",
  cardName: "Privacy Test",
  powerText: "-",
  effectText: [],
  types: ["Special"],
  speed: "Fast",
  playedBy: "p1",
  sourceId,
  targetId,
  xValue: 0,
  scryDiscardIds: [hostPrivateIds[0]!],
  scryOrderIds: [hostPrivateIds[1]!],
  seekTakeIds: [hostPrivateIds[2]!],
  searchPickId: hostPrivateIds[3]!,
};

state.zones.fast.cards.push(privateEntry);
state.pendingRedirectDecision = {
  playerId: "p2",
  zone: "fast",
  entryId: privateEntry.id,
  baseTargetId: targetId,
  candidates: [{ targetId, source: "redirect" }],
  resolvedBy: "p1",
  reactionEntry: { ...privateEntry, id: "private-reaction-entry" },
};

const originalState = JSON.stringify(state);
const guestView = createGuestStateView(state);
const repeatedView = createGuestStateView(state);

if (JSON.stringify(state) !== originalState) fail("Redaction mutated authoritative state.");
if (JSON.stringify(guestView) !== JSON.stringify(repeatedView)) {
  fail("Redaction is not deterministic.");
}
if (hashMatchState(guestView) !== hashMatchState(repeatedView)) {
  fail("Repeated guest views produced different state hashes.");
}

const hiddenHostCards = [...guestView.players.p1.hand, ...guestView.players.p1.deck];
hiddenHostCards.forEach((card, index) => {
  const zone = index < guestView.players.p1.hand.length ? "hand" : "deck";
  const zoneIndex = zone === "hand" ? index : index - guestView.players.p1.hand.length;
  if (
    card.id !== `hidden-p1-${zone}-${zoneIndex}` ||
    card.cardSlot !== "__hidden__" ||
    card.characterId !== "__hidden__" ||
    card.ownerId !== "p1:hidden"
  ) {
    fail(`Host ${zone} card ${zoneIndex} was not replaced by a stable placeholder.`);
  }
});

const serializedGuestView = JSON.stringify(guestView);
if (hostPrivateIds.some((id) => serializedGuestView.includes(`"${id}"`))) {
  fail("Guest view contains a host-private card identifier.");
}
if (JSON.stringify(guestView.players.p2.hand) !== JSON.stringify(state.players.p2.hand)) {
  fail("Guest hand changed during redaction.");
}
if (JSON.stringify(guestView.players.p2.deck) !== JSON.stringify(state.players.p2.deck)) {
  fail("Guest deck changed during redaction.");
}
if (guestView.rng.seed !== 0 || guestView.rng.state !== 0 || guestView.rng.calls !== state.rng.calls) {
  fail("Guest RNG view was not redacted correctly.");
}
if ("transcript" in guestView) fail("Guest view contains the authoritative transcript.");

const privateChoiceKeys = [
  "scryDiscardIds",
  "scryOrderIds",
  "seekTakeIds",
  "searchPickId",
] as const;
const redactedEntries = [
  guestView.zones.fast.cards[0],
  guestView.pendingRedirectDecision?.reactionEntry,
];
redactedEntries.forEach((entry) => {
  const redactedEntry = entry ?? fail("Privacy fixture lost a stack entry.");
  privateChoiceKeys.forEach((key) => {
    if (key in redactedEntry) fail(`Guest view contains private ${key} metadata.`);
  });
});

console.log("PASS: guest snapshots redact host-private state without mutating authority");
