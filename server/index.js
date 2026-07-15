const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 8787;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 2;
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 120000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Universal Arena relay server is running.\n");
});

const wss = new WebSocketServer({ server });
const lobbies = new Map();

const send = (ws, payload) => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
};

const broadcast = (lobby, payload) => {
  lobby.players.forEach((player) => {
    send(player.ws, payload);
  });
};

const lobbySnapshot = (lobby) => ({
  code: lobby.code,
  hostId: lobby.hostId,
  matchActive: Boolean(lobby.matchSnapshot),
  players: Array.from(lobby.players.values()).map((player) => ({
    id: player.id,
    name: player.name,
    connected: player.connected,
    ready: player.ready,
  })),
});

const sendSnapshot = (lobby) => {
  broadcast(lobby, { type: "lobby_snapshot", lobby: lobbySnapshot(lobby) });
};

const sendAuthoritativeSnapshot = (lobby, ws) => {
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
};

const playersReadyToStart = (lobby) =>
  lobby.players.size === MAX_PLAYERS &&
  Array.from(lobby.players.values()).every((player) => player.connected && player.ready);

const isSha256 = (value) => typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);

const hasValidStateMetadata = (data) =>
  data &&
  Number.isInteger(data.actionId) &&
  data.actionId >= 0 &&
  data.state?.actionId === data.actionId &&
  isSha256(data.stateHash) &&
  isSha256(data.dataContentHash) &&
  Number.isInteger(data.dataSchemaVersion) &&
  data.dataSchemaVersion > 0 &&
  typeof data.engineVersion === "string" &&
  data.engineVersion.length > 0;

const resetReadyForChangedSetup = (lobby, nextSnapshot) => {
  const previous = lobby.selectionSnapshot;
  if (!previous?.selection || !previous?.names || !nextSnapshot?.selection || !nextSnapshot?.names) {
    return;
  }
  const guest = Array.from(lobby.players.values()).find((player) => player.id !== lobby.hostId);
  const seats = [
    { playerId: lobby.hostId, seat: "p1" },
    { playerId: guest?.id, seat: "p2" },
  ];
  seats.forEach(({ playerId, seat }) => {
    if (!playerId) return;
    const selectionChanged = JSON.stringify(previous.selection[seat]) !== JSON.stringify(nextSnapshot.selection[seat]);
    const nameChanged = previous.names[seat] !== nextSnapshot.names[seat];
    if (selectionChanged || nameChanged) {
      const player = lobby.players.get(playerId);
      if (player) player.ready = false;
    }
  });
};

const createLobbyCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

const closeLobby = (lobby, reason) => {
  broadcast(lobby, { type: "lobby_closed", reason });
  lobby.players.forEach((player) => {
    if (player.cleanupTimer) {
      clearTimeout(player.cleanupTimer);
      player.cleanupTimer = null;
    }
    if (player.ws?.uaClient) {
      player.ws.uaClient.lobbyCode = null;
    }
  });
  lobbies.delete(lobby.code);
};

const removePlayer = (lobby, playerId) => {
  const player = lobby.players.get(playerId);
  if (!player) return;

  if (player.cleanupTimer) {
    clearTimeout(player.cleanupTimer);
    player.cleanupTimer = null;
  }

  lobby.players.delete(playerId);

  if (!lobby.players.size) {
    lobbies.delete(lobby.code);
    return;
  }

  if (lobby.hostId === playerId) {
    closeLobby(lobby, "Host left the lobby.");
    return;
  }

  sendSnapshot(lobby);
};

const schedulePlayerCleanup = (lobby, player) => {
  if (player.cleanupTimer) {
    clearTimeout(player.cleanupTimer);
  }

  player.cleanupTimer = setTimeout(() => {
    player.cleanupTimer = null;
    const currentLobby = lobbies.get(lobby.code);
    if (!currentLobby) return;
    const currentPlayer = currentLobby.players.get(player.id);
    if (!currentPlayer || currentPlayer.connected) return;
    removePlayer(currentLobby, player.id);
  }, RECONNECT_GRACE_MS);
};

const leaveLobby = (client, options = {}) => {
  const code = client.lobbyCode;
  if (!code) return;

  const lobby = lobbies.get(code);
  if (!lobby) {
    client.lobbyCode = null;
    return;
  }

  const player = lobby.players.get(client.id);
  client.lobbyCode = null;
  if (!player) return;

  if (options.intentional) {
    removePlayer(lobby, client.id);
    return;
  }

  player.connected = false;
  player.ready = false;
  player.ws = null;
  player.disconnectedAt = Date.now();
  schedulePlayerCleanup(lobby, player);
  sendSnapshot(lobby);
};

const attachPlayer = (lobby, client) => {
  const existing = lobby.players.get(client.id);
  if (existing) {
    if (existing.cleanupTimer) {
      clearTimeout(existing.cleanupTimer);
      existing.cleanupTimer = null;
    }
    if (existing.ws && existing.ws !== client.ws && existing.ws.readyState === WebSocket.OPEN) {
      if (existing.ws.uaClient) {
        existing.ws.uaClient.lobbyCode = null;
      }
      send(existing.ws, { type: "session_replaced" });
      existing.ws.close();
    }
    existing.name = client.name;
    existing.ws = client.ws;
    existing.connected = true;
    existing.disconnectedAt = null;
    client.lobbyCode = lobby.code;
    sendSnapshot(lobby);
    sendAuthoritativeSnapshot(lobby, client.ws);
    return true;
  }

  if (lobby.players.size >= MAX_PLAYERS) {
    send(client.ws, { type: "error", message: "Lobby is full." });
    return false;
  }

  lobby.players.set(client.id, {
    id: client.id,
    name: client.name,
    ws: client.ws,
    connected: true,
    ready: false,
    disconnectedAt: null,
    cleanupTimer: null,
  });
  client.lobbyCode = lobby.code;
  sendSnapshot(lobby);
  sendAuthoritativeSnapshot(lobby, client.ws);
  return true;
};

