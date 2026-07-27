from phase1d_patch_lib import replace_once, root

path = root / "server/index.js"
text = path.read_text(encoding="utf-8-sig")
text = replace_once(text, "const PROTOCOL_VERSION = 1;", "const PROTOCOL_VERSION = 2;", "server protocol version")
anchor = '''const sendAuthoritativeSnapshot = (lobby, ws) => {
  if (lobby.matchSnapshot) {
    send(ws, {
      type: "game_event",
      event: "state_update",
      data: lobby.matchSnapshot,
      from: "relay",
    });
    return true;
  }

  if (lobby.selectionSnapshot) {
    send(ws, {
      type: "game_event",
      event: "selection_update",
      data: lobby.selectionSnapshot,
      from: "relay",
    });
    return true;
  }

  return false;
};'''
replacement = '''const stateSnapshotForPlayer = (lobby, playerId) => {
  if (!lobby.matchSnapshot) return null;
  const {
    guestState,
    guestStateHash,
    ...authoritativeSnapshot
  } = lobby.matchSnapshot;
  if (playerId === lobby.hostId) return authoritativeSnapshot;
  return {
    ...authoritativeSnapshot,
    state: guestState,
    stateHash: guestStateHash,
  };
};

const sendAuthoritativeSnapshot = (lobby, player) => {
  const stateSnapshot = stateSnapshotForPlayer(lobby, player.id);
  if (stateSnapshot) {
    send(player.ws, {
      type: "game_event",
      event: "state_update",
      data: stateSnapshot,
      from: "relay",
    });
    return true;
  }

  if (lobby.selectionSnapshot) {
    send(player.ws, {
      type: "game_event",
      event: "selection_update",
      data: lobby.selectionSnapshot,
      from: "relay",
    });
    return true;
  }

  return false;
};

const broadcastAuthoritativeSnapshot = (lobby, from) => {
  lobby.players.forEach((player) => {
    const stateSnapshot = stateSnapshotForPlayer(lobby, player.id);
    if (!stateSnapshot) return;
    send(player.ws, {
      type: "game_event",
      event: "state_update",
      data: stateSnapshot,
      from,
    });
  });
};'''
text = replace_once(text, anchor, replacement, "personalized relay snapshots")
text = replace_once(
    text,
    '''  data.state?.actionId === data.actionId &&
  isSha256(data.stateHash) &&
  isSha256(data.dataContentHash) &&''',
    '''  data.state?.actionId === data.actionId &&
  data.guestState?.actionId === data.actionId &&
  isSha256(data.stateHash) &&
  isSha256(data.guestStateHash) &&
  isSha256(data.dataContentHash) &&''',
    "guest snapshot metadata validation",
)
text = replace_once(
    text,
    '''    sendSnapshot(lobby);
    sendAuthoritativeSnapshot(lobby, client.ws);
    return true;''',
    '''    sendSnapshot(lobby);
    sendAuthoritativeSnapshot(lobby, existing);
    return true;''',
    "existing player snapshot",
)
text = replace_once(
    text,
    '''  sendSnapshot(lobby);
  sendAuthoritativeSnapshot(lobby, client.ws);
  return true;
};''',
    '''  sendSnapshot(lobby);
  sendAuthoritativeSnapshot(lobby, lobby.players.get(client.id));
  return true;
};''',
    "new player snapshot",
)
text = replace_once(
    text,
    '''        if (message.data?.selection && message.data?.names) {
          lobby.selectionSnapshot = {
            selection: message.data.selection,
            names: message.data.names,
          };
        }
      }

      if (message.type === "game_event" && message.event === "action_request") {''',
    '''        if (message.data?.selection && message.data?.names) {
          lobby.selectionSnapshot = {
            selection: message.data.selection,
            names: message.data.names,
          };
        }
        broadcastAuthoritativeSnapshot(lobby, client.id);
        return;
      }

      if (message.type === "game_event" && message.event === "action_request") {''',
    "personalized state broadcast",
)
text = replace_once(
    text,
    '''          message.data.baseActionId !== lobby.matchSnapshot.actionId ||
          message.data.baseStateHash !== lobby.matchSnapshot.stateHash
''',
    '''          message.data.baseActionId !== lobby.matchSnapshot.actionId ||
          message.data.baseStateHash !== lobby.matchSnapshot.guestStateHash
''',
    "relay guest action hash",
)
text = replace_once(
    text,
    '''        if (sendAuthoritativeSnapshot(lobby, ws)) {''',
    '''        const player = lobby.players.get(client.id);
        if (player && sendAuthoritativeSnapshot(lobby, player)) {''',
    "sync personalized snapshot",
)
path.write_text(text, encoding="utf-8")
