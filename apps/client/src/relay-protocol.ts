import { dataManifest } from "@ua/data";
import { engineVersion, hashMatchState, type MatchState } from "@ua/core";

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
export type StateSyncPayload = SetupSyncPayload & {
  protocolVersion: number;
  state: MatchState;
  actionId: number;
  stateHash: string;
  engineVersion: string;
  dataSchemaVersion: number;
  dataContentHash: string;
};

export const clientVersion = "0.2.0-friend-alpha";
export const relayVersion = "0.2.0-friend-alpha";
export const relayProtocolVersion = 1;
export const defaultRelayUrl = import.meta.env.VITE_RELAY_URL ?? "ws://localhost:8787";
export const multiplayerSeatCount = 2;

export const validateStateSyncPayload = (data: Partial<StateSyncPayload>) => {
  if (data.protocolVersion !== relayProtocolVersion) return "Relay protocol version mismatch.";
  if (data.engineVersion !== engineVersion) return "Engine version mismatch; resync required.";
  if (data.dataSchemaVersion !== dataManifest.schemaVersion) return "Data schema mismatch; resync required.";
  if (data.dataContentHash !== dataManifest.contentHash) return "Data content mismatch; resync required.";
  if (!data.state || !Number.isInteger(data.actionId) || data.state.actionId !== data.actionId) {
    return "Invalid authoritative action ID; resync required.";
  }
  if (typeof data.stateHash !== "string" || hashMatchState(data.state) !== data.stateHash) {
    return "Authoritative state hash mismatch; resync required.";
  }
  return null;
};

export const createStateSyncPayload = (
  state: MatchState,
  setup?: Partial<SetupSyncPayload>
) => ({
  protocolVersion: relayProtocolVersion,
  state,
  actionId: state.actionId,
  stateHash: hashMatchState(state),
  engineVersion,
  dataSchemaVersion: dataManifest.schemaVersion,
  dataContentHash: dataManifest.contentHash,
  ...setup,
});

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
