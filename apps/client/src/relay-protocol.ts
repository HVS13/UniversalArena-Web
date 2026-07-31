import { dataManifest } from "@ua/data";
import { engineVersion, hashMatchState, type MatchState, type PlayerId } from "@ua/core";

export type SelectionState = { p1: string[]; p2: string[] };
export type RelayConnectionStatus = "idle" | "connecting" | "connected";
export type RelayLobbySnapshot = {
  code: string;
  hostId: string;
  matchActive?: boolean;
  players: { id: string; name: string; connected?: boolean; ready?: boolean }[];
};
export type RelayEventMessage = {
  type: "lobby_event" | "game_event";
  event: string;
  data?: Record<string, unknown>;
  from?: string;
};
export type SetupSyncPayload = {
  selection: SelectionState;
  names: { p1: string; p2: string };
};
export type StateSyncPayload = Partial<SetupSyncPayload> & {
  protocolVersion: number;
  state: MatchState;
  actionId: number;
  stateHash: string;
  authoritativeStateHash: string;
  engineVersion: string;
  dataSchemaVersion: number;
  dataContentHash: string;
};
export type HostStateSyncPayload = StateSyncPayload & {
  guestState: MatchState;
  guestStateHash: string;
};

export const clientVersion = "0.2.1-friend-alpha";
export const relayVersion = "0.2.1-friend-alpha";
export const relayProtocolVersion = 2;
export const defaultRelayUrl = import.meta.env?.VITE_RELAY_URL ?? "ws://localhost:8787";
export const multiplayerSeatCount = 2;

const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);

const hiddenCard = (zone: "hand" | "deck", index: number) => ({
  id: `hidden-p1-${zone}-${index}`,
  cardSlot: "__hidden__",
  characterId: "__hidden__",
  ownerId: "p1:hidden",
  costAdjustment: 0,
});

export const createGuestStateView = (state: MatchState): MatchState => {
  const view = JSON.parse(JSON.stringify(state)) as MatchState;
  view.players.p1.hand = state.players.p1.hand.map((_, index) => hiddenCard("hand", index));
  view.players.p1.deck = state.players.p1.deck.map((_, index) => hiddenCard("deck", index));
  view.rng = { seed: 0, state: 0, calls: state.rng.calls };
  delete view.transcript;
  (Object.keys(view.zones) as Array<keyof MatchState["zones"]>).forEach((zone) => {
    view.zones[zone].cards.forEach((entry) => {
      delete entry.scryDiscardIds;
      delete entry.scryOrderIds;
      delete entry.seekTakeIds;
      delete entry.searchPickId;
    });
  });
  if (view.pendingRedirectDecision?.reactionEntry) {
    delete view.pendingRedirectDecision.reactionEntry.scryDiscardIds;
    delete view.pendingRedirectDecision.reactionEntry.scryOrderIds;
    delete view.pendingRedirectDecision.reactionEntry.seekTakeIds;
    delete view.pendingRedirectDecision.reactionEntry.searchPickId;
  }
  return view;
};

export const validateStateSyncPayload = (data: Partial<StateSyncPayload>) => {
  if (data.protocolVersion !== relayProtocolVersion) return "Relay protocol version mismatch.";
  if (data.engineVersion !== engineVersion) return "Engine version mismatch; resync required.";
  if (data.dataSchemaVersion !== dataManifest.schemaVersion) return "Data schema mismatch; resync required.";
  if (data.dataContentHash !== dataManifest.contentHash) return "Data content mismatch; resync required.";
  if (!data.state || !Number.isInteger(data.actionId) || data.state.actionId !== data.actionId) {
    return "Invalid authoritative action ID; resync required.";
  }
  if (!isSha256(data.authoritativeStateHash)) {
    return "Invalid authoritative state hash; resync required.";
  }
  if (!isSha256(data.stateHash) || hashMatchState(data.state) !== data.stateHash) {
    return "Seat state hash mismatch; resync required.";
  }
  return null;
};

export const createStateSyncPayload = (
  state: MatchState,
  setup?: Partial<SetupSyncPayload>
): HostStateSyncPayload => {
  const stateHash = hashMatchState(state);
  const guestState = createGuestStateView(state);
  return {
    protocolVersion: relayProtocolVersion,
    state,
    actionId: state.actionId,
    stateHash,
    authoritativeStateHash: stateHash,
    guestState,
    guestStateHash: hashMatchState(guestState),
    engineVersion,
    dataSchemaVersion: dataManifest.schemaVersion,
    dataContentHash: dataManifest.contentHash,
    ...setup,
  };
};

export const getSeatForClient = (
  lobby: RelayLobbySnapshot | null,
  clientId: string
): PlayerId | null => {
  if (!lobby) return null;
  if (lobby.hostId === clientId) return "p1";
  return lobby.players.some((player) => player.id === clientId) ? "p2" : null;
};

const storedLobbyCodeKey = "ua-relay-lobby-code";
const storedRelayNameKey = "ua-relay-display-name";

const createClientId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `client-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
};

export const getStoredClientId = () => {
  if (typeof window === "undefined") return createClientId();
  const stored = window.localStorage.getItem("ua-client-id");
  if (stored) return stored;
  const next = createClientId();
  window.localStorage.setItem("ua-client-id", next);
  return next;
};

export const getStoredLobbyCode = () =>
  typeof window === "undefined" ? "" : window.localStorage.getItem(storedLobbyCodeKey) ?? "";

export const storeLobbyCode = (code: string) => {
  if (typeof window !== "undefined") window.localStorage.setItem(storedLobbyCodeKey, code);
};

export const clearStoredLobbyCode = () => {
  if (typeof window !== "undefined") window.localStorage.removeItem(storedLobbyCodeKey);
};

export const getStoredRelayName = () =>
  typeof window === "undefined"
    ? "Player 1"
    : window.localStorage.getItem(storedRelayNameKey) ?? "Player 1";

export const storeRelayName = (name: string) => {
  if (typeof window !== "undefined") window.localStorage.setItem(storedRelayNameKey, name);
};
