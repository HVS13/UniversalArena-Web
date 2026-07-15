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
    protocolVersion: 1,
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
  await sendAndWait(
    guest,
    {
      type: "game_event",
      event: "selection_request",
      data: { playerId: "p1", selection: ["x", "y", "z"], name: "Impostor" },
    },
    (message) => message.type === "error" && /Invalid selection/.test(message.message),
    "selection seat rejection"
  );
  await sendAndWait(
    guest,
    { type: "game_event", event: "action_error", data: { message: "forged" } },
    (message) => message.type === "error" && /Only the host/.test(message.message),
    "forged action error rejection"
  );
  await sendAndWait(
    guest,
    { type: "game_event", event: "unknown_event", data: {} },
    (message) => message.type === "error" && /Unsupported/.test(message.message),
    "unknown event rejection"
  );
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

  await sendAndWait(
    guest,
    { type: "game_event", event: "state_update", data: stateUpdate(9, 1) },
    (message) => message.type === "error" && /Only the host/.test(message.message),
    "guest authority rejection"
  );
  await sendAndWait(
    host,
    {
      type: "game_event",
      event: "state_update",
      data: { ...stateUpdate(1, 0), stateHash: `sha256:${"f".repeat(64)}` },
    },
    (message) => message.type === "error" && /Conflicting/.test(message.message),
    "conflicting snapshot rejection"
  );
  await sendAndWait(
    host,
    { type: "game_event", event: "state_update", data: stateUpdate(4, 3) },
    (message) => message.type === "error" && /skipped/.test(message.message),
    "skipped snapshot rejection"
  );

  const advancedState = waitFor(
    guest,
    (message) => message.type === "game_event" && message.event === "state_update" && message.data?.actionId === 1,
    "advanced authoritative state"
  );
  host.send(JSON.stringify({ type: "game_event", event: "state_update", data: stateUpdate(2, 1) }));
  await advancedState;
  const request = {
    protocolVersion: 1,
    requestId: "guest-test:1",
    baseActionId: 1,
    baseStateHash: stateUpdate(2, 1).stateHash,
    action: { type: "pass", playerId: "p2" },
  };
  const forwardedRequest = waitFor(
    host,
    (message) => message.type === "game_event" && message.event === "action_request" && message.data?.requestId === request.requestId,
    "valid action request forwarding"
  );
  guest.send(JSON.stringify({ type: "game_event", event: "action_request", data: request }));
  await forwardedRequest;
  await sendAndWait(
    guest,
    { type: "game_event", event: "action_request", data: request },
    (message) => message.type === "error" && /Duplicate/.test(message.message),
    "duplicate action rejection"
  );
  await sendAndWait(
    guest,
    {
      type: "game_event",
      event: "action_request",
      data: { ...request, requestId: "guest-test:2", baseActionId: 0 },
    },
    (message) => message.type === "error" && /Stale/.test(message.message),
    "stale action rejection"
  );
  await sendAndWait(
    guest,
    {
      type: "game_event",
      event: "action_request",
      data: { ...request, requestId: "guest-test:3", action: { type: "pass", playerId: "p1" } },
    },
    (message) => message.type === "error" && /Not your team/.test(message.message),
    "seat authority rejection"
  );
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
  console.log("PASS: relay authority, sequencing, deduplication, resync, and lobby reset");
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    relay.kill();
  });
