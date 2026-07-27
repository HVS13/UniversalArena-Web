from phase1d_patch_lib import replace_once, root

path = root / "server/test.js"
text = path.read_text(encoding="utf-8")
text = replace_once(text, "    protocolVersion: 1,", "    protocolVersion: 2,", "test protocol version")
text = replace_once(text, '    engineVersion: "0.2.0-friend-alpha",', '    engineVersion: "0.2.1-friend-alpha",', "test compatibility version")
anchor = '''  const stateUpdate = (turn, actionId) => ({
    state: { turn, actionId },
    actionId,
    stateHash: `sha256:${String(actionId).padStart(64, "0")}`,
    ...compatibility,
  });'''
replacement = '''  const stateUpdate = (turn, actionId) => {
    const state = {
      turn,
      actionId,
      players: {
        p1: {
          hand: [{ id: `p1-hand-${actionId}`, cardSlot: "p1-secret" }],
          deck: [{ id: `p1-deck-${actionId}`, cardSlot: "p1-deck-secret" }],
        },
        p2: {
          hand: [{ id: `p2-hand-${actionId}`, cardSlot: "p2-private" }],
          deck: [{ id: `p2-deck-${actionId}`, cardSlot: "p2-deck-private" }],
        },
      },
      rng: { seed: 123, state: 456 + actionId, calls: actionId },
      transcript: { actions: [{ secret: "authoritative" }] },
    };
    const guestState = {
      ...state,
      players: {
        p1: {
          hand: [{ id: "hidden:p1:hand:0", cardSlot: "hidden" }],
          deck: [{ id: "hidden:p1:deck:0", cardSlot: "hidden" }],
        },
        p2: state.players.p2,
      },
      rng: { seed: 0, state: 0, calls: 0 },
    };
    delete guestState.transcript;
    return {
      state,
      guestState,
      actionId,
      stateHash: `sha256:${String(actionId).padStart(64, "0")}`,
      guestStateHash: `sha256:${String(actionId + 100).padStart(64, "0")}`,
      ...compatibility,
    };
  };'''
text = replace_once(text, anchor, replacement, "privacy test state payload")
text = replace_once(
    text,
    '''  await initialState;
''',
    '''  const initialGuestSnapshot = await initialState;
  const initialPayload = stateUpdate(1, 0);
  if (initialGuestSnapshot.data.stateHash !== initialPayload.guestStateHash) {
    throw new Error("Guest received the authoritative state hash.");
  }
  if (
    initialGuestSnapshot.data.state.players.p1.hand[0]?.cardSlot !== "hidden" ||
    initialGuestSnapshot.data.state.players.p1.deck[0]?.cardSlot !== "hidden"
  ) {
    throw new Error("Guest received opponent private card identity.");
  }
  if (initialGuestSnapshot.data.state.players.p2.hand[0]?.cardSlot !== "p2-private") {
    throw new Error("Guest lost access to its own private hand.");
  }
  if (
    initialGuestSnapshot.data.state.rng.seed !== 0 ||
    initialGuestSnapshot.data.state.transcript ||
    initialGuestSnapshot.data.guestState ||
    initialGuestSnapshot.data.guestStateHash
  ) {
    throw new Error("Guest snapshot exposed authoritative private metadata.");
  }
''',
    "initial guest privacy assertions",
)
text = replace_once(
    text,
    '''    protocolVersion: 1,
    requestId: "guest-test:1",
    baseActionId: 1,
    baseStateHash: stateUpdate(2, 1).stateHash,
''',
    '''    protocolVersion: 2,
    requestId: "guest-test:1",
    baseActionId: 1,
    baseStateHash: stateUpdate(2, 1).guestStateHash,
''',
    "guest request view hash",
)
anchor = '''  const restored = await sendAndWait(
    guest,
    { type: "game_event", event: "sync_request", data: {} },
    (message) => message.type === "game_event" && message.from === "relay" && message.data?.state?.turn === 2,
    "merged authoritative snapshot"
  );'''
replacement = '''  const hostRestored = await sendAndWait(
    host,
    { type: "game_event", event: "sync_request", data: {} },
    (message) => message.type === "game_event" && message.from === "relay" && message.data?.state?.turn === 2,
    "host authoritative snapshot"
  );
  if (
    hostRestored.data.state.players.p1.hand[0]?.cardSlot !== "p1-secret" ||
    hostRestored.data.state.rng.seed !== 123 ||
    !hostRestored.data.state.transcript
  ) {
    throw new Error("Host did not receive the authoritative state.");
  }
  if (hostRestored.data.guestState || hostRestored.data.guestStateHash) {
    throw new Error("Host snapshot exposed relay-only guest envelope fields.");
  }

  const restored = await sendAndWait(
    guest,
    { type: "game_event", event: "sync_request", data: {} },
    (message) => message.type === "game_event" && message.from === "relay" && message.data?.state?.turn === 2,
    "guest privacy snapshot"
  );'''
text = replace_once(text, anchor, replacement, "host and guest resync coverage")
text = replace_once(
    text,
    '''  if (restored.data.actionId !== 1 || !restored.data.stateHash || restored.data.dataContentHash !== compatibility.dataContentHash) {
    throw new Error("Authoritative snapshot discarded compatibility metadata.");
  }
''',
    '''  if (restored.data.actionId !== 1 || !restored.data.stateHash || restored.data.dataContentHash !== compatibility.dataContentHash) {
    throw new Error("Guest snapshot discarded compatibility metadata.");
  }
  if (
    restored.data.stateHash !== stateUpdate(2, 1).guestStateHash ||
    restored.data.state.players.p1.hand[0]?.cardSlot !== "hidden" ||
    restored.data.state.players.p1.deck[0]?.cardSlot !== "hidden" ||
    restored.data.state.rng.seed !== 0 ||
    restored.data.state.transcript
  ) {
    throw new Error("Guest resync exposed authoritative private state.");
  }
''',
    "guest resync privacy assertions",
)
text = replace_once(
    text,
    '  console.log("PASS: relay authority, sequencing, deduplication, resync, and lobby reset");',
    '  console.log("PASS: relay authority, seat-scoped privacy, sequencing, deduplication, resync, and lobby reset");',
    "server test label",
)
path.write_text(text, encoding="utf-8")
