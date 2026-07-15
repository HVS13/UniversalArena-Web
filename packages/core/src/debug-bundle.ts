import { dataManifest } from "@ua/data";
import {
  engineVersion,
  exportTranscript,
  hashMatchState,
  replayTranscript,
  type MatchState,
  type MatchTranscript,
} from "./index.js";

export const debugBundleVersion = 1;

export type DebugBundle = {
  bundleVersion: typeof debugBundleVersion;
  exportedAt: string;
  versions: {
    client: string;
    engine: string;
    relay: string;
    protocol: number;
  };
  data: {
    schemaVersion: number;
    contentHash: string;
    sourceRepository: string;
    sourceCommit: string;
  };
  final: {
    actionId: number;
    stateHash: string;
    turn: number;
    phase: MatchState["phase"];
    winnerId: MatchState["winnerId"];
  };
  transcript: MatchTranscript;
  recentLog: string[];
};

type DebugBundleOptions = {
  exportedAt?: string;
  clientVersion: string;
  relayVersion: string;
  protocolVersion: number;
  recentLogLimit?: number;
};

const anonymize = (value: string, names: string[]) =>
  names.reduce(
    (text, name, index) =>
      name ? text.replaceAll(name, `Player ${index + 1}`) : text,
    value
  );

export const createDebugBundle = (
  state: MatchState,
  options: DebugBundleOptions
): DebugBundle => {
  const transcript = exportTranscript(state);
  if (!transcript) throw new Error("This match was not recorded and cannot be exported.");

  const names = transcript.players.map((player) => player.name);
  transcript.players = transcript.players.map((player, index) => ({
    ...player,
    name: `Player ${index + 1}`,
  }));

  return {
    bundleVersion: debugBundleVersion,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    versions: {
      client: options.clientVersion,
      engine: engineVersion,
      relay: options.relayVersion,
      protocol: options.protocolVersion,
    },
    data: {
      schemaVersion: dataManifest.schemaVersion,
      contentHash: dataManifest.contentHash,
      sourceRepository: dataManifest.sourceRepository,
      sourceCommit: dataManifest.sourceCommit,
    },
    final: {
      actionId: state.actionId,
      stateHash: hashMatchState(state),
      turn: state.turn,
      phase: state.phase,
      winnerId: state.winnerId,
    },
    transcript,
    recentLog: state.log
      .slice(-(options.recentLogLimit ?? 100))
      .map((entry) => anonymize(entry, names)),
  };
};

export const verifyDebugBundle = (bundle: DebugBundle | unknown, roster: Parameters<typeof replayTranscript>[0]) => {
  if (!bundle || typeof bundle !== "object") return { ok: false, error: "Invalid debug bundle." };
  const candidate = bundle as Partial<DebugBundle>;
  if (candidate.bundleVersion !== debugBundleVersion) {
    return { ok: false, error: `Unsupported debug bundle version ${String(candidate.bundleVersion)}.` };
  }
  if (!candidate.transcript || !candidate.final) return { ok: false, error: "Debug bundle is incomplete." };

  const replay = replayTranscript(roster, candidate.transcript);
  if (replay.error) return { ok: false, error: replay.error };
  if (!replay.state) return { ok: false, error: "Debug bundle replay produced no state." };
  const replayHash = hashMatchState(replay.state);
  if (replayHash !== candidate.final.stateHash) {
    return { ok: false, error: `Debug bundle state hash mismatch: expected ${candidate.final.stateHash}, got ${replayHash}.` };
  }
  return { ok: true, state: replay.state };
};
