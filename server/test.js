const { spawn } = require("node:child_process");
const path = require("node:path");
const { WebSocket } = require("ws");

const port = 18870 + Math.floor(Math.random() * 500);
const relay = spawn(process.execPath, [path.join(__dirname, "index.js")], {
  env: { ...process.env, PORT: String(port), RECONNECT_GRACE_MS: "100" },
  stdio: ["ignore", "pipe", "inherit"],
});

const waitForOutput = () => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Relay did not start.")), 5000);
  relay.stdout.on("data", (chunk) => {
    if (!chunk.toString().includes("listening")) return;
    clearTimeout(timer);
    resolve();
  });
});

const connect = (id, name) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.once("error", reject);
  ws.once("open", () => {
    ws.send(JSON.stringify({ type: "hello", clientId: id, name }));
    resolve(ws);
  });
});

const waitFor = (ws, predicate, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    ws.off("message", onMessage);
    reject(new Error(`Timed out waiting for ${label}.`));
  }, 3000);
  const onMessage = (raw) => {
    const message = JSON.parse(raw.toString());
    if (!predicate(message)) return;
    clearTimeout(timer);
    ws.off("message", onMessage);
    resolve(message);
  };
  ws.on("message", onMessage);
});

const sendAndWait = (ws, payload, predicate, label) => {
  const pending = waitFor(ws, predicate, label);
  ws.send(JSON.stringify(payload));
  return pending;
};

const run = async () => {
  await waitForOutput();
  const host = await connect("host-test", "Host");
  const guest = await connect("guest-test", "Guest");

  const created = await sendAndWait(
    host,
    { type: "create_lobby" },
    (message) => message.type === "lobby_snapshot" && message.lobby.players.length === 1,
    "host lobby creation"
  );
  const code = created.lobby.code;
  await sendAndWait(
    guest,
    { type: "join_lobby", code },
    (message) => message.type === "lobby_snapshot" && message.lobby.players.length === 2,
    "guest join"
  );

  const setup = {
    selection: { p1: ["a", "b", "c"], p2: ["d", "e", "f"] },
    names: { p1: "Alpha", p2: "Bravo" },
  };
  const compatibility = {
    engineVersion: "0.1.0",
    dataSchemaVersion: 1,
    dataContentHash: `sha256:${"a".repeat(64)}`,
  };
  const stateUpdate = (turn, actionId) => ({
    state: { turn, actionId },
    actionId,
    stateHash: `sha256:${String(actionId).padStart(64, "0")}`,
    ...compatibility,
  });
  host.send(JSON.stringify({ type: "game_event", event: "selection_update", data: setup }));
  const blocked = await sendAndWait(
    host,
    { type: "game_event", event: "state_update", data: { ...stateUpdate(1, 0), ...setup } },
    (message) => message.type === "error" && /Ready/.test(message.message),
    "server readiness rejection"
  );
  if (!blocked) throw new Error("Relay accepted a match before both players were ready.");

  host.send(JSON.stringify({ type: "set_ready", ready: true }));
  await sendAndWait(
    guest,
    { type: "set_ready", ready: true },
    (message) => message.type === "lobby_snapshot" && message.lobby.players.every((player) => player.ready),
    "both players ready"
  );

  const initialState = waitFor(
    guest,
    (message) => message.type === "game_event" && message.event === "state_update" && message.data?.state?.turn === 1,
    "initial state"
  );
  host.send(JSON.stringify({ type: "game_event", event: "state_update", data: { ...stateUpdate(1, 0), ...setup } }));
  await initialState;

  host.send(JSON.stringify({ type: "game_event", event: "state_update", data: stateUpdate(2, 1) }));
  const restored = await sendAndWait(
    guest,
    { type: "game_event", event: "sync_request", data: {} },
    (message) => message.type === "game_event" && message.from === "relay" && message.data?.state?.turn === 2,
    "merged authoritative snapshot"
  );
  if (!restored.data.selection || !restored.data.names) {
    throw new Error("Later state update discarded setup metadata.");
  }
  if (restored.data.actionId !== 1 || !restored.data.stateHash || restored.data.dataContentHash !== compatibility.dataContentHash) {
    throw new Error("Authoritative snapshot discarded compatibility metadata.");
  }

  const returned = await sendAndWait(
    host,
    { type: "lobby_event", event: "return_to_lobby", data: {} },
    (message) => message.type === "lobby_snapshot" && !message.lobby.matchActive,
    "return to lobby"
  );
  if (returned.lobby.players.some((player) => player.ready)) {
    throw new Error("Ready state survived return to lobby.");
  }

  host.close();
  guest.close();
  console.log("PASS: relay readiness, snapshot merge, sync, and lobby reset");
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    relay.kill();
  });
