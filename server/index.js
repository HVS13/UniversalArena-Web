const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 8787;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 2;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Universal Arena relay server is running.\n");
});

const wss = new WebSocketServer({ server });
const lobbies = new Map();

const send = (ws, payload) => {
  if (ws.readyState === WebSocket.OPEN) {
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
  players: Array.from(lobby.players.values()).map((player) => ({
    id: player.id,
    name: player.name,
  })),
});

const sendSnapshot = (lobby) => {
  broadcast(lobby, { type: "lobby_snapshot", lobby: lobbySnapshot(lobby) });
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
    if (player.ws.uaClient) {
      player.ws.uaClient.lobbyCode = null;
    }
  });
  lobbies.delete(lobby.code);
};

const leaveLobby = (client) => {
  const code = client.lobbyCode;
  if (!code) return;

  const lobby = lobbies.get(code);
  if (!lobby) {
    client.lobbyCode = null;
    return;
  }

  lobby.players.delete(client.id);
  client.lobbyCode = null;

  if (!lobby.players.size) {
    lobbies.delete(code);
    return;
  }

  if (lobby.hostId === client.id) {
    closeLobby(lobby, "Host left the lobby.");
    return;
  }

  sendSnapshot(lobby);
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
      };
      lobby.players.set(client.id, { id: client.id, name: client.name, ws });
      client.lobbyCode = code;
      lobbies.set(code, lobby);
      sendSnapshot(lobby);
      return;
    }

    if (message.type === "join_lobby") {
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
      if (lobby.players.size >= MAX_PLAYERS) {
        send(ws, { type: "error", message: "Lobby is full." });
        return;
      }
      lobby.players.set(client.id, { id: client.id, name: client.name, ws });
      client.lobbyCode = code;
      sendSnapshot(lobby);
      return;
    }

    if (message.type === "leave_lobby") {
      leaveLobby(client);
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