wss.on("connection", (ws) => {
  const client = {
    id: null,
    name: null,
    lobbyCode: null,
  };

  ws.uaClient = client;

  ws.on("message", (raw) => {
    let message = null;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "Invalid JSON payload." });
      return;
    }

    if (!message?.type) return;

    if (message.type === "hello") {
      if (!message.clientId || !message.name) {
        send(ws, { type: "error", message: "Missing clientId or name." });
        return;
      }
      client.id = message.clientId;
      client.name = message.name.toString().slice(0, 20);
      client.ws = ws;
      send(ws, { type: "hello_ack", id: client.id });
      return;
    }

    if (!client.id || !client.name) {
      send(ws, { type: "error", message: "Send hello before joining a lobby." });
      return;
    }

    if (message.type === "create_lobby") {
      if (client.lobbyCode) {
        send(ws, { type: "error", message: "Already in a lobby." });
        return;
      }
      let code = createLobbyCode();
      while (lobbies.has(code)) {
        code = createLobbyCode();
      }
      const lobby = {
        code,
        hostId: client.id,
        players: new Map(),
        selectionSnapshot: null,
        matchSnapshot: null,
      };
      lobbies.set(code, lobby);
      attachPlayer(lobby, client);
      return;
    }

    if (message.type === "join_lobby" || message.type === "rejoin_lobby") {
      if (client.lobbyCode) {
        send(ws, { type: "error", message: "Already in a lobby." });
        return;
      }
      const code = (message.code || "").toString().trim().toUpperCase();
      const lobby = lobbies.get(code);
      if (!lobby) {
        send(ws, { type: "error", message: "Lobby not found." });
        return;
      }
      if (message.type === "rejoin_lobby" && !lobby.players.has(client.id)) {
        send(ws, { type: "error", message: "Your previous seat is no longer in that lobby." });
        return;
      }
      attachPlayer(lobby, client);
      return;
    }

    if (message.type === "leave_lobby") {
      leaveLobby(client, { intentional: true });
      return;
    }

    if (message.type === "set_ready") {
      const lobby = lobbies.get(client.lobbyCode);
      if (!lobby) {
        send(ws, { type: "error", message: "Not in a lobby." });
        return;
      }
      const player = lobby.players.get(client.id);
      if (!player) {
        send(ws, { type: "error", message: "Not in a lobby." });
        return;
      }
      player.ready = Boolean(message.ready);
      sendSnapshot(lobby);
      return;
    }

    if (message.type === "lobby_event" || message.type === "game_event") {
      const lobby = lobbies.get(client.lobbyCode);
      if (!lobby) {
        send(ws, { type: "error", message: "Not in a lobby." });
        return;
      }

      if (
        message.type === "lobby_event" &&
        ["start_match", "return_to_lobby"].includes(message.event) &&
        lobby.hostId !== client.id
      ) {
        send(ws, { type: "error", message: "Only the host can control the lobby." });
        return;
      }

      if (
        message.type === "game_event" &&
        ["state_update", "selection_update"].includes(message.event) &&
        lobby.hostId !== client.id
      ) {
        send(ws, { type: "error", message: "Only the host can update the match state." });
        return;
      }

      if (message.type === "lobby_event" && message.event === "return_to_lobby") {
        lobby.matchSnapshot = null;
        lobby.players.forEach((player) => {
          player.ready = false;
        });
        sendSnapshot(lobby);
      }

      if (message.type === "game_event" && message.event === "selection_update") {
        resetReadyForChangedSetup(lobby, message.data);
        lobby.selectionSnapshot = message.data ?? {};
        sendSnapshot(lobby);
      }

      if (message.type === "game_event" && message.event === "state_update") {
        if (!hasValidStateMetadata(message.data)) {
          send(ws, { type: "error", message: "Invalid state snapshot compatibility metadata." });
          return;
        }
        if (!lobby.matchSnapshot && !playersReadyToStart(lobby)) {
          send(ws, { type: "error", message: "Both connected players must be Ready before starting." });
          return;
        }
        lobby.matchSnapshot = {
          ...(lobby.matchSnapshot ?? {}),
          ...(message.data ?? {}),
          selection: message.data?.selection ?? lobby.matchSnapshot?.selection ?? lobby.selectionSnapshot?.selection,
          names: message.data?.names ?? lobby.matchSnapshot?.names ?? lobby.selectionSnapshot?.names,
        };
        if (message.data?.selection && message.data?.names) {
          lobby.selectionSnapshot = {
            selection: message.data.selection,
            names: message.data.names,
          };
        }
      }

      if (message.type === "game_event" && message.event === "sync_request") {
        if (sendAuthoritativeSnapshot(lobby, ws)) {
          return;
        }
      }

      broadcast(lobby, {
        type: message.type,
        event: message.event,
        data: message.data ?? {},
        from: client.id,
      });
    }
  });

  ws.on("close", () => {
    leaveLobby(client);
  });
});

server.listen(PORT, () => {
  console.log(`Universal Arena relay server listening on :${PORT}`);
});
