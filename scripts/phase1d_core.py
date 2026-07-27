from phase1d_patch_lib import replace_once, root

path = root / "packages/core/src/index.ts"
text = path.read_text(encoding="utf-8")
anchor = '''export const serializeMatchState = (state: MatchState) => serializeGameplayState(state);
export const hashMatchState = (state: MatchState) => hashGameplayState(state);

export {
'''
replacement = '''export const serializeMatchState = (state: MatchState) => serializeGameplayState(state);
export const hashMatchState = (state: MatchState) => hashGameplayState(state);

const createHiddenCardInstances = (
  cards: CardInstance[],
  playerId: PlayerId,
  pile: "hand" | "deck"
): CardInstance[] =>
  cards.map((_, index) => ({
    id: `hidden:${playerId}:${pile}:${index}`,
    cardSlot: "hidden",
    characterId: "hidden",
    ownerId: `${playerId}:hidden`,
    costAdjustment: 0,
  }));

const redactPrivateStackEntry = (entry: StackEntry, viewerId: PlayerId): StackEntry => {
  if (entry.playedBy === viewerId) return entry;
  const redacted = { ...entry };
  delete redacted.scryDiscardIds;
  delete redacted.scryOrderIds;
  delete redacted.seekTakeIds;
  delete redacted.searchPickId;
  return redacted;
};

export const createPlayerStateView = (
  state: MatchState,
  viewerId: PlayerId
): MatchState => {
  const view = cloneState(state);
  const opponentId = getOpponentId(viewerId);
  view.players[opponentId].hand = createHiddenCardInstances(
    view.players[opponentId].hand,
    opponentId,
    "hand"
  );
  view.players[opponentId].deck = createHiddenCardInstances(
    view.players[opponentId].deck,
    opponentId,
    "deck"
  );
  (Object.values(view.zones) as ZoneState[]).forEach((zone) => {
    zone.cards = zone.cards.map((entry) => redactPrivateStackEntry(entry, viewerId));
  });
  if (view.pendingRedirectDecision?.reactionEntry) {
    view.pendingRedirectDecision.reactionEntry = redactPrivateStackEntry(
      view.pendingRedirectDecision.reactionEntry,
      viewerId
    );
  }
  if (
    view.pendingInnateDecision &&
    view.pendingInnateDecision.playerId !== viewerId
  ) {
    delete view.pendingInnateDecision;
  }
  view.rng = { seed: 0, state: 0, calls: 0 };
  delete view.transcript;
  return view;
};

export const hashPlayerStateView = (state: MatchState, viewerId: PlayerId) =>
  hashMatchState(createPlayerStateView(state, viewerId));

export {
'''
text = replace_once(text, anchor, replacement, "core state-view insertion")
path.write_text(text, encoding="utf-8")
