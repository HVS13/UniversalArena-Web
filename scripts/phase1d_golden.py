from phase1d_patch_lib import replace_once, root

path = root / "packages/core/src/golden.ts"
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  createDebugBundle,
  createMatchState,
  exportTranscript,
''',
    '''  createDebugBundle,
  createMatchState,
  createPlayerStateView,
  exportTranscript,
''',
    "golden import createPlayerStateView",
)
text = replace_once(
    text,
    '''  hashMatchState,
  replayTranscript,
''',
    '''  hashMatchState,
  hashPlayerStateView,
  replayTranscript,
''',
    "golden import hashPlayerStateView",
)
anchor = '''    const initial = createMatchState(roster, players, { seed: 424242, enableTranscript: true });
    const initialHash = hashMatchState(initial);
'''
replacement = '''    const initial = createMatchState(roster, players, { seed: 424242, enableTranscript: true });
    const p2View = createPlayerStateView(initial, "p2");
    if (p2View === initial) throw new Error("Player state view reused the authoritative object.");
    if (JSON.stringify(p2View.players.p2.hand) !== JSON.stringify(initial.players.p2.hand)) {
      throw new Error("Player state view changed the viewer's hand.");
    }
    if (JSON.stringify(p2View.players.p2.deck) !== JSON.stringify(initial.players.p2.deck)) {
      throw new Error("Player state view changed the viewer's deck.");
    }
    if (p2View.players.p1.hand.length !== initial.players.p1.hand.length) {
      throw new Error("Player state view changed the opponent hand count.");
    }
    if (p2View.players.p1.deck.length !== initial.players.p1.deck.length) {
      throw new Error("Player state view changed the opponent deck count.");
    }
    if (
      p2View.players.p1.hand.some((card) => card.cardSlot !== "hidden") ||
      p2View.players.p1.deck.some((card) => card.cardSlot !== "hidden")
    ) {
      throw new Error("Player state view exposed opponent private card identity.");
    }
    if (p2View.rng.seed !== 0 || p2View.rng.state !== 0 || p2View.rng.calls !== 0) {
      throw new Error("Player state view exposed authoritative RNG state.");
    }
    if (p2View.transcript) throw new Error("Player state view exposed the match transcript.");
    const p2ViewHash = hashPlayerStateView(initial, "p2");
    if (p2ViewHash !== hashMatchState(p2View)) {
      throw new Error("Player state-view hash does not match the serialized view.");
    }
    const hiddenMutation = JSON.parse(JSON.stringify(initial)) as MatchState;
    hiddenMutation.players.p1.hand[0]!.cardSlot = "private-opponent-change";
    if (hashPlayerStateView(hiddenMutation, "p2") !== p2ViewHash) {
      throw new Error("Opponent hidden card identity leaked into the player state-view hash.");
    }
    const visibleMutation = JSON.parse(JSON.stringify(initial)) as MatchState;
    visibleMutation.players.p2.hand[0]!.cardSlot = "viewer-private-change";
    if (hashPlayerStateView(visibleMutation, "p2") === p2ViewHash) {
      throw new Error("Viewer private state was omitted from the player state-view hash.");
    }
    if (initial.rng.seed === 0 || !initial.transcript) {
      throw new Error("Player state-view creation mutated the authoritative state.");
    }
    const initialHash = hashMatchState(initial);
'''
text = replace_once(text, anchor, replacement, "golden privacy assertions")
path.write_text(text, encoding="utf-8")
