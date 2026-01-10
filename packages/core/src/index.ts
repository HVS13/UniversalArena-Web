import { statusEffects } from "@ua/data";
import { createRngState, nextFloat, nextInt } from "./rng.ts";
import type { RngState } from "./rng.ts";
import type {
  Card,
  Character,
  Effect,
  EffectAmount,
  EffectCondition,
  EffectScalar,
  EffectTarget,
  StatusEffectDefinition,
  StatusValueStat,
} from "@ua/data";

export type PlayerId = "p1" | "p2";
export type MatchCharacterId = string;
export type ZoneName = "fast" | "normal" | "slow";

type ActionType = "attack" | "defense" | "special";

type StatusMode = "potency_count" | "stack" | "value";

export type StatusState = {
  potency: number;
  count: number;
  stack: number;
  value: number;
};

export type CardInstance = {
  id: string;
  cardSlot: string;
  characterId: string;
  ownerId: MatchCharacterId;
  costAdjustment: number;
};

type EntryKeywords = {
  evade?: boolean;
  counter?: boolean;
  reuse?: boolean;
  followUp?: boolean;
  assistAttack?: boolean;
};

export type MatchCharacter = {
  id: MatchCharacterId;
  characterId: string;
  name: string;
  hp: number;
  shield: number;
  statuses: Record<string, StatusState>;
  resourceMax: Record<string, number>;
  position: number;
  defeated: boolean;
  turnFlags: TurnFlags;
};

export type MatchTeam = {
  id: PlayerId;
  name: string;
  energy: number;
  ultimate: number;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  exhausted: CardInstance[];
  defeated: CardInstance[];
  characters: MatchCharacter[];
};

export type StackEntry = {
  id: string;
  cardSlot: string;
  cardName: string;
  powerText: string;
  effectText: string[];
  effects?: Effect[];
  grantedKeywords?: EntryKeywords;
  types: string[];
  speed: string;
  playedBy: PlayerId;
  sourceId: MatchCharacterId;
  targetId: MatchCharacterId;
  targetText?: string;
  xValue: number;
  choiceIndex?: number;
  redirectTargetId?: MatchCharacterId;
  scryDiscardIds?: string[];
  scryOrderIds?: string[];
  seekTakeIds?: string[];
  searchPickId?: string;
  pushDirection?: "left" | "right";
  rolledPower?: number;
  mitigationText?: string[];
  cancelledBeforeUse?: boolean;
  negated?: boolean;
  redirected?: boolean;
  cardInstanceId?: string;
  cardInstance?: CardInstance;
  spentResources?: Record<string, number>;
};

export type ZoneState = {
  zone: ZoneName;
  cards: StackEntry[];
  lastPlayedBy?: PlayerId;
  passCount: number;
};

export type MatchState = {
  turn: number;
  phase: "movement" | "combat" | "finished";
  actionId: number;
  activePlayerId: PlayerId;
  initiativePlayerId: PlayerId;
  activeZone: ZoneName | null;
  pausedZones: ZoneName[];
  zones: Record<ZoneName, ZoneState>;
  lineSize: number;
  movementPassCount: number;
  players: Record<PlayerId, MatchTeam>;
  playLocks: Record<PlayerId, { source: string; duration: "combat_round" }[]>;
  log: string[];
  winnerId?: PlayerId;
  pendingTurnStartGains: Record<MatchCharacterId, PendingStatusGain[]>;
  nextCardInstanceId: number;
  rng: RngState;
  transcript?: MatchTranscript;
  afterUseWindow?: {
    lastUsedBy: PlayerId;
    lastUsedCharacterId: MatchCharacterId;
    validForAction: number;
  };
  counterWindow?: {
    by: PlayerId;
    targetId: MatchCharacterId;
    validForAction: number;
  };
};

type StatusSnapshot = Record<MatchCharacterId, Record<string, StatusState>>;

export type Action =
  | {
      type: "play_card";
      playerId: PlayerId;
      cardSlot?: string;
      cardInstanceId?: string;
      sourceId?: MatchCharacterId;
      zone: ZoneName;
      targetId?: MatchCharacterId;
      xValue?: number;
      choiceIndex?: number;
      redirectTargetId?: MatchCharacterId;
      scryDiscardIds?: string[];
      scryOrderIds?: string[];
      seekTakeIds?: string[];
      searchPickId?: string;
      pushDirection?: "left" | "right";
    }
  | {
      type: "move_swap";
      playerId: PlayerId;
      firstId: MatchCharacterId;
      secondId: MatchCharacterId;
    }
  | { type: "pass"; playerId: PlayerId }
  | { type: "end_turn"; playerId: PlayerId }
  | { type: "clear_log"; playerId: PlayerId };

export type MatchOptions = {
  seed?: number;
  enableTranscript?: boolean;
};

export type TranscriptEntry = {
  action: Action;
  error?: string;
};

export type MatchTranscript = {
  version: 2;
  seed: number;
  players: { id: PlayerId; name: string; characterIds: string[] }[];
  actions: TranscriptEntry[];
};

export type CostVariable = {
  type: "energy" | "ultimate";
  multiplier: number;
};

export type CostBreakdown = {
  raw: string;
  energy: number;
  ultimate: number;
  variable?: CostVariable;
};

const cloneState = (state: MatchState) => JSON.parse(JSON.stringify(state)) as MatchState;

const cloneAction = (action: Action): Action => ({ ...action });

export const createMatchTranscript = (
  seed: number,
  players: { id: PlayerId; name: string; characterIds: string[] }[]
): MatchTranscript => ({
  version: 2,
  seed,
  players: players.map((player) => ({ ...player })),
  actions: [],
});

export const exportTranscript = (state: MatchState): MatchTranscript | null =>
  state.transcript ? (JSON.parse(JSON.stringify(state.transcript)) as MatchTranscript) : null;

const recordTranscriptEntry = (
  state: MatchState,
  action: Action,
  error?: string
) => {
  if (!state.transcript) return;
  const entry: TranscriptEntry = { action: cloneAction(action) };
  if (error) entry.error = error;
  state.transcript.actions.push(entry);
};

const getOpponentId = (playerId: PlayerId) => (playerId === "p1" ? "p2" : "p1");

const buildMatchCharacterId = (teamId: PlayerId, characterId: string) =>
  `${teamId}:${characterId}`;

const getTeamIdFromMatchCharacterId = (matchId: MatchCharacterId) => {
  if (matchId.startsWith("p1:")) return "p1";
  if (matchId.startsWith("p2:")) return "p2";
  return null;
};

const getMatchCharacter = (state: MatchState, matchId: MatchCharacterId) => {
  const teamId = getTeamIdFromMatchCharacterId(matchId);
  if (teamId) {
    return state.players[teamId].characters.find((member) => member.id === matchId) ?? null;
  }
  return (
    state.players.p1.characters.find((member) => member.id === matchId) ??
    state.players.p2.characters.find((member) => member.id === matchId) ??
    null
  );
};

const getTeamForCharacter = (state: MatchState, matchId: MatchCharacterId) => {
  const teamId = getTeamIdFromMatchCharacterId(matchId);
  if (teamId) return state.players[teamId] ?? null;
  const p1 = state.players.p1.characters.some((member) => member.id === matchId);
  if (p1) return state.players.p1;
  const p2 = state.players.p2.characters.some((member) => member.id === matchId);
  return p2 ? state.players.p2 : null;
};

const resolveEffectTargetTeamId = (
  state: MatchState,
  target: EffectTarget | undefined,
  entry: StackEntry
) => {
  if (target === "target") {
    const team = getTeamForCharacter(state, entry.targetId);
    return team?.id ?? entry.playedBy;
  }
  if (target === "opponent") return getOpponentId(entry.playedBy);
  return entry.playedBy;
};

const resolveEffectTargetCharacterId = (
  target: EffectTarget | undefined,
  entry: StackEntry
) => {
  if (target === "target") return entry.targetId;
  if (target === "opponent") return entry.targetId;
  return entry.sourceId;
};

const hasCombatRoundLock = (state: MatchState, playerId: PlayerId) =>
  state.playLocks[playerId].some((lock) => lock.duration === "combat_round");

const addCombatRoundLock = (state: MatchState, playerId: PlayerId, source: string) => {
  state.playLocks[playerId].push({ source, duration: "combat_round" });
  addLog(state, `${state.players[playerId].name} cannot play cards this combat round.`);
};

const clearCombatRoundLocks = (state: MatchState) => {
  (["p1", "p2"] as PlayerId[]).forEach((playerId) => {
    state.playLocks[playerId] = state.playLocks[playerId].filter(
      (lock) => lock.duration !== "combat_round"
    );
  });
};

const baseHandSize = 5;
const defaultLineSize = 3;

const createCardInstance = (
  state: MatchState,
  owner: MatchCharacter,
  cardSlot: string
): CardInstance => {
  const id = `ci-${state.nextCardInstanceId}`;
  state.nextCardInstanceId += 1;
  return { id, cardSlot, characterId: owner.characterId, ownerId: owner.id, costAdjustment: 0 };
};

const shuffle = <T>(items: T[], rng: RngState) => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextFloat(rng) * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
};

const isUltimateCard = (card: Card) =>
  card.types.some((type) => type.toLowerCase() === "ultimate");

type StatusDefinition = {
  mode: StatusMode;
  potencyMax?: number;
  countMax?: number;
  stackMax?: number;
  valueMax?: number;
  baseValue?: number;
};

type PendingStatusGain = {
  status: string;
  amount: number;
  stat?: StatusValueStat;
};

type TurnFlags = {
  bankaiHitUsed: boolean;
  kyuubiCloneUsed: boolean;
  gamabuntaUsed: boolean;
};

const normalizeStatusName = (value: string) => value.trim().toLowerCase();

const globalStatusMap = new Map<string, StatusEffectDefinition>(
  statusEffects.map((entry) => [normalizeStatusName(entry.name), entry])
);

const createEmptyStatusState = (): StatusState => ({
  potency: 0,
  count: 0,
  stack: 0,
  value: 0,
});

const cloneStatusState = (state: StatusState): StatusState => ({
  potency: state.potency,
  count: state.count,
  stack: state.stack,
  value: state.value,
});

const cloneStatusMap = (statuses: Record<string, StatusState>) =>
  Object.fromEntries(
    Object.entries(statuses).map(([status, state]) => [status, cloneStatusState(state)])
  );

const snapshotStatuses = (state: MatchState): StatusSnapshot => {
  const entries: [MatchCharacterId, Record<string, StatusState>][] = [];
  (["p1", "p2"] as PlayerId[]).forEach((teamId) => {
    state.players[teamId].characters.forEach((member) => {
      entries.push([member.id, cloneStatusMap(member.statuses)]);
    });
  });
  return Object.fromEntries(entries);
};

const getSnapshotStatusState = (
  snapshot: StatusSnapshot,
  characterId: MatchCharacterId,
  status: string
) => snapshot[characterId]?.[status] ?? createEmptyStatusState();

const getStatusState = (character: MatchCharacter, status: string) => {
  if (!character.statuses[status]) {
    character.statuses[status] = createEmptyStatusState();
  }
  return character.statuses[status];
};

const parseStatusLineValue = (line: string, label: string) => {
  const match = line.match(new RegExp(`${label}\\s*:?\\s*(?:Max\\s*)?(\\d+)`, "i"));
  return match ? Number(match[1]) : null;
};

type UniqueStatusDefinition = NonNullable<Character["statusEffects"]>[number];

const parseUniqueStatusDefinition = (status: UniqueStatusDefinition) => {
  let potencyMax: number | undefined;
  let countMax: number | undefined;
  let stackMax: number | undefined;
  let valueMax: number | undefined;
  let baseValue: number | undefined;

  status.lines.forEach((line: string) => {
    if (/potency/i.test(line)) {
      const value = parseStatusLineValue(line, "Potency");
      if (value !== null) potencyMax = value;
    }
    if (/count/i.test(line)) {
      const value = parseStatusLineValue(line, "Count");
      if (value !== null) countMax = value;
    }
    if (/max stack/i.test(line)) {
      const value = parseStatusLineValue(line, "Max Stack");
      if (value !== null) stackMax = value;
    }
    if (/max value/i.test(line)) {
      const value = parseStatusLineValue(line, "Max Value");
      if (value !== null) valueMax = value;
    }
    if (/base value/i.test(line)) {
      const value = parseStatusLineValue(line, "Base Value");
      if (value !== null) baseValue = value;
    }
  });

  let mode: StatusMode = "value";
  if (potencyMax !== undefined || countMax !== undefined) {
    mode = "potency_count";
  } else if (stackMax !== undefined) {
    mode = "stack";
  }

  return { mode, potencyMax, countMax, stackMax, valueMax, baseValue };
};

const getStatusDefinition = (status: string, character?: Character | null): StatusDefinition => {
  const global = globalStatusMap.get(normalizeStatusName(status));
  if (global) {
    let mode: StatusMode = "value";
    if (global.potencyMax !== undefined || global.countMax !== undefined) {
      mode = "potency_count";
    } else if (global.stackMax !== undefined) {
      mode = "stack";
    }
    return {
      mode,
      potencyMax: global.potencyMax,
      countMax: global.countMax,
      stackMax: global.stackMax,
      valueMax: global.valueMax,
    };
  }

  const unique = character?.statusEffects?.find((entry) => entry.name === status);
  if (unique) {
    return parseUniqueStatusDefinition(unique);
  }

  return { mode: "value" };
};

const persistentStatuses = new Set(["Death by Death Note"]);

const getActiveStatusState = (
  member: MatchCharacter,
  status: string,
  character?: Character | null
) => {
  const state = member.statuses[status];
  if (!state) return null;
  const definition = getStatusDefinition(status, character);
  return isStatusActive(state, definition) ? state : null;
};

const getStatusStatValue = (
  member: MatchCharacter,
  status: string,
  stat: StatusValueStat,
  character?: Character | null
) => {
  const state = getActiveStatusState(member, status, character);
  if (!state) return 0;
  return state[stat];
};

const applyStatusStatDelta = (
  target: MatchCharacter,
  status: string,
  delta: number,
  stat: StatusValueStat,
  targetCharacter?: Character | null
) => {
  if (!status || delta === 0) return;
  if (target.defeated) return;
  const state = target.statuses[status];
  if (!state) return;
  const definition = getStatusDefinition(status, targetCharacter);
  const max =
    stat === "potency"
      ? definition.potencyMax
      : stat === "count"
        ? definition.countMax
        : stat === "stack"
          ? definition.stackMax
          : definition.valueMax;
  state[stat] = clampValue(state[stat] + delta, max);
};

const expireStatus = (target: MatchCharacter, status: string) => {
  const state = target.statuses[status];
  if (!state) return;
  state.potency = 0;
  state.count = 0;
  state.stack = 0;
  state.value = 0;
};

const scheduleTurnStartGain = (
  state: MatchState,
  characterId: MatchCharacterId,
  gain: PendingStatusGain
) => {
  if (!state.pendingTurnStartGains[characterId]) {
    state.pendingTurnStartGains[characterId] = [];
  }
  state.pendingTurnStartGains[characterId].push(gain);
};

const resetTurnFlags = (flags: TurnFlags) => {
  flags.bankaiHitUsed = false;
  flags.kyuubiCloneUsed = false;
  flags.gamabuntaUsed = false;
};

const getStatusPrimaryValue = (state: StatusState, definition: StatusDefinition) => {
  if (definition.mode === "potency_count") return state.potency;
  if (definition.mode === "stack") return state.stack;
  return state.value;
};

const getStatusPrimaryStat = (definition: StatusDefinition): StatusValueStat => {
  if (definition.mode === "potency_count") return "potency";
  if (definition.mode === "stack") return "stack";
  return "value";
};

const isStatusActive = (state: StatusState, definition: StatusDefinition) => {
  if (definition.mode === "potency_count") {
    return state.potency > 0 && state.count > 0;
  }
  if (definition.mode === "stack") {
    return state.stack > 0;
  }
  return state.value > 0;
};

const clampValue = (value: number, max?: number) =>
  max !== undefined ? Math.max(0, Math.min(value, max)) : Math.max(0, value);

const isValidPosition = (position: number, lineSize: number) =>
  Number.isInteger(position) && position >= 0 && position < lineSize;

const getAdjacentPositions = (position: number, lineSize: number) =>
  [position - 1, position + 1].filter((candidate) => isValidPosition(candidate, lineSize));

const areAdjacent = (left: number, right: number) => Math.abs(left - right) === 1;

const areOpposed = (left: number, right: number) => left === right;

const canMoveCharacter = (
  state: MatchState,
  characterId: MatchCharacterId,
  characters: Character[]
) => {
  const member = getMatchCharacter(state, characterId);
  if (!member || member.defeated) return false;
  const character = getCharacterById(characters, member.characterId);
  return !getActiveStatusState(member, "Root", character);
};

const tryMoveCharacter = (
  state: MatchState,
  characterId: MatchCharacterId,
  nextPosition: number,
  characters: Character[]
) => {
  if (!isValidPosition(nextPosition, state.lineSize)) return false;
  if (!canMoveCharacter(state, characterId, characters)) {
    const member = getMatchCharacter(state, characterId);
    if (member) {
      addLog(state, `${member.name} is rooted and cannot move.`);
    }
    return false;
  }
  const member = getMatchCharacter(state, characterId);
  if (!member) return false;
  member.position = nextPosition;
  return true;
};

const trySwapAllies = (
  state: MatchState,
  teamId: PlayerId,
  firstId: MatchCharacterId,
  secondId: MatchCharacterId,
  characters: Character[]
) => {
  const team = state.players[teamId];
  const first = team.characters.find((member) => member.id === firstId);
  const second = team.characters.find((member) => member.id === secondId);
  if (!first || !second) return false;
  if (
    !canMoveCharacter(state, firstId, characters) ||
    !canMoveCharacter(state, secondId, characters)
  ) {
    addLog(state, "A rooted character cannot be moved or swapped.");
    return false;
  }
  const firstPos = first.position;
  const secondPos = second.position;
  if (!isValidPosition(firstPos, state.lineSize) || !isValidPosition(secondPos, state.lineSize)) {
    return false;
  }
  first.position = secondPos;
  second.position = firstPos;
  return true;
};

const moveCharacterBySwapping = (
  state: MatchState,
  targetId: MatchCharacterId,
  direction: number,
  steps: number,
  characters: Character[]
) => {
  if (steps <= 0 || direction === 0) return 0;
  const team = getTeamForCharacter(state, targetId);
  const target = getMatchCharacter(state, targetId);
  if (!team || !target) return 0;

  const positions: number[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const pos = target.position + direction * step;
    if (!isValidPosition(pos, state.lineSize)) break;
    positions.push(pos);
  }

  const blocked = positions.some((pos) => {
    const member = team.characters.find((candidate) => candidate.position === pos);
    return member ? !canMoveCharacter(state, member.id, characters) : false;
  });
  if (blocked) {
    addLog(state, "A rooted character cannot be moved or swapped.");
    return 0;
  }

  let moved = 0;
  for (let step = 0; step < steps; step += 1) {
    const nextPos = target.position + direction;
    if (!isValidPosition(nextPos, state.lineSize)) break;
    const occupant = team.characters.find((member) => member.position === nextPos);
    if (occupant) {
      occupant.position = target.position;
      target.position = nextPos;
    } else {
      target.position = nextPos;
    }
    moved += 1;
  }
  return moved;
};

const unusedMovementHelpers = { areOpposed, tryMoveCharacter, moveCharacterBySwapping };
void unusedMovementHelpers;

const applyStatusDelta = (
  target: MatchCharacter,
  status: string,
  amount: number,
  stat: StatusValueStat | undefined,
  targetCharacter?: Character | null
) => {
  if (!status || amount === 0) return;
  if (target.defeated) return;
  const definition = getStatusDefinition(status, targetCharacter);
  const state = getStatusState(target, status);
  const wasActive = isStatusActive(state, definition);

  const applyStat = (key: StatusValueStat, max?: number) => {
    state[key] = clampValue(state[key] + amount, max);
  };

  if (stat) {
    const max =
      stat === "potency"
        ? definition.potencyMax
        : stat === "count"
        ? definition.countMax
        : stat === "stack"
          ? definition.stackMax
          : definition.valueMax;
    applyStat(stat, max);
    if (!wasActive && isStatusActive(state, definition) && amount > 0) {
      handleStatusOnGain(target, status, targetCharacter);
    }
    return;
  }

  if (definition.mode === "potency_count") {
    state.potency = clampValue(state.potency + amount, definition.potencyMax);
    if (state.potency > 0 && state.count === 0) {
      state.count = clampValue(1, definition.countMax);
    }
    return;
  }

  if (definition.mode === "stack") {
    state.stack = clampValue(state.stack + amount, definition.stackMax);
    if (!wasActive && isStatusActive(state, definition) && amount > 0) {
      handleStatusOnGain(target, status, targetCharacter);
    }
    return;
  }

  state.value = clampValue(state.value + amount, definition.valueMax);
  if (!wasActive && isStatusActive(state, definition) && amount > 0) {
    handleStatusOnGain(target, status, targetCharacter);
  }
};

const setStatusValue = (
  target: MatchCharacter,
  status: string,
  amount: number,
  stat: StatusValueStat | undefined,
  targetCharacter?: Character | null
) => {
  if (!status || Number.isNaN(amount)) return null;
  if (target.defeated) return null;
  const definition = getStatusDefinition(status, targetCharacter);
  const state = getStatusState(target, status);
  const wasActive = isStatusActive(state, definition);
  const statKey = stat ?? getStatusPrimaryStat(definition);
  const max =
    statKey === "potency"
      ? definition.potencyMax
      : statKey === "count"
        ? definition.countMax
        : statKey === "stack"
          ? definition.stackMax
          : definition.valueMax;

  const clamped = clampValue(amount, max);
  state[statKey] = clamped;

  if (definition.mode === "potency_count" && statKey === "potency" && amount > 0 && state.count === 0) {
    state.count = clampValue(1, definition.countMax);
  }

  if (!wasActive && isStatusActive(state, definition) && amount > 0) {
    handleStatusOnGain(target, status, targetCharacter);
  }
  return clamped;
};

const reduceStatusValue = (
  target: MatchCharacter,
  status: string,
  amount: number,
  stat: StatusValueStat | undefined,
  options: { minValue?: number; maxAmount?: number } = {},
  targetCharacter?: Character | null
) => {
  if (!status || Number.isNaN(amount)) return null;
  if (target.defeated) return null;
  const definition = getStatusDefinition(status, targetCharacter);
  const state = getStatusState(target, status);
  const statKey = stat ?? getStatusPrimaryStat(definition);
  const current = state[statKey];
  if (current <= 0) return null;
  let reduction = amount;
  if (options.maxAmount !== undefined) {
    reduction = Math.min(reduction, options.maxAmount);
  }
  if (reduction <= 0) return null;
  const floor = options.minValue ?? 0;
  const reduced = Math.max(floor, current - reduction);
  const nextValue = Math.min(current, reduced);
  const max =
    statKey === "potency"
      ? definition.potencyMax
      : statKey === "count"
        ? definition.countMax
        : statKey === "stack"
          ? definition.stackMax
          : definition.valueMax;
  state[statKey] = clampValue(nextValue, max);
  return state[statKey];
};

const spendStatus = (
  state: MatchState,
  characterId: MatchCharacterId,
  status: string,
  amount: number,
  character?: Character | null,
  options?: { allowPartial?: boolean; label?: string }
) => {
  if (!status || amount <= 0) return 0;
  const member = getMatchCharacter(state, characterId);
  if (!member || member.defeated) return 0;
  const statusState = member.statuses[status];
  if (!statusState) return 0;
  const definition = getStatusDefinition(status, character);
  const stat = getStatusPrimaryStat(definition);
  const current = statusState[stat];
  if (current <= 0) return 0;
  const canSpend = current >= amount;
  const spendAmount = options?.allowPartial ? Math.min(current, amount) : canSpend ? amount : 0;
  if (spendAmount <= 0) return 0;
  const max =
    stat === "potency"
      ? definition.potencyMax
      : stat === "count"
        ? definition.countMax
        : stat === "stack"
          ? definition.stackMax
          : definition.valueMax;
  statusState[stat] = clampValue(current - spendAmount, max);
  addLog(
    state,
    `${member.name} spends ${spendAmount} ${options?.label ?? status}.`
  );
  return spendAmount;
};

const handleStatusOnGain = (
  target: MatchCharacter,
  status: string,
  targetCharacter?: Character | null
) => {
  const normalized = normalizeStatusName(status);
  switch (normalized) {
    case "gear 2nd":
      applyStatusDelta(target, "Strength", 1, undefined, targetCharacter);
      applyStatusDelta(target, "Haste", 1, undefined, targetCharacter);
      break;
    case "gear 3rd":
      applyStatusDelta(target, "Strength", 3, undefined, targetCharacter);
      applyStatusDelta(target, "Slow", 1, undefined, targetCharacter);
      break;
    case "the world: time stop":
      applyStatusDelta(target, "Strength", 2, undefined, targetCharacter);
      applyStatusDelta(target, "Strength", 2, "count", targetCharacter);
      applyStatusDelta(target, "Haste", 2, undefined, targetCharacter);
      applyStatusDelta(target, "Haste", 2, "count", targetCharacter);
      break;
    case "stagnate":
      expireStatus(target, "Stagnate");
      break;
    default:
      break;
  }
};

const handleStatusExpiration = (
  state: MatchState,
  targetId: MatchCharacterId,
  status: string,
  targetCharacter?: Character | null
) => {
  const target = getMatchCharacter(state, targetId);
  if (!target) return;
  const normalized = normalizeStatusName(status);
  switch (normalized) {
    case "bankai: tensa zangetsu":
    case "hollow interference":
      applyStatusDelta(target, "Strain", 1, undefined, targetCharacter);
      applyStatusDelta(target, "Strain", 3, "count", targetCharacter);
      break;
    case "the world: time stop":
      applyStatusDelta(target, "Strain", 2, undefined, targetCharacter);
      applyStatusDelta(target, "Strain", 4, "count", targetCharacter);
      break;
    case "gear 3rd":
      scheduleTurnStartGain(state, targetId, { status: "Deflate", amount: 1 });
      break;
    default:
      break;
  }
};

const pruneStatuses = (member: MatchCharacter, character?: Character | null) => {
  Object.entries(member.statuses).forEach(([status, state]) => {
    if (persistentStatuses.has(status)) return;
    const definition = getStatusDefinition(status, character);
    if (!isStatusActive(state, definition)) {
      delete member.statuses[status];
    }
  });
};

const zoneRank: Record<ZoneName, number> = { slow: 0, normal: 1, fast: 2 };

const zoneLabel = (zone: ZoneName) => zone.charAt(0).toUpperCase() + zone.slice(1);

const getLegalZonesForSpeed = (speed: string): ZoneName[] => {
  const normalized = speed.trim().toLowerCase();
  if (normalized.includes("fast")) return ["fast", "normal", "slow"];
  if (normalized.includes("normal")) return ["normal", "slow"];
  return ["slow"];
};

const isZoneFaster = (candidate: ZoneName, current: ZoneName) =>
  zoneRank[candidate] > zoneRank[current];

const normalizeText = (value: string) =>
  value.replace(/[()]/g, "").replace(/\s+/g, " ").trim();

const normalizeLine = (value: string) => value.replace(/\s+/g, " ").trim();

const parseXExpression = (value: string, xValue: number) => {
  const cleaned = normalizeText(value).toLowerCase();
  if (cleaned === "x") return xValue;
  const plusMatch = cleaned.match(/x\s*\+\s*(\d+)/);
  if (plusMatch) return xValue + Number(plusMatch[1]);
  const minusMatch = cleaned.match(/x\s*-\s*(\d+)/);
  if (minusMatch) return Math.max(xValue - Number(minusMatch[1]), 0);
  const numberMatch = cleaned.match(/(\d+)/);
  return numberMatch ? Number(numberMatch[1]) : 0;
};

const getEnergyCostAdjustment = (member: MatchCharacter, character?: Character | null) => {
  const focus = getStatusStatValue(member, "Focus", "potency", character);
  const strain = getStatusStatValue(member, "Strain", "potency", character);
  const bloodFocus = getStatusStatValue(member, "Blood Focus", "value", character);
  return strain - focus - bloodFocus;
};

const getSpeedShift = (member: MatchCharacter, character?: Character | null) => {
  const haste = Math.min(2, getStatusStatValue(member, "Haste", "potency", character));
  const slow = Math.min(2, getStatusStatValue(member, "Slow", "potency", character));
  return Math.max(-2, Math.min(2, haste - slow));
};

const getEffectiveSpeed = (
  speedText: string,
  member: MatchCharacter,
  character?: Character | null
) => {
  const shift = getSpeedShift(member, character);
  if (shift === 0) return speedText;
  const normalized = speedText.trim().toLowerCase();
  const order = ["slow", "normal", "fast"];
  const labels = ["Slow", "Normal", "Fast"];
  const index = order.findIndex((entry) => normalized.includes(entry));
  if (index === -1) return speedText;
  const nextIndex = Math.max(0, Math.min(order.length - 1, index + shift));
  return labels[nextIndex];
};

const getPowerMultiplier = (
  member: MatchCharacter,
  character: Character | null,
  actionType: ActionType
) => {
  let modifier = 0;
  if (actionType === "attack") {
    modifier += 0.1 * getStatusStatValue(member, "Strength", "potency", character);
    modifier -= 0.1 * getStatusStatValue(member, "Weak", "potency", character);
  } else if (actionType === "defense") {
    modifier += 0.1 * getStatusStatValue(member, "Dexterity", "potency", character);
    modifier -= 0.1 * getStatusStatValue(member, "Frail", "potency", character);
  }

  if (actionType !== "special") {
    modifier += 0.05 * getStatusStatValue(member, "Zenkai", "value", character);
  }

  return Math.max(0, 1 + modifier);
};

const applyPowerModifiers = (
  power: number,
  member: MatchCharacter,
  character: Character | null,
  actionType: ActionType
) => Math.max(0, Math.floor(power * getPowerMultiplier(member, character, actionType)));

const getDamageTakenMultiplier = (member: MatchCharacter, character: Character | null) => {
  const vulnerable = getStatusStatValue(member, "Vulnerable", "potency", character);
  const fortified = getStatusStatValue(member, "Fortified", "potency", character);
  return Math.max(0, 1 + 0.1 * vulnerable - 0.1 * fortified);
};

const rollBetween = (min: number, max: number, rng?: RngState) => {
  if (max <= min) return min;
  const roll = rng ? nextFloat(rng) : Math.random();
  return Math.floor(roll * (max - min + 1)) + min;
};

export const parseCost = (text: string): CostBreakdown => {
  const breakdown: CostBreakdown = { raw: text, energy: 0, ultimate: 0 };
  const parts = text.split("+").map((part) => part.trim());

  parts.forEach((part) => {
    const lower = part.toLowerCase();
    const isEnergy = lower.includes("energy");
    const isUltimate = lower.includes("ultimate");
    const numberMatch = part.match(/(\d+)/);
    const xTimesMatch = part.match(/x\s*times\s*(\d+)/i);

    if (xTimesMatch && isUltimate) {
      breakdown.variable = { type: "ultimate", multiplier: Number(xTimesMatch[1]) };
      return;
    }

    if (/x/i.test(part)) {
      if (isEnergy) breakdown.variable = { type: "energy", multiplier: 1 };
      if (isUltimate) breakdown.variable = { type: "ultimate", multiplier: 1 };
      return;
    }

    if (numberMatch) {
      const value = Number(numberMatch[1]);
      if (isEnergy) breakdown.energy += value;
      if (isUltimate) breakdown.ultimate += value;
    }
  });

  return breakdown;
};

export const computeCost = (cost: CostBreakdown, xValue = 0) => {
  const variableCost = cost.variable ? cost.variable.multiplier * xValue : 0;
  return {
    energy: cost.energy + (cost.variable?.type === "energy" ? variableCost : 0),
    ultimate: cost.ultimate + (cost.variable?.type === "ultimate" ? variableCost : 0),
  };
};

const getFollowUpCostAdjustment = (lines: string[]) => {
  for (const line of lines) {
    const normalized = normalizeText(line);
    const match = normalized.match(/On Follow-Up:\s*([+-]\d+)\s+Energy Cost/i);
    if (match) {
      const value = Number(match[1]);
      return Number.isNaN(value) ? 0 : value;
    }
  }
  return 0;
};

const getAdjustedCostTotals = (
  member: MatchCharacter,
  character: Character | null,
  cost: CostBreakdown,
  xValue: number,
  cardInstance?: CardInstance | null,
  followUpAdjustment = 0
) => {
  const totals = computeCost(cost, xValue);
  const energyAdjustment = getEnergyCostAdjustment(member, character);
  const instanceAdjustment = cardInstance?.costAdjustment ?? 0;
  const energy = Math.max(0, totals.energy + energyAdjustment + instanceAdjustment + followUpAdjustment);
  return { energy, ultimate: totals.ultimate };
};

export const canAfford = (team: MatchTeam, cost: CostBreakdown, xValue = 0) => {
  const totals = computeCost(cost, xValue);
  return team.energy >= totals.energy && team.ultimate >= totals.ultimate;
};

export const rollPower = (powerText: string, xValue = 0, rng?: RngState) => {
  const cleaned = powerText.trim();
  if (!cleaned || cleaned === "-") return 0;

  const rangeMatches = Array.from(cleaned.matchAll(/(\d+)\s*-\s*(\d+)/g));
  if (!rangeMatches.length) {
    const valueMatch = cleaned.match(/(\d+)/);
    return valueMatch ? Number(valueMatch[1]) : 0;
  }

  const base = rangeMatches[0];
  let min = Number(base[1]);
  let max = Number(base[2]);

  if (rangeMatches[1]) {
    const scale = rangeMatches[1];
    min += Number(scale[1]) * xValue;
    max += Number(scale[2]) * xValue;
  }

  return rollBetween(min, max, rng);
};

const canTauntOverrideTarget = (card: Card) => {
  const target = card.target.toLowerCase();
  if (!target.includes("enemy")) return false;
  if (target.includes("all")) return false;
  if (target.includes("random")) return false;
  const typeSet = new Set(card.types.map(normalizeTag));
  if (typeSet.has("splash") || typeSet.has("bounce") || typeSet.has("area")) return false;
  return true;
};

export const getLegalTargets = (
  card: Card,
  sourceId: MatchCharacterId,
  state: MatchState,
  characters: Character[]
) => {
  const targetText = card.target.toLowerCase();
  const sourceTeam = getTeamForCharacter(state, sourceId);
  if (!sourceTeam) return [];
  const enemyTeam = state.players[getOpponentId(sourceTeam.id)];
  const allies = sourceTeam.characters.filter((member) => !member.defeated);
  const enemies = enemyTeam.characters.filter((member) => !member.defeated);

  if (targetText.includes("ally")) {
    return allies.map((member) => member.id);
  }
  if (targetText.includes("self")) {
    return [sourceId];
  }
  if (targetText.includes("enemy")) {
    let candidates = enemies;
    if (canTauntOverrideTarget(card)) {
      const taunts = enemies.filter((member) => {
        const data = getCharacterById(characters, member.characterId);
        return Boolean(getActiveStatusState(member, "Taunt", data));
      });
      if (taunts.length) {
        candidates = taunts;
      }
    }
    return candidates.map((member) => member.id);
  }

  return enemies.map((member) => member.id);
};

const pickTargetId = (
  card: Card,
  sourceId: MatchCharacterId,
  state: MatchState,
  characters: Character[]
) => {
  const legal = getLegalTargets(card, sourceId, state, characters);
  if (legal.length) return legal[0];
  return sourceId;
};

const hasTypeTag = (types: string[], tag: string) =>
  types.some((type) => normalizeTag(type) === normalizeTag(tag));

const isSingleTargetEntry = (entry: StackEntry) => {
  const targetText = entry.targetText?.toLowerCase() ?? "";
  const normalized = targetText.replace(/\s+/g, " ").trim();
  if (!targetText) return false;
  if (/\brandom\b/.test(normalized) || /\ball\b/.test(normalized)) return false;
  if (hasTypeTag(entry.types, "aoe") || hasTypeTag(entry.types, "area")) return false;
  return (
    targetText.includes("enemy") || targetText.includes("ally") || targetText.includes("self")
  );
};

const isLegalTargetForEntry = (
  state: MatchState,
  entry: StackEntry,
  targetId: MatchCharacterId
) => {
  const target = getMatchCharacter(state, targetId);
  if (!target || target.defeated) return false;
  const sourceTeam = getTeamForCharacter(state, entry.sourceId);
  const targetTeam = getTeamForCharacter(state, targetId);
  if (!sourceTeam || !targetTeam) return false;
  const targetText = entry.targetText?.toLowerCase() ?? "";
  if (targetText.includes("self")) return targetId === entry.sourceId;
  if (targetText.includes("ally")) return sourceTeam.id === targetTeam.id;
  if (targetText.includes("enemy")) return sourceTeam.id !== targetTeam.id;
  return true;
};

const parseCoverScope = (statusName: string) => {
  const normalized = normalizeText(statusName).toLowerCase();
  if (normalized.includes("adjacent")) return "adjacent";
  if (normalized.includes("all")) return "all";
  return "all";
};

type RedirectCandidate = {
  targetId: MatchCharacterId;
  source: "cover" | "redirect";
  status?: string;
};

const getCoverRedirectCandidates = (
  state: MatchState,
  entry: StackEntry,
  characters: Character[]
) => {
  if (!isSingleTargetEntry(entry)) return [] as RedirectCandidate[];
  if (getActionType(entry.types) !== "attack") return [] as RedirectCandidate[];
  const target = getMatchCharacter(state, entry.targetId);
  if (!target) return [] as RedirectCandidate[];
  const targetTeam = getTeamForCharacter(state, entry.targetId);
  if (!targetTeam) return [] as RedirectCandidate[];
  const candidates: RedirectCandidate[] = [];

  targetTeam.characters.forEach((member) => {
    if (member.defeated || member.id === entry.targetId) return;
    const character = getCharacterById(characters, member.characterId);
    const statuses = Object.keys(member.statuses).filter((status) =>
      normalizeText(status).toLowerCase().startsWith("cover")
    );
    statuses.forEach((status) => {
      const active = getActiveStatusState(member, status, character);
      if (!active || active.value <= 0) return;
      const scope = parseCoverScope(status);
      if (scope === "adjacent" && !areAdjacent(member.position, target.position)) return;
      if (!isLegalTargetForEntry(state, entry, member.id)) return;
      candidates.push({ targetId: member.id, source: "cover", status });
    });
  });

  candidates.sort((left, right) => {
    const leftMember = getMatchCharacter(state, left.targetId);
    const rightMember = getMatchCharacter(state, right.targetId);
    const leftPos = leftMember ? leftMember.position : 0;
    const rightPos = rightMember ? rightMember.position : 0;
    if (leftPos !== rightPos) return leftPos - rightPos;
    if (left.targetId !== right.targetId) {
      return left.targetId.localeCompare(right.targetId);
    }
    return (left.status ?? "").localeCompare(right.status ?? "");
  });

  return candidates;
};

const parseRedirectLine = (line: string) => {
  const normalized = normalizeLine(line);
  const match = normalized.match(/^Redirect\s*\(([^)]+)\)/i);
  if (!match) return null;
  return match[1].trim();
};

const resolveRedirectTarget = (
  state: MatchState,
  entry: StackEntry,
  spec: string
) => {
  const normalized = normalizeText(spec).toLowerCase();
  const sourceTeam = getTeamForCharacter(state, entry.sourceId);
  if (!sourceTeam) return null;
  const enemyTeam = state.players[getOpponentId(sourceTeam.id)];

  if (normalized.includes("self")) return entry.sourceId;
  if (normalized.includes("target")) return entry.targetId;
  if (normalized.includes("ally")) {
    const allies = sourceTeam.characters
      .filter((member) => !member.defeated)
      .sort((left, right) => left.position - right.position);
    return allies[0]?.id ?? null;
  }
  if (normalized.includes("enemy") || normalized.includes("opponent")) {
    const enemies = enemyTeam.characters
      .filter((member) => !member.defeated)
      .sort((left, right) => left.position - right.position);
    return enemies[0]?.id ?? null;
  }

  return null;
};

const getRedirectSpec = (effectText: string[]) => {
  const segments = getTimedTextSegments(effectText);
  for (const segment of segments) {
    const spec = parseRedirectLine(segment.text);
    if (spec) return spec;
  }
  return null;
};

const getRedirectCandidates = (
  state: MatchState,
  entry: StackEntry,
  characters: Character[]
) => {
  if (!isSingleTargetEntry(entry)) return [] as RedirectCandidate[];
  const candidates: RedirectCandidate[] = [];
  candidates.push(...getCoverRedirectCandidates(state, entry, characters));
  const redirectSpec = getRedirectSpec(entry.effectText);
  if (redirectSpec) {
    const redirectTargetId = resolveRedirectTarget(state, entry, redirectSpec);
    if (redirectTargetId && isLegalTargetForEntry(state, entry, redirectTargetId)) {
      candidates.push({ targetId: redirectTargetId, source: "redirect" });
    }
  }
  return candidates;
};

const hasNegateText = (entry: StackEntry) =>
  entry.effectText.some((line) => /^Negate\b/i.test(normalizeText(line)));

const getBounceCount = (effectText: string[]) => {
  let count = 0;
  effectText.forEach((line) => {
    const match = line.match(/\bBounce\s+(\d+)/i);
    if (match) {
      const value = Number(match[1]);
      if (!Number.isNaN(value)) {
        count = value;
      }
    }
  });
  return count > 0 ? count : 1;
};

const lineMentionsAll = (effectText: string[], keyword: string) =>
  effectText.some((line) => new RegExp(`\\ball\\s+${keyword}\\b`, "i").test(line));

const getAdjacentTargets = (state: MatchState, targetId: MatchCharacterId) => {
  const target = getMatchCharacter(state, targetId);
  const team = getTeamForCharacter(state, targetId);
  if (!target || !team) return [];
  const positions = getAdjacentPositions(target.position, state.lineSize);
  return team.characters
    .filter((member) => !member.defeated && positions.includes(member.position))
    .map((member) => member.id);
};

const getAreaTargetsForEntry = (state: MatchState, entry: StackEntry) => {
  const sourceTeam = getTeamForCharacter(state, entry.sourceId);
  if (!sourceTeam) return [entry.targetId];
  const enemyTeam = state.players[getOpponentId(sourceTeam.id)];
  const allies = sourceTeam.characters.filter((member) => !member.defeated);
  const enemies = enemyTeam.characters.filter((member) => !member.defeated);
  const targetText = entry.targetText?.toLowerCase() ?? "";
  const isAoe = hasTypeTag(entry.types, "aoe");
  const isSplash = hasTypeTag(entry.types, "splash");
  const isBounce = hasTypeTag(entry.types, "bounce");
  const effectAllEnemies = lineMentionsAll(entry.effectText, "enemies");
  const effectAllAllies = lineMentionsAll(entry.effectText, "allies");

  let baseTargets: MatchCharacterId[] = [entry.targetId];
  if (targetText.includes("all enemies")) {
    baseTargets = enemies.map((member) => member.id);
  } else if (targetText.includes("all allies")) {
    baseTargets = allies.map((member) => member.id);
  } else if (isAoe && (targetText.includes("enemy") || effectAllEnemies)) {
    baseTargets = enemies.map((member) => member.id);
  } else if (isAoe && (targetText.includes("ally") || effectAllAllies)) {
    baseTargets = allies.map((member) => member.id);
  } else if (isAoe && targetText.includes("self") && effectAllEnemies) {
    baseTargets = enemies.map((member) => member.id);
  } else if (isAoe && targetText.includes("self") && effectAllAllies) {
    baseTargets = allies.map((member) => member.id);
  }

  if (!baseTargets.length) {
    return [];
  }

  const targets = [...baseTargets];
  if (baseTargets.length === 1) {
    if (isSplash) {
      const splashTargets = getAdjacentTargets(state, baseTargets[0]);
      splashTargets.forEach((targetId) => {
        if (!targets.includes(targetId)) {
          targets.push(targetId);
        }
      });
    }
    if (isBounce) {
      const bounceTargets = getAdjacentTargets(state, baseTargets[0]);
      if (bounceTargets.length) {
        const bounceCount = getBounceCount(entry.effectText);
        for (let index = 0; index < bounceCount; index += 1) {
          const picked = bounceTargets[nextInt(state.rng, 0, bounceTargets.length - 1)];
          if (picked) targets.push(picked);
        }
      }
    }
  }

  return targets;
};

const getCharacterById = (characters: Character[], characterId: string) =>
  characters.find((item) => item.id === characterId) ?? null;

const reshuffleDiscardIntoDeck = (state: MatchState, playerId: PlayerId) => {
  const team = state.players[playerId];
  if (!team.discard.length) return false;
  team.deck.push(...team.discard);
  team.discard = [];
  shuffle(team.deck, state.rng);
  addLog(state, `${team.name} shuffles their discard into the draw pile.`);
  return true;
};

const drawCards = (state: MatchState, playerId: PlayerId, count: number) => {
  const team = state.players[playerId];
  let remaining = count;
  while (remaining > 0) {
    if (team.deck.length === 0) {
      if (!reshuffleDiscardIntoDeck(state, playerId)) break;
    }
    const nextCard = team.deck.pop();
    if (!nextCard) break;
    team.hand.push(nextCard);
    remaining -= 1;
  }
};

const drawToHandSize = (
  state: MatchState,
  playerId: PlayerId,
  targetSize: number
) => {
  const team = state.players[playerId];
  const needed = Math.max(0, targetSize - team.hand.length);
  if (needed > 0) {
    drawCards(state, playerId, needed);
  }
};

const matchesSearchCriteria = (card: Card, criteria: string) => {
  const normalized = normalizeText(criteria).toLowerCase();
  const nameMatch = normalized.match(/named\s+(.+)/i) ?? normalized.match(/"([^"]+)"/);
  const nameCriteria = nameMatch ? normalizeText(nameMatch[1]).toLowerCase() : null;
  if (nameCriteria) {
    return normalizeText(card.name).toLowerCase() === nameCriteria;
  }

  const tagKeys = [
    "basic",
    "technique",
    "ultimate",
    "attack",
    "defense",
    "special",
    "physical",
    "magical",
    "melee",
    "ranged",
  ];
  const tags = tagKeys.filter((tag) => normalized.includes(tag));
  if (tags.length) {
    return tags.every((tag) => hasTypeTag(card.types, tag));
  }

  const cleaned = normalized.replace(/\b(a|an|the|card|cards)\b/g, "").trim();
  if (!cleaned) return true;
  return normalizeText(card.name).toLowerCase().includes(cleaned);
};

const scryTopCards = (
  state: MatchState,
  playerId: PlayerId,
  count: number,
  discardIds?: string[],
  orderIds?: string[]
) => {
  const team = state.players[playerId];
  const available = Math.min(count, team.deck.length);
  if (available <= 0) return;
  const peeked = team.deck.splice(team.deck.length - available, available);
  const peekedTopFirst = [...peeked].reverse();
  const discardSet = new Set(discardIds ?? []);
  const discarded: CardInstance[] = [];
  const remaining: CardInstance[] = [];

  peekedTopFirst.forEach((instance) => {
    if (discardSet.has(instance.id)) {
      discarded.push(instance);
    } else {
      remaining.push(instance);
    }
  });

  let ordered = remaining;
  if (orderIds && orderIds.length === remaining.length) {
    const byId = new Map(remaining.map((instance) => [instance.id, instance]));
    const used = new Set<string>();
    const nextOrder: CardInstance[] = [];
    let valid = true;
    orderIds.forEach((id) => {
      const instance = byId.get(id);
      if (!instance || used.has(id)) {
        valid = false;
        return;
      }
      used.add(id);
      nextOrder.push(instance);
    });
    if (valid && nextOrder.length === remaining.length) {
      ordered = nextOrder;
    }
  }

  if (discarded.length) {
    team.discard.push(...discarded);
  }
  const orderedBottomFirst = [...ordered].reverse();
  team.deck.push(...orderedBottomFirst);
  addLog(state, `${team.name} scries ${available} card(s).`);
};

const seekTopCards = (
  state: MatchState,
  playerId: PlayerId,
  count: number,
  criteria: string,
  take: number,
  characters: Character[],
  takeIds?: string[]
) => {
  const team = state.players[playerId];
  const available = Math.min(count, team.deck.length);
  if (available <= 0) return;
  const peeked = team.deck.splice(team.deck.length - available, available);
  const peekedTopFirst = [...peeked].reverse();
  const kept: CardInstance[] = [];
  const discarded: CardInstance[] = [];
  const explicitTake = takeIds !== undefined;
  const picked: CardInstance[] = [];
  const availableMatches = new Set<string>();

  peekedTopFirst.forEach((instance) => {
    const card = findCard(characters, instance.characterId, instance.cardSlot);
    if (card && matchesSearchCriteria(card, criteria)) {
      availableMatches.add(instance.id);
    }
  });

  if (explicitTake) {
    takeIds?.forEach((id) => {
      if (picked.length >= take) return;
      if (!availableMatches.has(id)) return;
      const instance = peekedTopFirst.find((candidate) => candidate.id === id);
      if (instance && !picked.some((candidate) => candidate.id === id)) {
        picked.push(instance);
      }
    });
  }

  peekedTopFirst.forEach((instance) => {
    const card = findCard(characters, instance.characterId, instance.cardSlot);
    const matches = card && matchesSearchCriteria(card, criteria);
    if (explicitTake) {
      if (picked.some((candidate) => candidate.id === instance.id)) {
        kept.push(instance);
      } else {
        discarded.push(instance);
      }
      return;
    }
    if (kept.length < take && matches) {
      kept.push(instance);
    } else {
      discarded.push(instance);
    }
  });

  team.hand.push(...kept);
  team.discard.push(...discarded);
  addLog(
    state,
    `${team.name} seeks ${available} card(s) and takes ${kept.length}.`
  );
};

const searchDeck = (
  state: MatchState,
  playerId: PlayerId,
  criteria: string,
  characters: Character[],
  pickId?: string
) => {
  const team = state.players[playerId];
  let foundIndex = -1;
  let foundCard: Card | null = null;
  if (pickId) {
    const index = team.deck.findIndex((instance) => instance.id === pickId);
    if (index !== -1) {
      const instance = team.deck[index];
      const card = instance ? findCard(characters, instance.characterId, instance.cardSlot) : null;
      if (card && matchesSearchCriteria(card, criteria)) {
        foundIndex = index;
        foundCard = card;
      }
    }
  }
  for (let index = team.deck.length - 1; index >= 0; index -= 1) {
    if (foundIndex !== -1) break;
    const instance = team.deck[index];
    const card = instance ? findCard(characters, instance.characterId, instance.cardSlot) : null;
    if (card && matchesSearchCriteria(card, criteria)) {
      foundIndex = index;
      foundCard = card;
      break;
    }
  }
  if (foundIndex === -1) {
    addLog(state, `${team.name} searches the draw pile but finds nothing.`);
    return;
  }
  const [picked] = team.deck.splice(foundIndex, 1);
  if (picked) team.hand.push(picked);
  shuffle(team.deck, state.rng);
  addLog(state, `${team.name} searches and finds ${foundCard?.name ?? "a card"}.`);
};

const applyPrepareAdjustments = (
  state: MatchState,
  playerId: PlayerId,
  characters: Character[]
) => {
  const team = state.players[playerId];
  team.hand.forEach((instance) => {
    const card = findCard(characters, instance.characterId, instance.cardSlot);
    if (!card) return;
    const lifecycle = getLifecycleKeywords(card.effect, card.effects);
    if (lifecycle.prepare !== 0) {
      instance.costAdjustment += lifecycle.prepare;
    }
  });
};

const applyHandEndCleanup = (
  state: MatchState,
  playerId: PlayerId,
  characters: Character[]
) => {
  const team = state.players[playerId];
  const remaining: CardInstance[] = [];
  team.hand.forEach((instance) => {
    const card = findCard(characters, instance.characterId, instance.cardSlot);
    if (!card) return;
    const lifecycle = getLifecycleKeywords(card.effect, card.effects);
    if (lifecycle.ethereal) {
      team.exhausted.push(instance);
      addLog(state, `${team.name} exhausts ${card.name} (Ethereal).`);
      return;
    }
    if (lifecycle.retain) {
      remaining.push(instance);
      return;
    }
    team.discard.push(instance);
  });
  team.hand = remaining;
};

const buildStartingZones = (
  state: MatchState,
  playerId: PlayerId,
  characters: Character[]
) => {
  const team = state.players[playerId];
  team.deck = [];
  team.hand = [];
  team.discard = [];
  team.exhausted = [];
  team.defeated = [];

  team.characters.forEach((member) => {
    member.resourceMax = {};
    const character = getCharacterById(characters, member.characterId);
    if (!character) return;
    const transformTargets = new Set(
      character.cards.flatMap((card) =>
        card.transforms?.map((transform) => transform.cardSlot) ?? []
      )
    );

    character.cards.forEach((card) => {
      if (isUltimateCard(card)) return;
      if (transformTargets.has(card.slot)) return;
      const instance = createCardInstance(state, member, card.slot);
      const lifecycle = getLifecycleKeywords(card.effect, card.effects);
      if (lifecycle.innate) {
        team.hand.push(instance);
      } else {
        team.deck.push(instance);
      }
    });
  });

  shuffle(team.deck, state.rng);
};

const applyStartingStatuses = (member: MatchCharacter, character: Character) => {
  if (!character.innates?.length) return;
  character.innates.forEach((innate) => {
    const normalized = innate.text.trim();
    const startMatch = normalized.match(/starts with\s+(.+)$/i);
    if (!startMatch) return;
    const payload = startMatch[1];
    const parts = payload
      .split(/,| and /i)
      .map((part) => part.trim())
      .filter(Boolean);
    parts.forEach((part) => {
      const atMatch = part.match(/^(.+?)\s+at\s+(\d+)$/i);
      if (atMatch) {
        const statusName = atMatch[1].trim();
        const amount = Number(atMatch[2]);
        if (amount > 0) {
          applyStatusDelta(member, statusName, amount, undefined, character);
        }
        return;
      }
      const valueMatch = part.match(/^(\d+)\s+(.+)$/);
      if (valueMatch) {
        const amount = Number(valueMatch[1]);
        const statusName = valueMatch[2].trim().replace(/\.$/, "");
        if (amount > 0) {
          applyStatusDelta(member, statusName, amount, undefined, character);
          member.resourceMax[statusName] = amount;
        }
        return;
      }
      const statusName = part.replace(/\.$/, "");
      if (!statusName) return;
      applyStatusDelta(member, statusName, 1, undefined, character);
      member.resourceMax[statusName] = Math.max(member.resourceMax[statusName] ?? 0, 1);
    });
  });
};

type CreateDestination = "hand" | "discard";

const createCardsAtDestination = (
  state: MatchState,
  characterId: MatchCharacterId,
  cardName: string,
  count: number,
  characters: Character[],
  destination: CreateDestination
) => {
  const member = getMatchCharacter(state, characterId);
  if (!member) return;
  const team = getTeamForCharacter(state, characterId);
  if (!team) return;
  const character = getCharacterById(characters, member.characterId);
  if (!character?.createdCards?.length) return;
  const match = character.createdCards.find(
    (card) => card.name.toLowerCase() === cardName.toLowerCase()
  );
  if (!match) return;
  for (let i = 0; i < count; i += 1) {
    const instance = createCardInstance(state, member, match.slot);
    if (destination === "hand") {
      team.hand.push(instance);
    } else {
      team.discard.push(instance);
    }
  }
  const destinationLabel = destination === "hand" ? "hand" : "discard pile";
  addLog(state, `${member.name} creates ${count} ${match.name} in the ${destinationLabel}.`);
};

const createCardsInHand = (
  state: MatchState,
  characterId: MatchCharacterId,
  cardName: string,
  count: number,
  characters: Character[]
) => {
  createCardsAtDestination(state, characterId, cardName, count, characters, "hand");
};

const getEquippedWeaponStatus = (member: MatchCharacter, character: Character | null) => {
  const equipped = ["Equip: Handgun", "Equip: Riot Gun", "Equip: Chicago Typewriter"].find(
    (status) => getActiveStatusState(member, status, character)
  );
  return equipped ?? null;
};

const reloadEquippedWeapon = (
  state: MatchState,
  characterId: MatchCharacterId,
  characters: Character[]
) => {
  const member = getMatchCharacter(state, characterId);
  if (!member) return;
  const character = getCharacterById(characters, member.characterId);
  const equipped = getEquippedWeaponStatus(member, character);
  if (!equipped) return;
  const ammoMap: Record<string, string | null> = {
    "Equip: Handgun": "Handgun Ammo",
    "Equip: Riot Gun": "Shotgun Ammo",
    "Equip: Chicago Typewriter": null,
  };
  const ammoStatus = ammoMap[equipped];
  if (!ammoStatus) return;
  const max = member.resourceMax[ammoStatus];
  if (!max) return;
  const current = getStatusStatValue(member, ammoStatus, "value", character);
  const delta = max - current;
  if (delta <= 0) return;
  applyStatusDelta(member, ammoStatus, delta, "value", character);
  addLog(state, `${member.name} reloads ${equipped.replace("Equip: ", "")}.`);
};

const switchEquipment = (
  state: MatchState,
  characterId: MatchCharacterId,
  equipStatus: string,
  characters: Character[]
) => {
  const member = getMatchCharacter(state, characterId);
  if (!member) return;
  const character = getCharacterById(characters, member.characterId);
  if (!character) return;
  const active = getActiveStatusState(member, equipStatus, character);
  if (active) {
    reloadEquippedWeapon(state, characterId, characters);
    return;
  }
  ["Equip: Handgun", "Equip: Riot Gun", "Equip: Chicago Typewriter"].forEach((status) => {
    if (status !== equipStatus) {
      expireStatus(member, status);
    }
  });
  applyStatusDelta(member, equipStatus, 1, undefined, character);
  addLog(state, `${member.name} equips ${equipStatus.replace("Equip: ", "")}.`);
};

const applyStagnate = (
  state: MatchState,
  amount: number,
  characters: Character[],
  targetId: MatchCharacterId
) => {
  if (amount <= 0) return;
  const team = getTeamForCharacter(state, targetId);
  if (!team) return;
  for (let i = 0; i < amount; i += 1) {
    if (!team.hand.length) break;
    const index = nextInt(state.rng, 0, team.hand.length - 1);
    const instance = team.hand[index];
    if (!instance) continue;
    instance.costAdjustment += 1;
    const card = findCard(characters, instance.characterId, instance.cardSlot);
    if (card) {
      addLog(state, `${team.name}'s ${card.name} costs +1 Energy (Stagnate).`);
    }
  }
};

const parseDamageFromLine = (line: string, power: number, xValue: number) => {
  const normalized = normalizeText(line).toLowerCase();
  if (!normalized.includes("deal power")) return null;

  const multiMatch = normalized.match(
    /deal power\s*\/\s*([a-z0-9+\-\s]+)\s+damage\s+([a-z0-9+\-\s]+)\s+times/
  );
  if (multiMatch) {
    const divisor = parseXExpression(multiMatch[1], xValue);
    const times = parseXExpression(multiMatch[2], xValue);
    if (divisor > 0 && times > 0) {
      const perHit = Math.floor(power / divisor);
      return perHit * times;
    }
  }

  const splitMatch = normalized.match(/deal power\s*\/\s*([a-z0-9+\-\s]+)\s+damage/);
  if (splitMatch) {
    const divisor = parseXExpression(splitMatch[1], xValue);
    if (divisor > 0) {
      return Math.floor(power / divisor);
    }
  }

  if (normalized.includes("deal power damage")) {
    return power;
  }

  return null;
};

const parseShieldFromLine = (line: string, power: number, xValue: number) => {
  const normalized = normalizeText(line).toLowerCase();
  if (!normalized.includes("gain power")) return null;

  const splitMatch = normalized.match(/gain power\s*\/\s*([a-z0-9+\-\s]+)\s+shield/);
  if (splitMatch) {
    const divisor = parseXExpression(splitMatch[1], xValue);
    if (divisor > 0) {
      return Math.floor(power / divisor);
    }
  }

  if (normalized.includes("gain power shield")) {
    return power;
  }

  return null;
};

const parseHealFromLine = (line: string, power: number, xValue: number) => {
  const normalized = normalizeText(line).toLowerCase();
  if (!normalized.includes("heal")) return null;

  const splitMatch = normalized.match(/heal for power\s*\/\s*([a-z0-9+\-\s]+)\s+hp/);
  if (splitMatch) {
    const divisor = parseXExpression(splitMatch[1], xValue);
    if (divisor > 0) {
      return Math.floor(power / divisor);
    }
  }

  if (normalized.includes("heal for power hp")) {
    return power;
  }

  return null;
};

const parseUltimateFromLine = (line: string, power: number) => {
  const normalized = normalizeText(line).toLowerCase();
  if (!normalized.includes("ultimate meter")) return null;
  const powerMatch = normalized.match(/gain power ultimate meter/);
  if (powerMatch) return power;
  const valueMatch = normalized.match(/gain\s+(\d+)\s+ultimate meter/);
  return valueMatch ? Number(valueMatch[1]) : null;
};

const parseStatusChange = (line: string) => {
  const normalized = normalizeText(line);
  const inflictMatch = normalized.match(/Inflict\s+(\d+)\s+([^.,]+)/i);
  if (inflictMatch) {
    const amount = Number(inflictMatch[1]);
    const status = inflictMatch[2].split(/ and |, /i)[0].trim();
    return { type: "inflict", amount, status };
  }

  const gainMatch = normalized.match(/Gain\s+(\d+)\s+([^.,]+)/i);
  if (gainMatch) {
    const amount = Number(gainMatch[1]);
    const status = gainMatch[2].split(/ and |, /i)[0].trim();
    if (!/energy|ultimate meter/i.test(status)) {
      return { type: "gain", amount, status };
    }
  }

  return null;
};

const parseDrawFromLine = (line: string) => {
  const normalized = normalizeText(line);
  const match = normalized.match(/Draw\s+(\d+)\s+additional\s+card/i);
  if (match) return Number(match[1]);
  const baseMatch = normalized.match(/Draw\s+(\d+)\s+card/i);
  return baseMatch ? Number(baseMatch[1]) : null;
};

const parseScryLine = (line: string, xValue: number) => {
  const normalized = normalizeText(line);
  const match = normalized.match(/Scry\s+(\d+|X)/i);
  if (!match) return null;
  const token = match[1].toLowerCase();
  const count = token === "x" ? xValue : Number(token);
  return Number.isNaN(count) ? null : count;
};

const parseSearchLine = (line: string) => {
  const normalized = normalizeText(line);
  const match = normalized.match(/Search(?:\s+your\s+draw\s+pile)?\s+for\s+(.+)/i);
  if (!match) return null;
  const criteria = match[1].trim().replace(/\.$/, "");
  return criteria || null;
};

const parseSeekLine = (line: string, xValue: number) => {
  const normalized = normalizeLine(line);
  const match = normalized.match(/Seek\s+(\d+|X)\s*\((.+)\)/i);
  if (!match) return null;
  const token = match[1].toLowerCase();
  const count = token === "x" ? xValue : Number(token);
  if (Number.isNaN(count)) return null;
  const parts = match[2].split(",");
  const criteria = parts[0]?.trim();
  const takeRaw = parts[1]?.trim();
  const take = takeRaw ? Number(takeRaw) : 1;
  if (!criteria || Number.isNaN(take)) return null;
  return { count, criteria, take };
};

const parsePushPullLine = (line: string, xValue: number) => {
  const normalized = normalizeText(line);
  const match = normalized.match(/^(Push|Pull)\s+(\d+|X)/i);
  if (!match) return null;
  const kind = match[1].toLowerCase() as "push" | "pull";
  const token = match[2].toLowerCase();
  const amount = token === "x" ? xValue : Number(token);
  if (Number.isNaN(amount)) return null;
  return { kind, amount };
};

const isSwapLine = (line: string) => /^Swap\b/i.test(normalizeText(line));

const parseCreateFromLine = (line: string) => {
  const normalized = normalizeText(line);
  const match = normalized.match(
    /Create\s+(\d+)\s+(.+?)(?:\s+in\s+(?:this character's\s+)?(hand|discard(?:\s+pile)?))?/i
  );
  if (!match) return null;
  const count = Number(match[1]);
  const cardName = match[2].trim().replace(/\.$/, "");
  if (!cardName || Number.isNaN(count) || count <= 0) return null;
  const destinationToken = match[3]?.toLowerCase();
  const destination: CreateDestination =
    destinationToken && destinationToken.includes("hand") ? "hand" : "discard";
  return { count, cardName, destination };
};

const getCreateDestination = (effectText: string[], cardName: string): CreateDestination => {
  const normalizedName = cardName.trim().toLowerCase();
  for (const line of effectText) {
    const parsed = parseCreateFromLine(line);
    if (!parsed) continue;
    if (parsed.cardName.trim().toLowerCase() === normalizedName) {
      return parsed.destination;
    }
  }
  return "discard";
};

const isReloadLine = (line: string) =>
  /Reload currently Equipped Weapon/i.test(normalizeText(line));

const parseEquipSwitchLine = (line: string) => {
  const normalized = normalizeText(line);
  const match = normalized.match(/Switch to\s+(Equip:\s*[^.]+)/i);
  return match ? match[1].trim() : null;
};

type SpendInstruction = {
  resource: string;
  amount: number;
  allowPartial: boolean;
  gateAll: boolean;
  gateDamage: boolean;
};

type PurgeKind = "cleanse" | "dispel" | "purge";

type PurgeInstruction = {
  kind: PurgeKind;
  amount?: number;
  status?: string;
  all: boolean;
};

const parseSpendInstruction = (line: string, xValue: number): SpendInstruction | null => {
  const normalized = normalizeText(line);
  if (/^Spend as many as possible/i.test(normalized)) return null;
  if (/to inflict/i.test(normalized)) return null;

  const upToMatch = normalized.match(/Spend\s+(.+?)\s+up to X/i);
  if (upToMatch) {
    return {
      resource: upToMatch[1].trim(),
      amount: xValue,
      allowPartial: true,
      gateAll: false,
      gateDamage: false,
    };
  }

  const match = normalized.match(/Spend\s+(X|\d+)\s+(.+?)(?:\s+to\s+deal damage)?\.?$/i);
  if (!match) return null;
  const amount = match[1].toLowerCase() === "x" ? xValue : Number(match[1]);
  if (Number.isNaN(amount)) return null;
  const gateDamage = /to deal damage/i.test(normalized);
  return {
    resource: match[2].trim().replace(/\.$/, ""),
    amount,
    allowPartial: false,
    gateAll: !gateDamage,
    gateDamage,
  };
};

const parseSpendInflictLine = (line: string) => {
  const normalized = normalizeText(line);
  const match = normalized.match(
    /Spend\s+(\d+)\s+(.+?)\s+to\s+inflict\s+(\d+)\s+([^.,]+)/i
  );
  if (!match) return null;
  const spendAmount = Number(match[1]);
  const resource = match[2].trim();
  const statusAmount = Number(match[3]);
  const status = match[4].split(/ and |, /i)[0].trim();
  if (Number.isNaN(spendAmount) || Number.isNaN(statusAmount)) return null;
  return { resource, spendAmount, statusAmount, status };
};

const parsePurgeLine = (line: string): PurgeInstruction | null => {
  const normalized = normalizeText(line);
  const allMatch = normalized.match(/^(Cleanse|Dispel|Purge)\s+All(?:\s+(\d+))?/i);
  if (allMatch) {
    const amount = allMatch[2] ? Number(allMatch[2]) : undefined;
    return {
      kind: allMatch[1].toLowerCase() as PurgeKind,
      amount: Number.isNaN(amount) ? undefined : amount,
      all: true,
    };
  }

  const singleMatch = normalized.match(/^(Cleanse|Dispel|Purge)(?:\s+(\d+))?\s+([^.,]+)/i);
  if (!singleMatch) return null;
  const amount = singleMatch[2] ? Number(singleMatch[2]) : undefined;
  const status = singleMatch[3].split(/ and |, /i)[0].trim().replace(/\.$/, "");
  if (!status) return null;
  return {
    kind: singleMatch[1].toLowerCase() as PurgeKind,
    amount: Number.isNaN(amount) ? undefined : amount,
    status,
    all: false,
  };
};

const getStatusDisposition = (status: string) => {
  const global = globalStatusMap.get(normalizeStatusName(status));
  if (!global) return "unique";
  return global.type?.toLowerCase() ?? "neutral";
};

const shouldPurgeStatus = (kind: PurgeKind, disposition: string) => {
  if (disposition === "unique" || disposition === "neutral") return false;
  if (kind === "cleanse") return disposition === "negative";
  if (kind === "dispel") return disposition === "positive";
  return disposition === "negative" || disposition === "positive";
};

const applyPurgeInstruction = (
  state: MatchState,
  source: MatchCharacter,
  target: MatchCharacter,
  instruction: PurgeInstruction,
  characters: Character[]
) => {
  if (target.defeated) return;
  const targetCharacter = getCharacterById(characters, target.characterId);
  const effectTarget = instruction.all
    ? instruction.kind === "cleanse"
      ? "all negative statuses"
      : instruction.kind === "dispel"
        ? "all positive statuses"
        : "all positive and negative statuses"
    : instruction.status ?? "all statuses";
  let affected = 0;

  const applyStatusChange = (status: string) => {
    const disposition = getStatusDisposition(status);
    if (!shouldPurgeStatus(instruction.kind, disposition)) return;
    if (instruction.amount === undefined) {
      const current = target.statuses[status];
      if (!current || !isStatusActive(current, getStatusDefinition(status, targetCharacter))) {
        return;
      }
      expireStatus(target, status);
      affected += 1;
      return;
    }
    const reduced = reduceStatusValue(
      target,
      status,
      instruction.amount,
      undefined,
      {},
      targetCharacter
    );
    if (reduced !== null) {
      affected += 1;
    }
  };

  if (instruction.all) {
    Object.keys(target.statuses).forEach((status) => applyStatusChange(status));
  } else if (instruction.status) {
    applyStatusChange(instruction.status);
  }

  if (affected > 0) {
    const verb = instruction.kind.charAt(0).toUpperCase() + instruction.kind.slice(1);
    const amountLabel = instruction.amount !== undefined ? ` ${instruction.amount}` : "";
    addLog(
      state,
      `${source.name} ${verb}s${amountLabel} ${effectTarget} on ${target.name}.`
    );
  }
};

type SpendContext = {
  skipAll: boolean;
  skipDamage: boolean;
  ammoSpent: number;
  spentResources: Record<string, number>;
};

const getAvailableSpend = (
  member: MatchCharacter,
  status: string,
  amount: number,
  character: Character | null,
  allowPartial: boolean
) => {
  const state = member.statuses[status];
  if (!state) return 0;
  const definition = getStatusDefinition(status, character);
  const stat = getStatusPrimaryStat(definition);
  const current = state[stat];
  if (current <= 0) return 0;
  if (allowPartial) return Math.min(current, amount);
  return current >= amount ? amount : 0;
};

type TagCondition = {
  include: string[];
  exclude: string[];
};

type MitigationRule =
  | {
      kind: "resist" | "weakness" | "absorb";
      flat?: number;
      percent?: number;
      tags?: TagCondition[];
    }
  | {
      kind: "immune";
      tags: TagCondition[];
    };

type KeywordFlags = {
  evade: boolean;
  counter: boolean;
  reuse: boolean;
  followUp: boolean;
  assistAttack: boolean;
};

type UseRestriction = {
  kind: "require" | "forbid";
  subject: "self" | "target";
  statuses: { name: string; min?: number }[];
  mode: "any" | "all";
  raw?: string;
};

const timingLabelMap: Record<string, Effect["timing"]> = {
  "on play": "on_play",
  "before clash": "before_clash",
  "after clash": "after_clash",
  "before use": "before_use",
  "on use": "on_use",
  "on hit": "on_hit",
  "after use": "after_use",
  "always": "always",
};

const timingLabelRegex =
  /(On Play|Before Clash|After Clash|Before Use|On Use|On Hit|After Use|Always)\s*:/gi;

const getTimedTextSegments = (lines: string[]) => {
  const segments: { timing: Effect["timing"]; text: string }[] = [];
  lines.forEach((line) => {
    const regex = new RegExp(timingLabelRegex.source, "gi");
    const matches = Array.from(line.matchAll(regex));
    if (!matches.length) {
      if (line.trim()) {
        segments.push({ timing: "on_use", text: line });
      }
      return;
    }

    const firstIndex = matches[0]?.index ?? 0;
    if (firstIndex > 0) {
      const leading = line.slice(0, firstIndex);
      if (leading.trim()) {
        segments.push({ timing: "on_use", text: leading });
      }
    }

    matches.forEach((match, index) => {
      const label = match[1]?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
      const timing = timingLabelMap[label] ?? "on_use";
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[index + 1]?.index ?? line.length;
      const segment = line.slice(start, end);
      if (segment.trim()) {
        segments.push({ timing, text: segment });
      }
    });
  });
  return segments;
};

const getKeywordFlags = (lines: string[]): KeywordFlags => {
  const flags: KeywordFlags = {
    evade: false,
    counter: false,
    reuse: false,
    followUp: false,
    assistAttack: false,
  };
  lines.forEach((line) => {
    const normalized = line.trim().replace(/\.$/, "").toLowerCase();
    if (normalized === "evade") flags.evade = true;
    if (normalized === "counter") flags.counter = true;
    if (normalized === "reuse") flags.reuse = true;
    if (normalized === "follow-up") flags.followUp = true;
    if (normalized === "assist attack") flags.assistAttack = true;
  });
  return flags;
};

const keywordFlagMap: Record<string, keyof KeywordFlags> = {
  evade: "evade",
  counter: "counter",
  reuse: "reuse",
  "follow-up": "followUp",
  "follow up": "followUp",
  "assist attack": "assistAttack",
};

const grantEntryKeyword = (entry: StackEntry, keyword: string) => {
  const normalized = keyword.trim().toLowerCase();
  const flag = keywordFlagMap[normalized];
  if (!flag) return;
  if (!entry.grantedKeywords) entry.grantedKeywords = {};
  entry.grantedKeywords[flag] = true;
};

const getEntryKeywordFlags = (entry: StackEntry): KeywordFlags => {
  const base = getKeywordFlags(entry.effectText);
  const extra = entry.grantedKeywords;
  return {
    evade: base.evade || Boolean(extra?.evade),
    counter: base.counter || Boolean(extra?.counter),
    reuse: base.reuse || Boolean(extra?.reuse),
    followUp: base.followUp || Boolean(extra?.followUp),
    assistAttack: base.assistAttack || Boolean(extra?.assistAttack),
  };
};

type LifecycleKeywords = {
  exhaust: boolean;
  ethereal: boolean;
  retain: boolean;
  innate: boolean;
  prepare: number;
};

const getLifecycleKeywords = (lines: string[], effects?: Effect[]): LifecycleKeywords => {
  const keywords: LifecycleKeywords = {
    exhaust: false,
    ethereal: false,
    retain: false,
    innate: false,
    prepare: 0,
  };

  lines.forEach((line) => {
    const normalized = line.trim().replace(/\.$/, "").toLowerCase();
    if (normalized === "exhaust") keywords.exhaust = true;
    if (normalized === "ethereal") keywords.ethereal = true;
    if (normalized === "retain") keywords.retain = true;
    if (normalized === "innate") keywords.innate = true;
    const prepareMatch = normalized.match(/^prepare\s+(-?\d+)$/);
    if (prepareMatch) {
      keywords.prepare = Number(prepareMatch[1]);
    }
  });

  if (effects?.some((effect) => effect.type === "retain")) {
    keywords.retain = true;
  }

  return keywords;
};

const getTextChoiceOptions = (lines: string[]) => {
  const choiceIndex = lines.findIndex(
    (line) => line.trim().toLowerCase().replace(/\.$/, "") === "choose 1:"
  );
  if (choiceIndex === -1) return [];
  const options: string[] = [];
  for (let index = choiceIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    if (/^if\s+/i.test(line)) continue;
    if (/^innate\b/i.test(line)) continue;
    if (/^retain\b/i.test(line)) continue;
    options.push(line);
  }
  return options;
};

const forEachStructuredEffect = (
  effects: Effect[] | undefined,
  timing: Effect["timing"],
  choiceIndex: number | undefined,
  handler: (effect: Effect) => void
) => {
  if (!effects) return;
  effects.forEach((effect) => {
    if (effect.timing !== timing) return;
    if (effect.type === "choose") {
      if (choiceIndex === undefined) return;
      const choice = effect.options[choiceIndex];
      if (choice?.effects) {
        forEachStructuredEffect(choice.effects, timing, choiceIndex, handler);
      }
      return;
    }
    handler(effect);
  });
};

const hasStructuredEffectType = (
  effects: Effect[] | undefined,
  timing: Effect["timing"],
  choiceIndex: number | undefined,
  type: Effect["type"]
) => {
  let found = false;
  forEachStructuredEffect(effects, timing, choiceIndex, (effect) => {
    if (effect.type === type) {
      found = true;
    }
  });
  return found;
};

const getXRangeFromText = (lines: string[]) => {
  for (const line of lines) {
    const match = line.match(/Choose X\s*\((\d+)\s*-\s*(\d+)\)/i);
    if (match) {
      const min = Number(match[1]);
      const max = Number(match[2]);
      if (!Number.isNaN(min) && !Number.isNaN(max)) {
        return { min, max };
      }
    }
    const spendMatch = line.match(/You may spend X\s*[^()]*\((\d+)\s*-\s*(\d+)\)/i);
    if (spendMatch) {
      const min = Number(spendMatch[1]);
      const max = Number(spendMatch[2]);
      if (!Number.isNaN(min) && !Number.isNaN(max)) {
        return { min, max };
      }
    }
    const spendUpToMatch = line.match(/You may spend up to\s+(\d+)/i);
    if (spendUpToMatch) {
      const max = Number(spendUpToMatch[1]);
      if (!Number.isNaN(max)) {
        return { min: 0, max };
      }
    }
    const spendFixedMatch = line.match(/You may spend\s+(\d+)\b/i);
    if (spendFixedMatch) {
      const max = Number(spendFixedMatch[1]);
      if (!Number.isNaN(max)) {
        return { min: 0, max };
      }
    }
  }
  return null;
};

const getFixedXFromText = (lines: string[]) => {
  const setLine = lines.find((line) =>
    /Set X to this card's remaining Multihit Count/i.test(line)
  );
  if (!setLine) return null;
  const countLine = lines.find((line) =>
    /Multihit Count starts at/i.test(line)
  );
  if (!countLine) return null;
  const match = countLine.match(/Multihit Count starts at\s+(\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isNaN(value) ? null : value;
};

const formatRestrictionRaw = (
  restriction: UseRestriction,
  statuses: { name: string; min: number }[]
) => {
  const subject = restriction.subject === "target" ? "the target" : "this character";
  const joiner = restriction.mode === "any" ? " or " : " and ";
  const parts = statuses.map((status) =>
    status.min > 1 ? `${status.min}+ ${status.name}` : status.name
  );
  return `${subject} has ${parts.join(joiner)}`;
};

const normalizeTag = (value: string) => value.trim().toLowerCase();

const parseTagConditions = (raw: string | undefined) => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const include: string[] = [];
      const exclude: string[] = [];
      part
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .forEach((token) => {
          const lowered = token.toLowerCase();
          if (lowered.startsWith("non-")) {
            exclude.push(normalizeTag(lowered.replace(/^non-/, "")));
          } else {
            include.push(normalizeTag(lowered));
          }
        });
      return { include, exclude };
    });
};

const parseMitigationAmounts = (raw: string) => {
  const parts = raw.split("/").map((part) => part.trim());
  let flat: number | undefined;
  let percent: number | undefined;
  parts.forEach((part) => {
    if (!part) return;
    if (part.endsWith("%")) {
      const value = Number(part.replace("%", "").trim());
      if (!Number.isNaN(value)) {
        const ratio = value / 100;
        percent = percent === undefined ? ratio : Math.max(percent, ratio);
      }
    } else {
      const value = Number(part);
      if (!Number.isNaN(value)) {
        flat = flat === undefined ? value : Math.max(flat, value);
      }
    }
  });
  return { flat, percent };
};

const parseMitigationRules = (text: string) => {
  const rules: MitigationRule[] = [];
  const keywordRegex = /\b(Resist|Weakness|Absorb)\s+([0-9%/.\s]+)(?:\(([^)]+)\))?/gi;
  let match: RegExpExecArray | null;
  while ((match = keywordRegex.exec(text)) !== null) {
    const kind = match[1]?.toLowerCase() as "resist" | "weakness" | "absorb";
    const amountRaw = (match[2]?.trim() ?? "").replace(/[.,]$/, "");
    const tags = parseTagConditions(match[3]);
    if (!amountRaw) continue;
    const { flat, percent } = parseMitigationAmounts(amountRaw);
    if (flat === undefined && percent === undefined) continue;
    rules.push({ kind, flat, percent, tags: tags.length ? tags : undefined });
  }

  const immuneRegex = /\bImmune\s*\(([^)]+)\)/gi;
  while ((match = immuneRegex.exec(text)) !== null) {
    const tags = parseTagConditions(match[1]);
    if (tags.length) {
      rules.push({ kind: "immune", tags });
    }
  }

  return rules;
};

const getMitigationRules = (
  member: MatchCharacter,
  character: Character | null,
  extraText?: string[]
) => {
  const rules: MitigationRule[] = [];
  if (character?.innates?.length) {
    rules.push(...character.innates.flatMap((innate) => parseMitigationRules(innate.text)));
  }

  if (Array.isArray(extraText)) {
    rules.push(...extraText.flatMap((line) => parseMitigationRules(line)));
  }

  const statusEntries = Object.entries(member.statuses);
  if (!statusEntries.length) return rules;

  statusEntries.forEach(([statusName, state]) => {
    const definition = getStatusDefinition(statusName, character);
    if (!isStatusActive(state, definition)) return;

    const global = globalStatusMap.get(normalizeStatusName(statusName));
    if (global?.rules?.length) {
      global.rules.forEach((rule) => {
        if (!/effect|always/i.test(rule.timing)) return;
        rules.push(...parseMitigationRules(rule.text));
      });
      return;
    }

    const unique = character?.statusEffects?.find((entry) => entry.name === statusName);
    if (unique?.lines?.length) {
      unique.lines.forEach((line) => {
        rules.push(...parseMitigationRules(line));
      });
    }
  });

  return rules;
};

const matchesTagCondition = (types: Set<string>, condition: TagCondition) => {
  if (!condition.include.length && !condition.exclude.length) return false;
  if (!condition.include.every((tag) => types.has(tag))) return false;
  if (!condition.exclude.every((tag) => !types.has(tag))) return false;
  return true;
};

const matchesAnyCondition = (types: Set<string>, conditions?: TagCondition[]) => {
  if (!conditions || !conditions.length) return true;
  return conditions.some((condition) => matchesTagCondition(types, condition));
};

const getMitigationAmount = (damage: number, rule: MitigationRule) => {
  if (rule.kind === "immune") return 0;
  const flat = rule.flat ?? 0;
  const percent = rule.percent ? Math.floor(damage * rule.percent) : 0;
  return Math.max(flat, percent);
};

const canPlayAfterUse = (
  state: MatchState,
  card: Card,
  sourceId: MatchCharacterId,
  characters?: Character[]
) => {
  if (!state.afterUseWindow || state.afterUseWindow.validForAction !== state.actionId) {
    return false;
  }
  const flags = getKeywordFlags(card.effect);
  let followUpAllowed = flags.followUp;
  if (!followUpAllowed && characters) {
    const lastUsed = getMatchCharacter(state, state.afterUseWindow.lastUsedCharacterId);
    const lastUsedCharacter = lastUsed
      ? getCharacterById(characters, lastUsed.characterId)
      : null;
    const timeStop = lastUsed
      ? getActiveStatusState(lastUsed, "The World: Time Stop", lastUsedCharacter)
      : null;
    if (timeStop && getActionType(card.types) === "attack") {
      followUpAllowed = true;
    }
  }
  if (followUpAllowed && state.afterUseWindow.lastUsedCharacterId === sourceId) return true;
  if (flags.assistAttack && state.afterUseWindow.lastUsedCharacterId !== sourceId) return true;
  return false;
};

const applyStatusDamage = (
  state: MatchState,
  targetId: MatchCharacterId,
  amount: number,
  label: string,
  character: Character | null
) => {
  if (amount <= 0) return;
  const target = getMatchCharacter(state, targetId);
  if (!target || target.defeated) return;
  const invulnerable = getStatusStatValue(target, "Invulnerable", "value", character);
  if (invulnerable > 0) return;
  const multiplier = getDamageTakenMultiplier(target, character);
  const adjusted = Math.max(0, Math.floor(amount * multiplier));
  if (adjusted <= 0) return;
  let remaining = adjusted;
  const shieldAbsorbed = Math.min(target.shield, remaining);
  target.shield -= shieldAbsorbed;
  remaining -= shieldAbsorbed;
  if (remaining > 0) {
    const barrier = getActiveStatusState(target, "Barrier", character);
    if (barrier && barrier.value > 0) {
      const barrierAbsorbed = Math.min(barrier.value, remaining);
      barrier.value -= barrierAbsorbed;
      remaining -= barrierAbsorbed;
    }
  }
  if (remaining <= 0) return;
  target.hp = Math.max(target.hp - remaining, 0);
  addLog(state, `${target.name} takes ${remaining} damage from ${label}.`);
  if (target.hp <= 0) {
    handleDefeat(state, target.id, `${target.name} is defeated.`);
  }
};

const applyHealing = (
  state: MatchState,
  targetId: MatchCharacterId,
  amount: number,
  character: Character | null,
  label?: string
) => {
  if (amount <= 0) return 0;
  const target = getMatchCharacter(state, targetId);
  if (!target || target.defeated) return 0;
  const wither = getStatusStatValue(target, "Wither", "stack", character);
  const wound = getStatusStatValue(target, "Wound", "stack", character);
  const percentReduction = wither > 0 ? Math.floor((amount * wither) / 100) : 0;
  const adjusted = Math.max(0, amount - percentReduction - wound);
  if (adjusted <= 0) return 0;
  target.hp = Math.min(target.hp + adjusted, 100);
  addLog(
    state,
    label
      ? `${target.name} heals ${adjusted} HP from ${label}.`
      : `${target.name} heals ${adjusted} HP.`
  );
  return adjusted;
};

const applyDamage = (
  state: MatchState,
  target: MatchCharacter,
  damage: number,
  sourceTypes: string[],
  targetCharacter: Character | null,
  mitigationText?: string[]
) => {
  if (damage <= 0) return 0;
  if (target.defeated) return 0;
  const normalizedTypes = new Set(sourceTypes.map(normalizeTag));
  const rules = getMitigationRules(target, targetCharacter, mitigationText);

  if (rules.some((rule) => rule.kind === "immune" && matchesAnyCondition(normalizedTypes, rule.tags))) {
    return 0;
  }
  if (getStatusStatValue(target, "Invulnerable", "value", targetCharacter) > 0) {
    return 0;
  }

  const absorbed = Math.min(target.shield, damage);
  target.shield -= absorbed;
  let remaining = damage - absorbed;
  let barrierAbsorbed = 0;
  if (remaining > 0) {
    const barrier = getActiveStatusState(target, "Barrier", targetCharacter);
    if (barrier && barrier.value > 0) {
      barrierAbsorbed = Math.min(barrier.value, remaining);
      barrier.value -= barrierAbsorbed;
      remaining -= barrierAbsorbed;
    }
  }
  if (remaining > 0) {
    const multiplier = getDamageTakenMultiplier(target, targetCharacter);
    remaining = Math.max(0, Math.floor(remaining * multiplier));
  }

  const applyReduction = (current: number, ruleSet: MitigationRule[]) => {
    let totalReduced = 0;
    let next = current;
    ruleSet.forEach((rule) => {
      if (!matchesAnyCondition(normalizedTypes, rule.tags)) return;
      const reduction = Math.min(getMitigationAmount(next, rule), next);
      if (reduction <= 0) return;
      next -= reduction;
      totalReduced += reduction;
    });
    return { remaining: next, reduced: totalReduced };
  };

  const resistRules = rules.filter((rule) => rule.kind === "resist") as MitigationRule[];
  const absorbRules = rules.filter((rule) => rule.kind === "absorb") as MitigationRule[];
  const weaknessRules = rules.filter((rule) => rule.kind === "weakness") as MitigationRule[];

  const resistResult = applyReduction(remaining, resistRules);
  remaining = resistResult.remaining;

  const absorbResult = applyReduction(remaining, absorbRules);
  remaining = absorbResult.remaining;

  weaknessRules.forEach((rule) => {
    if (!matchesAnyCondition(normalizedTypes, rule.tags)) return;
    const increase = getMitigationAmount(remaining, rule);
    if (increase <= 0) return;
    remaining += increase;
  });

  if (remaining > 0) {
    target.hp = Math.max(target.hp - remaining, 0);
  }
  if (absorbResult.reduced > 0) {
    target.hp = Math.min(target.hp + absorbResult.reduced, 100);
  }
  if (target.hp <= 0) {
    handleDefeat(state, target.id, `${target.name} is defeated.`);
  }

  return absorbed + barrierAbsorbed + remaining;
};

const addLog = (state: MatchState, entry: string) => {
  state.log.push(entry);
};

const removeCharacterCards = (
  pile: CardInstance[],
  ownerId: MatchCharacterId,
  removed: CardInstance[]
) => {
  const remaining: CardInstance[] = [];
  pile.forEach((instance) => {
    if (instance.ownerId === ownerId) {
      removed.push(instance);
    } else {
      remaining.push(instance);
    }
  });
  return remaining;
};

const handleDefeat = (state: MatchState, characterId: MatchCharacterId, reason?: string) => {
  const member = getMatchCharacter(state, characterId);
  const team = getTeamForCharacter(state, characterId);
  if (!member || !team || member.defeated) return;

  member.defeated = true;
  member.hp = 0;
  member.shield = 0;
  member.statuses = {};
  if (reason) {
    addLog(state, reason);
  }

  const removed: CardInstance[] = [];
  team.hand = removeCharacterCards(team.hand, member.id, removed);
  team.deck = removeCharacterCards(team.deck, member.id, removed);
  team.discard = removeCharacterCards(team.discard, member.id, removed);
  team.exhausted = removeCharacterCards(team.exhausted, member.id, removed);

  Object.values(state.zones).forEach((zone) => {
    zone.cards = zone.cards.filter((entry) => {
      if (entry.sourceId !== member.id) return true;
      if (entry.cardInstance) removed.push(entry.cardInstance);
      return false;
    });
  });

  if (removed.length) {
    team.defeated.push(...removed);
    addLog(state, `${member.name}'s cards are removed from play.`);
  }

  if (team.characters.every((candidate) => candidate.defeated)) {
    state.winnerId = getOpponentId(team.id);
    state.phase = "finished";
    addLog(state, `${state.players[state.winnerId].name} wins the match.`);
  }
};

const getActionType = (types: string[]): ActionType => {
  const lower = types.map((value) => value.toLowerCase());
  if (lower.includes("attack")) return "attack";
  if (lower.includes("defense")) return "defense";
  return "special";
};

const applyCardPlayedStatusRules = (
  state: MatchState,
  entry: StackEntry,
  energySpent: number,
  characters: Character[]
) => {
  const source = getMatchCharacter(state, entry.sourceId);
  if (!source) return;
  const sourceCharacter = getCharacterById(characters, source.characterId);

  const bleed = getActiveStatusState(source, "Bleed", sourceCharacter);
  if (bleed) {
    applyStatusDamage(state, entry.sourceId, bleed.potency, "Bleed", sourceCharacter);
    applyStatusDelta(source, "Bleed", energySpent, undefined, sourceCharacter);
  }

  const burn = getActiveStatusState(source, "Burn", sourceCharacter);
  if (burn) {
    applyStatusDamage(state, entry.sourceId, burn.potency, "Burn", sourceCharacter);
    applyStatusStatDelta(source, "Burn", -energySpent, "count", sourceCharacter);
  }

  const poison = getActiveStatusState(source, "Poison", sourceCharacter);
  if (poison) {
    applyStatusDelta(source, "Poison", energySpent, undefined, sourceCharacter);
  }

  const kyuubi = getActiveStatusState(source, "Kyuubi Chakra", sourceCharacter);
  const turnFlags = source.turnFlags;
  if (kyuubi && !turnFlags.kyuubiCloneUsed && entry.cardName === "Shadow Clone Jutsu") {
    applyStatusDelta(source, "Shadow Clones", kyuubi.potency, undefined, sourceCharacter);
    turnFlags.kyuubiCloneUsed = true;
  }

  const gamabunta = getActiveStatusState(source, "Summoned: Gamabunta", sourceCharacter);
  const targetTeam = getTeamForCharacter(state, entry.targetId);
  if (
    gamabunta &&
    !turnFlags.gamabuntaUsed &&
    getActionType(entry.types) === "attack" &&
    energySpent >= 2 &&
    targetTeam?.id === getOpponentId(entry.playedBy)
  ) {
    turnFlags.gamabuntaUsed = true;
    createCardsInHand(state, entry.sourceId, "Gamabunta: Toad Smash", 1, characters);
  }

  pruneStatuses(source, sourceCharacter);
};

const applyTurnStartEffects = (
  state: MatchState,
  playerId: PlayerId,
  characters: Character[],
  options?: { resolveStun?: boolean }
) => {
  const team = state.players[playerId];
  let extraDraw = 0;
  let allStunned = true;

  team.characters.forEach((member) => {
    if (member.defeated) return;
    resetTurnFlags(member.turnFlags);
    const character = getCharacterById(characters, member.characterId);

    const pending = state.pendingTurnStartGains[member.id] ?? [];
    if (pending.length) {
      pending.forEach((gain) => {
        applyStatusDelta(member, gain.status, gain.amount, gain.stat, character);
      });
      pending.length = 0;
    }

    const gainStatus = (status: string, amount: number, stat?: StatusValueStat) => {
      applyStatusDelta(member, status, amount, stat, character);
    };

    if (getActiveStatusState(member, "Equip: Handgun", character)) {
      gainStatus("Dexterity", 1);
    }
    if (getActiveStatusState(member, "Equip: Riot Gun", character)) {
      gainStatus("Strength", 1);
    }
    if (getActiveStatusState(member, "Equip: Chicago Typewriter", character)) {
      gainStatus("Haste", 1);
    }

    const kaioken = getActiveStatusState(member, "Kaioken", character);
    if (kaioken) {
      const boost = kaioken.potency;
      if (boost > 0) {
        gainStatus("Strength", boost);
        gainStatus("Dexterity", boost);
        if (boost > 1) {
          gainStatus("Haste", boost - 1);
        }
      }
    }

    const kyuubi = getActiveStatusState(member, "Kyuubi Chakra", character);
    if (kyuubi) {
      const boost = kyuubi.potency;
      if (boost > 0) {
        gainStatus("Strength", boost);
        gainStatus("Haste", boost);
      }
    }

    if (getActiveStatusState(member, "Bankai: Tensa Zangetsu", character)) {
      gainStatus("Haste", 2);
      gainStatus("Strength", 1);
    }
    if (getActiveStatusState(member, "Hollow Interference", character)) {
      gainStatus("Haste", 2);
      gainStatus("Strength", 2);
    }

    const stateValue = getStatusStatValue(member, "State", "value", character);
    const stateBoost = Math.floor(stateValue / 10);
    if (stateBoost > 0 && getActiveStatusState(member, "State: Normal", character)) {
      gainStatus("Strength", stateBoost);
      gainStatus("Dexterity", stateBoost);
      gainStatus("Haste", stateBoost);
    }
    if (stateBoost > 0 && getActiveStatusState(member, "State: Serious", character)) {
      gainStatus("Strength", stateBoost);
      gainStatus("Dexterity", stateBoost);
      gainStatus("Fortified", stateBoost);
      gainStatus("Haste", stateBoost);
    }
    if (getActiveStatusState(member, "State: Bored", character)) {
      extraDraw += 1;
    }

    const stunned = Boolean(getActiveStatusState(member, "Stun", character));
    if (stunned && options?.resolveStun) {
      expireStatus(member, "Stun");
    }
    if (!stunned) {
      allStunned = false;
    }
  });

  drawToHandSize(state, playerId, baseHandSize + extraDraw);
  applyPrepareAdjustments(state, playerId, characters);

  return allStunned && Boolean(options?.resolveStun);
};

const applyTurnEndEffects = (state: MatchState, playerId: PlayerId, characters: Character[]) => {
  if (state.phase === "finished") return;
  const team = state.players[playerId];

  team.characters.forEach((member) => {
    if (member.defeated || state.phase === "finished") return;
    const character = getCharacterById(characters, member.characterId);

    const updateStatus = (
      statusName: string,
      updater: (statusState: StatusState, definition: StatusDefinition) => void
    ) => {
      const statusState = member.statuses[statusName];
      if (!statusState) return;
      const definition = getStatusDefinition(statusName, character);
      const wasActive = isStatusActive(statusState, definition);
      if (!wasActive) return;
      updater(statusState, definition);
      if (wasActive && !isStatusActive(statusState, definition)) {
        handleStatusExpiration(state, member.id, statusName, character);
      }
    };

    updateStatus("Bleed", (statusState) => {
      statusState.count = Math.floor(statusState.count / 2);
    });
    updateStatus("Burn", (statusState) => {
      applyStatusDamage(state, member.id, statusState.potency, "Burn", character);
      statusState.count = Math.floor(statusState.count / 2);
    });
    updateStatus("Poison", (statusState) => {
      applyStatusDamage(state, member.id, statusState.potency, "Poison", character);
      statusState.count = Math.floor(statusState.count / 2);
    });
    updateStatus("Frail", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Slow", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Strain", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Weak", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Vulnerable", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Dexterity", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Focus", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Fortified", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Haste", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Strength", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Regen", (statusState, definition) => {
      if (statusState.potency > 0) {
        applyHealing(state, member.id, statusState.potency, character, "Regen");
      }
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Renewal", (statusState, definition) => {
      if (statusState.potency > 0) {
        const amount = Math.floor((100 * statusState.potency) / 100);
        applyHealing(state, member.id, amount, character, "Renewal");
      }
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Thorns", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Barrier", (statusState, definition) => {
      statusState.value = clampValue(statusState.value - 1, definition.valueMax);
    });
    updateStatus("Invulnerable", (statusState, definition) => {
      statusState.value = clampValue(statusState.value - 1, definition.valueMax);
    });

    updateStatus("Spectro Frazzle", (statusState, definition) => {
      applyStatusDamage(state, member.id, statusState.stack * 5, "Spectro Frazzle", character);
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });

    updateStatus("Shadow Clones", (statusState, definition) => {
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });
    updateStatus("Summoned: Gamabunta", (statusState, definition) => {
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });
    updateStatus("One-Tail Cloak", (statusState, definition) => {
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });
    updateStatus("Deflate", (statusState, definition) => {
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });
    updateStatus("Disarm", (statusState, definition) => {
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });
    updateStatus("Root", (statusState, definition) => {
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });
    updateStatus("Seal", (statusState, definition) => {
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });
    updateStatus("Silence", (statusState, definition) => {
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });
    updateStatus("Stagger", (statusState, definition) => {
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });
    updateStatus("Taunt", (statusState, definition) => {
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });
    updateStatus("Wither", (statusState, definition) => {
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });
    updateStatus("Wound", (statusState, definition) => {
      statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
    });

    updateStatus("Stolen Information", (statusState, definition) => {
      if (statusState.stack <= 5) {
        statusState.stack = clampValue(statusState.stack - 1, definition.stackMax);
      }
    });

    updateStatus("Reiatsu", (statusState, definition) => {
      statusState.value = clampValue(statusState.value - 1, definition.valueMax);
    });
    updateStatus("Stolen Blood", (statusState, definition) => {
      statusState.value = clampValue(statusState.value - 1, definition.valueMax);
    });
    updateStatus("Blood Focus", (statusState, definition) => {
      statusState.value = clampValue(statusState.value - 1, definition.valueMax);
    });

    updateStatus("Death by Death Note", (statusState, definition) => {
      statusState.value = clampValue(statusState.value - 1, definition.valueMax);
      if (statusState.value <= 0) {
        member.hp = 0;
        handleDefeat(state, member.id, `${member.name} succumbs to Death by Death Note.`);
      }
    });

    updateStatus("Cover", () => {
      expireStatus(member, "Cover");
    });
    updateStatus("Stun", () => {
      expireStatus(member, "Stun");
    });
    updateStatus("Gear 2nd", () => {
      expireStatus(member, "Gear 2nd");
    });
    updateStatus("Gear 3rd", () => {
      expireStatus(member, "Gear 3rd");
    });
    updateStatus("Hollow Interference", () => {
      expireStatus(member, "Hollow Interference");
    });

    updateStatus("Bankai: Tensa Zangetsu", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("The World: Time Stop", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
    });
    updateStatus("Kyuubi Chakra", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
      if (statusState.potency > 0) {
        const drain = Math.floor(member.hp * 0.05 * statusState.potency);
        applyStatusDamage(state, member.id, drain, "Kyuubi Chakra", character);
      }
    });
    updateStatus("Kaioken", (statusState, definition) => {
      statusState.count = clampValue(statusState.count - 1, definition.countMax);
      if (statusState.potency > 0) {
        const drain = Math.floor(member.hp * 0.1 * statusState.potency);
        applyStatusDamage(state, member.id, drain, "Kaioken", character);
      }
    });

    pruneStatuses(member, character);
    member.shield = 0;
  });

  applyHandEndCleanup(state, playerId, characters);
};

const advanceTurn = (state: MatchState, characters: Character[]) => {
  let safety = 0;
  while (safety < 3) {
    state.turn += 1;
    state.initiativePlayerId = getOpponentId(state.initiativePlayerId);
    state.activePlayerId = state.initiativePlayerId;
    state.pausedZones = [];
    state.activeZone = null;
    state.movementPassCount = 0;
    clearCombatRoundLocks(state);

    Object.values(state.zones).forEach((zone) => {
      zone.cards = [];
      zone.passCount = 0;
      zone.lastPlayedBy = undefined;
    });

    Object.values(state.players).forEach((team) => {
      team.energy = 5;
    });

    const initiator = state.players[state.initiativePlayerId];
    addLog(state, `Turn ${state.turn} begins. ${initiator.name} has initiative.`);
    const skipInitiative = applyTurnStartEffects(state, state.initiativePlayerId, characters, {
      resolveStun: true,
    });
    const otherPlayer = getOpponentId(state.initiativePlayerId);
    applyTurnStartEffects(state, otherPlayer, characters, { resolveStun: false });

    if (!skipInitiative) {
      state.phase = "movement";
      addLog(state, "Movement Round begins.");
      return;
    }

    addLog(state, `${initiator.name} is stunned and skips the turn.`);
    applyTurnEndEffects(state, "p1", characters);
    applyTurnEndEffects(state, "p2", characters);
    if (state.phase === "finished") {
      return;
    }
    safety += 1;
  }
};

const resolveEffectScalar = (value: EffectScalar, xValue: number) => {
  if (typeof value === "number") return value;
  switch (value.kind) {
    case "x":
      return xValue;
    case "x_plus":
      return xValue + value.value;
    case "x_minus":
      return Math.max(xValue - value.value, 0);
    case "x_times":
      return xValue * value.value;
    default:
      return 0;
  }
};

const resolveEffectAmount = (amount: EffectAmount, power: number, xValue: number) => {
  if (amount.kind === "flat") return amount.value;
  if (amount.kind === "power") return power;
  if (amount.kind === "power_div") {
    const divisor = resolveEffectScalar(amount.divisor, xValue);
    return divisor > 0 ? Math.floor(power / divisor) : 0;
  }
  if (amount.kind === "x") return xValue;
  if (amount.kind === "x_plus") return xValue + amount.value;
  if (amount.kind === "x_minus") return Math.max(xValue - amount.value, 0);
  if (amount.kind === "x_times") return xValue * amount.value;
  return 0;
};

const isConditionMet = (
  condition: EffectCondition | undefined,
  snapshot: StatusSnapshot,
  sourceId: MatchCharacterId,
  targetId: MatchCharacterId,
  sourceCharacter: Character | null,
  targetCharacter: Character | null
) => {
  if (!condition) return true;
  switch (condition.kind) {
    case "self_has_status": {
      const threshold = condition.min ?? 1;
      const state = getSnapshotStatusState(snapshot, sourceId, condition.status);
      const definition = getStatusDefinition(condition.status, sourceCharacter);
      return isStatusActive(state, definition) && getStatusPrimaryValue(state, definition) >= threshold;
    }
    case "self_missing_status": {
      const state = getSnapshotStatusState(snapshot, sourceId, condition.status);
      const definition = getStatusDefinition(condition.status, sourceCharacter);
      return !isStatusActive(state, definition);
    }
    case "target_has_status": {
      const threshold = condition.min ?? 1;
      const state = getSnapshotStatusState(snapshot, targetId, condition.status);
      const definition = getStatusDefinition(condition.status, targetCharacter);
      return isStatusActive(state, definition) && getStatusPrimaryValue(state, definition) >= threshold;
    }
    case "target_missing_status": {
      const state = getSnapshotStatusState(snapshot, targetId, condition.status);
      const definition = getStatusDefinition(condition.status, targetCharacter);
      return !isStatusActive(state, definition);
    }
    default:
      return true;
  }
};

const isStatusRequirementMet = (
  snapshot: StatusSnapshot,
  characterId: MatchCharacterId,
  status: string,
  min: number,
  character: Character | null
) => {
  const state = getSnapshotStatusState(snapshot, characterId, status);
  const definition = getStatusDefinition(status, character);
  return isStatusActive(state, definition) && getStatusPrimaryValue(state, definition) >= min;
};

const getUseRestrictionError = (
  card: Card,
  state: MatchState,
  sourceId: MatchCharacterId,
  targetId: MatchCharacterId,
  characters: Character[]
) => {
  const restrictions = card.restrictions ?? [];
  if (!restrictions.length) return null;
  const snapshot = snapshotStatuses(state);
  const sourceMember = getMatchCharacter(state, sourceId);
  const targetMember = getMatchCharacter(state, targetId);
  const sourceCharacter = sourceMember
    ? getCharacterById(characters, sourceMember.characterId)
    : null;
  const targetCharacter = targetMember
    ? getCharacterById(characters, targetMember.characterId)
    : null;

  for (const restriction of restrictions) {
    const statuses = restriction.statuses
      .map((status) => ({ name: status.name, min: status.min ?? 1 }))
      .filter((status) => status.name);
    const subjectId = restriction.subject === "target" ? targetId : sourceId;
    const subjectCharacter = restriction.subject === "target" ? targetCharacter : sourceCharacter;
    const meets = restriction.mode === "all"
      ? statuses.every((status) =>
          isStatusRequirementMet(snapshot, subjectId, status.name, status.min, subjectCharacter)
        )
      : statuses.some((status) =>
          isStatusRequirementMet(snapshot, subjectId, status.name, status.min, subjectCharacter)
        );
    const raw = restriction.raw ?? formatRestrictionRaw(restriction, statuses);

    if (restriction.kind === "require" && !meets) {
      return `Card requirement not met: ${raw}`;
    }
    if (restriction.kind === "forbid" && meets) {
      return `Card restriction blocks use: ${raw}`;
    }
  }

  return null;
};

const resolveStructuredEffectList = (
  effects: Effect[],
  state: MatchState,
  entry: StackEntry,
  power: number,
  timing: Effect["timing"],
  isHit: boolean,
  characters: Character[],
  snapshot: StatusSnapshot,
  areaTargets: MatchCharacterId[],
  source: MatchCharacter,
  target: MatchCharacter,
  sourceTeam: MatchTeam,
  targetTeam: MatchTeam,
  sourceCharacter: Character | null,
  targetCharacter: Character | null,
  spendContext: SpendContext
) => {
  const targets = areaTargets.length ? areaTargets : [entry.targetId];

  effects.forEach((effect) => {
    if (effect.timing !== timing) return;
    if (timing === "on_hit" && !isHit) return;

    const isTargetScoped =
      effect.type === "deal_damage" ||
      effect.type === "inflict_status" ||
      effect.type === "inflict_status_per_spent" ||
      effect.type === "deal_damage_per_spent";
    if (
      !isTargetScoped &&
      !isConditionMet(
        effect.condition,
        snapshot,
        entry.sourceId,
        entry.targetId,
        sourceCharacter,
        targetCharacter
      )
    ) {
      return;
    }

    const forEachTarget = (
      handler: (targetMember: MatchCharacter, targetDefinition: Character | null) => void
    ) => {
      targets.forEach((targetId) => {
        const targetMember = getMatchCharacter(state, targetId);
        if (!targetMember || targetMember.defeated) return;
        const targetDefinition = getCharacterById(characters, targetMember.characterId);
        if (
          !isConditionMet(
            effect.condition,
            snapshot,
            entry.sourceId,
            targetId,
            sourceCharacter,
            targetDefinition
          )
        ) {
          return;
        }
        handler(targetMember, targetDefinition);
      });
    };

    switch (effect.type) {
      case "deal_damage": {
        if (spendContext.skipDamage) break;
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        const hits =
          effect.hits === undefined ? 1 : resolveEffectScalar(effect.hits, entry.xValue);
        const total = amount * hits;
        if (total <= 0) break;
        forEachTarget((targetMember, targetDefinition) => {
          const applied = applyDamage(
            state,
            targetMember,
            total,
            entry.types,
            targetDefinition,
            entry.mitigationText
          );
          addLog(state, `${source.name} deals ${applied} damage to ${targetMember.name}.`);
        });
        break;
      }
      case "gain_shield": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        if (amount <= 0) break;
        source.shield += amount;
        addLog(state, `${source.name} gains ${amount} shield.`);
        break;
      }
      case "heal": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        if (amount <= 0) break;
        applyHealing(state, source.id, amount, sourceCharacter);
        break;
      }
      case "gain_ultimate": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        if (amount <= 0) break;
        sourceTeam.ultimate += amount;
        addLog(state, `${sourceTeam.name} gains ${amount} ultimate meter.`);
        break;
      }
      case "gain_status": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        if (amount <= 0) break;
        if (effect.status === "Stagnate") {
          applyStagnate(state, amount, characters, source.id);
        } else {
          applyStatusDelta(source, effect.status, amount, effect.stat, sourceCharacter);
          addLog(state, `${source.name} gains ${amount} ${effect.status}.`);
        }
        break;
      }
      case "inflict_status": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        if (amount <= 0) break;
        forEachTarget((targetMember, targetDefinition) => {
          if (effect.status === "Stagnate") {
            applyStagnate(state, amount, characters, targetMember.id);
          } else {
            applyStatusDelta(targetMember, effect.status, amount, effect.stat, targetDefinition);
            addLog(state, `${targetMember.name} gains ${amount} ${effect.status}.`);
          }
        });
        break;
      }
      case "gain_status_per_spent": {
        const perSpend = resolveEffectAmount(effect.amount, power, entry.xValue);
        if (perSpend <= 0) break;
        const spentByStatus = spendContext.spentResources[effect.resource] ?? 0;
        const spent =
          spentByStatus > 0
            ? spentByStatus
            : /ammo/i.test(effect.resource)
              ? spendContext.ammoSpent
              : 0;
        const total = perSpend * spent;
        if (total <= 0) break;
        applyStatusDelta(source, effect.status, total, effect.stat, sourceCharacter);
        addLog(state, `${source.name} gains ${total} ${effect.status}.`);
        break;
      }
      case "inflict_status_per_spent": {
        const perSpend = resolveEffectAmount(effect.amount, power, entry.xValue);
        if (perSpend <= 0) break;
        const spentByStatus = spendContext.spentResources[effect.resource] ?? 0;
        const spent =
          spentByStatus > 0
            ? spentByStatus
            : /ammo/i.test(effect.resource)
              ? spendContext.ammoSpent
              : 0;
        const total = perSpend * spent;
        if (total <= 0) break;
        forEachTarget((targetMember, targetDefinition) => {
          applyStatusDelta(targetMember, effect.status, total, effect.stat, targetDefinition);
          addLog(state, `${targetMember.name} gains ${total} ${effect.status}.`);
        });
        break;
      }
      case "set_status": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        const recipientId = resolveEffectTargetCharacterId(effect.target, entry);
        const recipient = getMatchCharacter(state, recipientId);
        if (!recipient || recipient.defeated) break;
        const recipientCharacter = getCharacterById(characters, recipient.characterId);
        const applied = setStatusValue(recipient, effect.status, amount, effect.stat, recipientCharacter);
        if (applied === null) break;
        addLog(state, `${recipient.name} sets ${effect.status} to ${applied}.`);
        break;
      }
      case "reduce_status": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        const recipientId = resolveEffectTargetCharacterId(effect.target, entry);
        const recipient = getMatchCharacter(state, recipientId);
        if (!recipient || recipient.defeated) break;
        const recipientCharacter = getCharacterById(characters, recipient.characterId);
        const applied = reduceStatusValue(
          recipient,
          effect.status,
          amount,
          effect.stat,
          { minValue: effect.minValue, maxAmount: effect.maxAmount },
          recipientCharacter
        );
        if (applied === null) break;
        addLog(state, `${recipient.name} reduces ${effect.status} to ${applied}.`);
        break;
      }
      case "spend_status": {
        break;
      }
      case "deal_damage_per_spent": {
        if (spendContext.skipDamage) break;
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        const spentByStatus = spendContext.spentResources[effect.status] ?? 0;
        const spent =
          spentByStatus > 0 ? spentByStatus : /ammo/i.test(effect.status) ? spendContext.ammoSpent : 0;
        const total = amount * spent;
        if (total <= 0) break;
        forEachTarget((targetMember, targetDefinition) => {
          const applied = applyDamage(
            state,
            targetMember,
            total,
            entry.types,
            targetDefinition,
            entry.mitigationText
          );
          addLog(state, `${source.name} deals ${applied} damage to ${targetMember.name}.`);
        });
        break;
      }
      case "draw_cards": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        const count = Math.floor(amount);
        if (count <= 0) break;
        const recipientId = resolveEffectTargetTeamId(state, effect.target, entry);
        drawCards(state, recipientId, count);
        break;
      }
      case "create_card": {
        const amount = resolveEffectAmount(effect.count, power, entry.xValue);
        const count = Math.floor(amount);
        if (count <= 0) break;
        const recipientId = resolveEffectTargetCharacterId(effect.target, entry);
        const destination = getCreateDestination(entry.effectText, effect.cardName);
        createCardsAtDestination(state, recipientId, effect.cardName, count, characters, destination);
        break;
      }
      case "block_play": {
        if (effect.duration !== "combat_round") break;
        const recipientId = resolveEffectTargetTeamId(state, effect.target, entry);
        addCombatRoundLock(state, recipientId, entry.cardName);
        break;
      }
      case "reload_equipped": {
        reloadEquippedWeapon(state, entry.sourceId, characters);
        break;
      }
      case "switch_equip": {
        switchEquipment(state, entry.sourceId, effect.status, characters);
        break;
      }
      case "choose": {
        if (entry.choiceIndex === undefined) break;
        const choice = effect.options[entry.choiceIndex];
        if (!choice) break;
        resolveStructuredEffectList(
          choice.effects,
          state,
          entry,
          power,
          timing,
          isHit,
          characters,
          snapshot,
          areaTargets,
          source,
          target,
          sourceTeam,
          targetTeam,
          sourceCharacter,
          targetCharacter,
          spendContext
        );
        break;
      }
      case "grant_keyword": {
        if (effect.resource) {
          const spentByStatus = spendContext.spentResources[effect.resource] ?? 0;
          const spent =
            spentByStatus > 0
              ? spentByStatus
              : /ammo/i.test(effect.resource)
                ? spendContext.ammoSpent
                : 0;
          const minSpent = effect.minSpent ?? 1;
          if (spent < minSpent) break;
        }
        grantEntryKeyword(entry, effect.keyword);
        break;
      }
      case "retain":
        break;
      default:
        break;
    }
  });
};

const resolveStructuredEffects = (
  state: MatchState,
  entry: StackEntry,
  power: number,
  timing: Effect["timing"],
  isHit: boolean,
  characters: Character[],
  snapshot: StatusSnapshot,
  areaTargets: MatchCharacterId[],
  spendContext: SpendContext
) => {
  if (!entry.effects) return;
  const source = getMatchCharacter(state, entry.sourceId);
  const target = getMatchCharacter(state, entry.targetId);
  if (!source || !target) return;
  const sourceTeam = getTeamForCharacter(state, entry.sourceId);
  const targetTeam = getTeamForCharacter(state, entry.targetId);
  if (!sourceTeam || !targetTeam) return;
  const sourceCharacter = getCharacterById(characters, source.characterId);
  const targetCharacter = getCharacterById(characters, target.characterId);

  resolveStructuredEffectList(
    entry.effects,
    state,
    entry,
    power,
    timing,
    isHit,
    characters,
    snapshot,
    areaTargets,
    source,
    target,
    sourceTeam,
    targetTeam,
    sourceCharacter,
    targetCharacter,
    spendContext
  );
};

const resolveSpendContext = (
  state: MatchState,
  entry: StackEntry,
  timing: Effect["timing"],
  characters: Character[],
  options?: { preview?: boolean }
): SpendContext => {
  const context: SpendContext = {
    skipAll: false,
    skipDamage: false,
    ammoSpent: 0,
    spentResources: {},
  };
  const source = getMatchCharacter(state, entry.sourceId);
  const target = getMatchCharacter(state, entry.targetId);
  if (!source || !target) return context;
  const sourceTeam = getTeamForCharacter(state, entry.sourceId);
  if (!sourceTeam) return context;
  const sourceCharacter = getCharacterById(characters, source.characterId);
  const targetCharacter = getCharacterById(characters, target.characterId);
  const segments = getTimedTextSegments(entry.effectText);

  const recordSpend = (resource: string, spent: number) => {
    if (spent <= 0) return;
    context.spentResources[resource] = (context.spentResources[resource] ?? 0) + spent;
    if (!options?.preview) {
      if (!entry.spentResources) entry.spentResources = {};
      entry.spentResources[resource] = (entry.spentResources[resource] ?? 0) + spent;
    }
    if (/ammo/i.test(resource)) {
      context.ammoSpent += spent;
    }
  };

  const resolveSpendAmount = (amount: EffectAmount) => {
    if (amount.kind === "flat") return amount.value;
    if (amount.kind === "x") return entry.xValue;
    if (amount.kind === "x_plus") return entry.xValue + amount.value;
    if (amount.kind === "x_minus") return Math.max(entry.xValue - amount.value, 0);
    if (amount.kind === "x_times") return entry.xValue * amount.value;
    return 0;
  };

  const hasStructuredSpend = hasStructuredEffectType(
    entry.effects,
    timing,
    entry.choiceIndex,
    "spend_status"
  );
  if (hasStructuredSpend && entry.effects) {
    const snapshot = snapshotStatuses(state);
    forEachStructuredEffect(entry.effects, timing, entry.choiceIndex, (effect) => {
      if (effect.type !== "spend_status") return;
      if (
        !isConditionMet(
          effect.condition,
          snapshot,
          entry.sourceId,
          entry.targetId,
          sourceCharacter,
          targetCharacter
        )
      ) {
        return;
      }
      const amount = resolveSpendAmount(effect.amount);
      if (amount <= 0) return;
      const allowPartial = Boolean(effect.allowPartial);
      const available = getAvailableSpend(
        source,
        effect.status,
        amount,
        sourceCharacter,
        allowPartial
      );
      const spent = options?.preview
        ? available
        : spendStatus(
            state,
            entry.sourceId,
            effect.status,
            amount,
            sourceCharacter,
            { allowPartial, label: effect.status }
          );
      if (!allowPartial && spent < amount) {
        if (effect.gateAll) context.skipAll = true;
        if (effect.gateDamage) context.skipDamage = true;
      }
      recordSpend(effect.status, spent);
    });
    return context;
  }

  segments.forEach((segment) => {
    if (segment.timing !== timing) return;
    const line = segment.text;

    const spendInflict = parseSpendInflictLine(line);
    if (spendInflict) {
      const available = getAvailableSpend(
        source,
        spendInflict.resource,
        spendInflict.spendAmount,
        sourceCharacter,
        false
      );
      if (available >= spendInflict.spendAmount && !options?.preview) {
        const spent = spendStatus(
          state,
          entry.sourceId,
          spendInflict.resource,
          spendInflict.spendAmount,
          sourceCharacter,
          { allowPartial: false, label: spendInflict.resource }
        );
        if (spent >= spendInflict.spendAmount) {
          applyStatusDelta(
            target,
            spendInflict.status,
            spendInflict.statusAmount,
            undefined,
            targetCharacter
          );
          addLog(
            state,
            `${target.name} gains ${spendInflict.statusAmount} ${spendInflict.status}.`
          );
        }
      }
      return;
    }

    const instruction = parseSpendInstruction(line, entry.xValue);
    if (!instruction) return;
    if (instruction.amount <= 0) return;
    const available = getAvailableSpend(
      source,
      instruction.resource,
      instruction.amount,
      sourceCharacter,
      instruction.allowPartial
    );
    const spent = options?.preview
      ? available
      : spendStatus(
          state,
          entry.sourceId,
          instruction.resource,
          instruction.amount,
          sourceCharacter,
          { allowPartial: instruction.allowPartial, label: instruction.resource }
        );

    if (!instruction.allowPartial && spent < instruction.amount) {
      if (instruction.gateAll) context.skipAll = true;
      if (instruction.gateDamage) context.skipDamage = true;
    }

    recordSpend(instruction.resource, spent);
  });

  return context;
};

const resolveTextMetaEffects = (
  state: MatchState,
  entry: StackEntry,
  timing: Effect["timing"],
  characters: Character[],
  spendContext: SpendContext,
  areaTargets: MatchCharacterId[]
) => {
  if (spendContext.skipAll) return;
  const source = getMatchCharacter(state, entry.sourceId);
  const sourceTeam = getTeamForCharacter(state, entry.sourceId);
  if (!source || !sourceTeam) return;
  const segments = getTimedTextSegments(entry.effectText);
  const options = getTextChoiceOptions(entry.effectText);
  const normalizedOptions = options.map((option) => normalizeText(option).toLowerCase());
  const chosenOption =
    entry.choiceIndex !== undefined && options[entry.choiceIndex]
      ? normalizeText(options[entry.choiceIndex]).toLowerCase()
      : null;
  const hasReloadEffect = hasStructuredEffectType(
    entry.effects,
    timing,
    entry.choiceIndex,
    "reload_equipped"
  );
  const hasSwitchEquipEffect = hasStructuredEffectType(
    entry.effects,
    timing,
    entry.choiceIndex,
    "switch_equip"
  );
  const hasDrawEffect = hasStructuredEffectType(
    entry.effects,
    timing,
    entry.choiceIndex,
    "draw_cards"
  );
  const hasCreateEffect = hasStructuredEffectType(
    entry.effects,
    timing,
    entry.choiceIndex,
    "create_card"
  );
  const targets = areaTargets.length ? areaTargets : [entry.targetId];

  segments.forEach((segment) => {
    if (segment.timing !== timing) return;
    const line = segment.text;
    const normalized = normalizeText(line).toLowerCase();
    if (normalized === "choose 1:") return;
    if (options.length && normalizedOptions.includes(normalized) && normalized !== chosenOption) {
      return;
    }

    const create = hasCreateEffect ? null : parseCreateFromLine(line);
    if (create) {
      createCardsAtDestination(
        state,
        entry.sourceId,
        create.cardName,
        create.count,
        characters,
        create.destination
      );
    }

    const drawCount = hasDrawEffect ? null : parseDrawFromLine(line);
    if (drawCount && drawCount > 0) {
      drawCards(state, sourceTeam.id, drawCount);
    }

    const scryCount = parseScryLine(line, entry.xValue);
    if (scryCount && scryCount > 0) {
      scryTopCards(
        state,
        sourceTeam.id,
        scryCount,
        entry.scryDiscardIds,
        entry.scryOrderIds
      );
    }

    const seek = parseSeekLine(line, entry.xValue);
    if (seek && seek.count > 0) {
      seekTopCards(
        state,
        sourceTeam.id,
        seek.count,
        seek.criteria,
        seek.take,
        characters,
        entry.seekTakeIds
      );
    }

    const searchCriteria = parseSearchLine(line);
    if (searchCriteria) {
      searchDeck(state, sourceTeam.id, searchCriteria, characters, entry.searchPickId);
    }

    if (!hasReloadEffect && isReloadLine(line)) {
      reloadEquippedWeapon(state, entry.sourceId, characters);
    }

    const switchEquip = hasSwitchEquipEffect ? null : parseEquipSwitchLine(line);
    if (switchEquip) {
      switchEquipment(state, entry.sourceId, switchEquip, characters);
    }

    const pushPull = parsePushPullLine(line, entry.xValue);
    if (pushPull && pushPull.amount > 0) {
      targets.forEach((targetId) => {
        const target = getMatchCharacter(state, targetId);
        if (!target || target.defeated) return;
        let direction = 0;
      if (pushPull.kind === "push") {
        if (target.position > source.position) direction = 1;
        else if (target.position < source.position) direction = -1;
        else if (entry.pushDirection) direction = entry.pushDirection === "right" ? 1 : -1;
        else direction = target.position < state.lineSize - 1 ? 1 : -1;
      } else {
        if (target.position > source.position) direction = -1;
        else if (target.position < source.position) direction = 1;
      }
      if (direction === 0) return;
        const moved = moveCharacterBySwapping(
          state,
          targetId,
          direction,
          pushPull.amount,
          characters
        );
        if (moved > 0) {
          const verb = pushPull.kind === "push" ? "pushes" : "pulls";
          addLog(state, `${source.name} ${verb} ${target.name} ${moved} space(s).`);
        }
      });
    }

    if (isSwapLine(line)) {
      const target = getMatchCharacter(state, entry.targetId);
      if (!target || target.defeated) return;
      const targetTeam = getTeamForCharacter(state, entry.targetId);
      if (!targetTeam || targetTeam.id !== sourceTeam.id) return;
      if (
        !canMoveCharacter(state, source.id, characters) ||
        !canMoveCharacter(state, target.id, characters)
      ) {
        addLog(state, "A rooted character cannot be moved or swapped.");
        return;
      }
      const sourcePosition = source.position;
      source.position = target.position;
      target.position = sourcePosition;
      addLog(state, `${source.name} swaps positions with ${target.name}.`);
    }

    const xConditionalMatch = normalized.match(
      /If X is (\d+),\s*inflict\s+(\d+)\s+([^.,]+)/i
    );
    if (xConditionalMatch) {
      const xTarget = Number(xConditionalMatch[1]);
      const amount = Number(xConditionalMatch[2]);
      const status = xConditionalMatch[3].split(/ and |, /i)[0].trim();
      if (!Number.isNaN(xTarget) && entry.xValue === xTarget && amount > 0 && status) {
        targets.forEach((targetId) => {
          const target = getMatchCharacter(state, targetId);
          if (!target || target.defeated) return;
          const targetCharacter = getCharacterById(characters, target.characterId);
          applyStatusDelta(target, status, amount, undefined, targetCharacter);
          addLog(state, `${target.name} gains ${amount} ${status}.`);
        });
      }
    }
  });
};

const resolveTextEffectsForTiming = (
  state: MatchState,
  entry: StackEntry,
  power: number,
  timing: Effect["timing"],
  isHit: boolean,
  characters: Character[],
  spendContext: SpendContext,
  areaTargets: MatchCharacterId[]
) => {
  if (timing === "on_hit" && !isHit) return;
  if (spendContext.skipAll) return;
  const source = getMatchCharacter(state, entry.sourceId);
  if (!source) return;
  const sourceTeam = getTeamForCharacter(state, entry.sourceId);
  if (!sourceTeam) return;
  const sourceCharacter = getCharacterById(characters, source.characterId);
  const targets = areaTargets.length ? areaTargets : [entry.targetId];
  const forEachTarget = (
    handler: (targetMember: MatchCharacter, targetDefinition: Character | null) => void
  ) => {
    targets.forEach((targetId) => {
      const targetMember = getMatchCharacter(state, targetId);
      if (!targetMember || targetMember.defeated) return;
      const targetDefinition = getCharacterById(characters, targetMember.characterId);
      handler(targetMember, targetDefinition);
    });
  };
  const segments = getTimedTextSegments(entry.effectText);
  const options = getTextChoiceOptions(entry.effectText);
  const normalizedOptions = options.map((option) => normalizeText(option).toLowerCase());
  const chosenOption =
    entry.choiceIndex !== undefined && options[entry.choiceIndex]
      ? normalizeText(options[entry.choiceIndex]).toLowerCase()
      : null;

  segments.forEach((segment) => {
    if (segment.timing !== timing) return;
    const line = segment.text;
    const normalized = normalizeText(line).toLowerCase();
    if (normalized === "choose 1:") return;
    if (options.length && normalizedOptions.includes(normalized) && normalized !== chosenOption) {
      return;
    }

    const damage = spendContext.skipDamage
      ? null
      : parseDamageFromLine(line, power, entry.xValue);
    if (damage !== null && damage > 0) {
      const ammoSpent =
        spendContext.ammoSpent ||
        Object.entries(entry.spentResources ?? {}).reduce((total, [name, amount]) => {
          if (/ammo/i.test(name)) return total + amount;
          return total;
        }, 0);
      const totalDamage =
        /once per ammo spent/i.test(normalizeText(line)) && ammoSpent > 0
          ? damage * ammoSpent
          : damage;
      if (totalDamage > 0) {
        forEachTarget((targetMember, targetDefinition) => {
          const applied = applyDamage(
            state,
            targetMember,
            totalDamage,
            entry.types,
            targetDefinition,
            entry.mitigationText
          );
          addLog(
            state,
            `${source.name} deals ${applied} damage to ${targetMember.name}.`
          );
        });
      }
    }

    const shield = parseShieldFromLine(line, power, entry.xValue);
    if (shield !== null && shield > 0) {
      source.shield += shield;
      addLog(state, `${source.name} gains ${shield} shield.`);
    }

    const heal = parseHealFromLine(line, power, entry.xValue);
    if (heal !== null && heal > 0) {
      applyHealing(state, source.id, heal, sourceCharacter);
    }

    const ultimate = parseUltimateFromLine(line, power);
    if (ultimate !== null && ultimate > 0) {
      sourceTeam.ultimate += ultimate;
      addLog(state, `${sourceTeam.name} gains ${ultimate} ultimate meter.`);
    }

    const spendInflict = parseSpendInflictLine(line);
    const statusChange = spendInflict ? null : parseStatusChange(line);
    if (statusChange && statusChange.amount > 0) {
      if (statusChange.type === "inflict") {
        forEachTarget((targetMember, targetDefinition) => {
          if (statusChange.status === "Stagnate") {
            applyStagnate(state, statusChange.amount, characters, targetMember.id);
          } else {
            applyStatusDelta(
              targetMember,
              statusChange.status,
              statusChange.amount,
              undefined,
              targetDefinition
            );
            addLog(
              state,
              `${targetMember.name} gains ${statusChange.amount} ${statusChange.status}.`
            );
          }
        });
        return;
      }
      if (statusChange.status === "Stagnate") {
        applyStagnate(state, statusChange.amount, characters, source.id);
      } else {
        applyStatusDelta(
          source,
          statusChange.status,
          statusChange.amount,
          undefined,
          sourceCharacter
        );
        addLog(state, `${source.name} gains ${statusChange.amount} ${statusChange.status}.`);
      }
    }

    const purge = parsePurgeLine(line);
    if (purge) {
      forEachTarget((targetMember) => {
        applyPurgeInstruction(state, source, targetMember, purge, characters);
      });
    }

  });
};

const resolveEffectsForTiming = (
  state: MatchState,
  entry: StackEntry,
  power: number,
  timing: Effect["timing"],
  isHit: boolean,
  characters: Character[]
) => {
  if (entry.negated) return;
  const source = getMatchCharacter(state, entry.sourceId);
  const target = getMatchCharacter(state, entry.targetId);
  if (!source || !target) return;
  const sourceCharacter = getCharacterById(characters, source.characterId);
  const areaTargets = getAreaTargetsForEntry(state, entry);
  const spendContext = resolveSpendContext(state, entry, timing, characters);
  resolveTextMetaEffects(state, entry, timing, characters, spendContext, areaTargets);

  if (entry.effects && entry.effects.length > 0) {
    const snapshot = snapshotStatuses(state);
    if (!spendContext.skipAll) {
      resolveStructuredEffects(
        state,
        entry,
        power,
        timing,
        isHit,
        characters,
        snapshot,
        areaTargets,
        spendContext
      );
    }
  } else {
    resolveTextEffectsForTiming(
      state,
      entry,
      power,
      timing,
      isHit,
      characters,
      spendContext,
      areaTargets
    );
  }

  pruneStatuses(source, sourceCharacter);
  const prunedTargets = new Set(areaTargets);
  prunedTargets.add(entry.targetId);
  prunedTargets.delete(source.id);
  prunedTargets.forEach((targetId) => {
    const targetMember = getMatchCharacter(state, targetId);
    if (!targetMember) return;
    const targetDefinition = getCharacterById(characters, targetMember.characterId);
    pruneStatuses(targetMember, targetDefinition);
  });
};

const estimateDamageForTiming = (
  state: MatchState,
  entry: StackEntry,
  power: number,
  timing: Effect["timing"],
  characters: Character[]
) => {
  if (entry.negated) return 0;
  const spendContext = resolveSpendContext(state, entry, timing, characters, { preview: true });
  if (entry.effects && entry.effects.length > 0) {
    if (spendContext.skipAll || spendContext.skipDamage) return 0;
    const snapshot = snapshotStatuses(state);
    const source = getMatchCharacter(state, entry.sourceId);
    const target = getMatchCharacter(state, entry.targetId);
    if (!source || !target) return 0;
    const sourceCharacter = getCharacterById(characters, source.characterId);
    const targetCharacter = getCharacterById(characters, target.characterId);
    let total = 0;

    forEachStructuredEffect(entry.effects, timing, entry.choiceIndex, (effect) => {
      if (effect.type !== "deal_damage" && effect.type !== "deal_damage_per_spent") return;
      if (
        !isConditionMet(
          effect.condition,
          snapshot,
          entry.sourceId,
          entry.targetId,
          sourceCharacter,
          targetCharacter
        )
      ) {
        return;
      }
      const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
      if (effect.type === "deal_damage") {
        const hits =
          effect.hits === undefined ? 1 : resolveEffectScalar(effect.hits, entry.xValue);
        total += amount * hits;
        return;
      }
      const spentByStatus = spendContext.spentResources[effect.status] ?? 0;
      const spent =
        spentByStatus > 0 ? spentByStatus : /ammo/i.test(effect.status) ? spendContext.ammoSpent : 0;
      total += amount * spent;
    });

    return total;
  }

  if (spendContext.skipAll || spendContext.skipDamage) return 0;
  const segments = getTimedTextSegments(entry.effectText);
  return segments.reduce((total, segment) => {
    if (segment.timing !== timing) return total;
    const damage = parseDamageFromLine(segment.text, power, entry.xValue);
    if (damage !== null && damage > 0) {
      const perHit =
        /once per ammo spent/i.test(normalizeText(segment.text)) && spendContext.ammoSpent > 0
          ? damage * spendContext.ammoSpent
          : damage;
      return total + perHit;
    }
    return total;
  }, 0);
};

const resolveUse = (
  state: MatchState,
  entry: StackEntry,
  isHit: boolean,
  characters: Character[],
  options?: { cancelled?: boolean; powerOverride?: number }
) => {
  const source = getMatchCharacter(state, entry.sourceId);
  const target = getMatchCharacter(state, entry.targetId);
  if (!source || !target) return;
  entry.redirected = false;
  const originalTargetId = entry.targetId;

  const power =
    options?.powerOverride ??
    entry.rolledPower ??
    rollPower(entry.powerText, entry.xValue, state.rng);
  let cancelled = options?.cancelled ?? false;

  if (!cancelled && getActionType(entry.types) === "defense") {
    const sourceCharacter = getCharacterById(characters, source.characterId);
    const stagger = getActiveStatusState(source, "Stagger", sourceCharacter);
    if (stagger) {
      applyStatusStatDelta(source, "Stagger", -1, "stack", sourceCharacter);
      entry.cancelledBeforeUse = true;
      cancelled = true;
      addLog(state, `${source.name}'s ${entry.cardName} is cancelled by Stagger.`);
    }
  }

  if (entry.negated) {
    addLog(state, `${source.name}'s ${entry.cardName} is negated.`);
    entry.negated = false;
    return;
  }

  if (!cancelled) {
    if (!entry.redirected) {
      const redirectCandidates = getRedirectCandidates(state, entry, characters);
      const preferred = entry.redirectTargetId
        ? redirectCandidates.find((candidate) => candidate.targetId === entry.redirectTargetId) ??
          null
        : null;
      const chosen = preferred ?? redirectCandidates[0] ?? null;
      if (chosen && chosen.targetId !== entry.targetId) {
        const redirectTarget = getMatchCharacter(state, chosen.targetId);
        const previousTarget = getMatchCharacter(state, entry.targetId);
        entry.targetId = chosen.targetId;
        entry.redirected = true;
        if (chosen.source === "cover" && redirectTarget && chosen.status) {
          const redirectCharacter = getCharacterById(characters, redirectTarget.characterId);
          if (redirectCharacter) {
            applyStatusStatDelta(
              redirectTarget,
              chosen.status,
              -1,
              "value",
              redirectCharacter
            );
            addLog(
              state,
              `${redirectTarget.name} uses Cover to redirect the attack from ${previousTarget?.name ?? "an ally"}.`
            );
          }
        } else if (redirectTarget) {
          addLog(
            state,
            `${source.name} redirects ${entry.cardName} from ${previousTarget?.name ?? "the target"} to ${redirectTarget.name}.`
          );
        }
      }
    }

    addLog(state, `${source.name} uses ${entry.cardName}.`);
    resolveEffectsForTiming(state, entry, power, "before_use", isHit, characters);
    resolveEffectsForTiming(state, entry, power, "on_use", isHit, characters);
    if (isHit) {
      resolveEffectsForTiming(state, entry, power, "on_hit", true, characters);
      if (getActionType(entry.types) === "attack") {
        const hitTarget = getMatchCharacter(state, entry.targetId);
        if (hitTarget) {
          const targetCharacter = getCharacterById(characters, hitTarget.characterId);
          const thorns = getActiveStatusState(hitTarget, "Thorns", targetCharacter);
          if (thorns && thorns.potency > 0) {
            const sourceCharacter = getCharacterById(characters, source.characterId);
            applyStatusDamage(state, source.id, thorns.potency, "Thorns", sourceCharacter);
          }
        }
      }
    }
    resolveEffectsForTiming(state, entry, power, "after_use", isHit, characters);
  }
  resolveEffectsForTiming(state, entry, power, "always", isHit, characters);

  if (!cancelled && isHit && getActionType(entry.types) === "attack") {
    const sourceCharacter = getCharacterById(characters, source.characterId);
    const bankai = getActiveStatusState(source, "Bankai: Tensa Zangetsu", sourceCharacter);
    const flags = source.turnFlags;
    if (bankai && !flags.bankaiHitUsed) {
      applyStatusDelta(source, "Reiatsu", 1, undefined, sourceCharacter);
      flags.bankaiHitUsed = true;
      addLog(state, `${source.name} gains 1 Reiatsu from Bankai.`);
    }
  }

  if (entry.targetId !== originalTargetId) {
    entry.targetId = originalTargetId;
  }

  if (!cancelled) {
    state.afterUseWindow = {
      lastUsedBy: entry.playedBy,
      lastUsedCharacterId: source.id,
      validForAction: (state.actionId ?? 0) + 1,
    };
  }

  if (target.hp <= 0) {
    handleDefeat(state, target.id, `${target.name} is defeated.`);
  }
};

const getModifiedEntryPower = (
  state: MatchState,
  entry: StackEntry,
  actionType: ActionType,
  characters: Character[]
) => {
  const base = entry.rolledPower ?? rollPower(entry.powerText, entry.xValue, state.rng);
  if (entry.rolledPower === undefined) {
    entry.rolledPower = base;
  }
  const source = getMatchCharacter(state, entry.sourceId);
  if (!source) return base;
  const character = getCharacterById(characters, source.characterId);
  return applyPowerModifiers(base, source, character, actionType);
};

const finalizeEntryCard = (state: MatchState, entry: StackEntry, characters: Character[]) => {
  if (!entry.cardInstance) return;
  const team = getTeamForCharacter(state, entry.sourceId);
  if (!team) return;
  const card = findCard(characters, entry.cardInstance.characterId, entry.cardSlot);
  if (!card) return;
  const lifecycle = getLifecycleKeywords(card.effect, card.effects);
  if (lifecycle.exhaust) {
    team.exhausted.push(entry.cardInstance);
  } else {
    team.discard.push(entry.cardInstance);
  }
};

const resolveZone = (state: MatchState, zoneName: ZoneName, characters: Character[]) => {
  const zone = state.zones[zoneName];
  if (!zone.cards.length) return;

  addLog(state, `${zoneLabel(zoneName)} Zone resolves.`);

  let index = zone.cards.length - 1;
  while (index >= 0) {
    const right = zone.cards[index];
    const leftIndex = index - 1;

    if (leftIndex < 0) {
      const rightType = getActionType(right.types);
      const rightPower = getModifiedEntryPower(state, right, rightType, characters);
      resolveUse(state, right, rightType === "attack", characters, { powerOverride: rightPower });
      finalizeEntryCard(state, right, characters);
      zone.cards.splice(index, 1);
      index -= 1;
      continue;
    }

    const left = zone.cards[leftIndex];
    if (left.playedBy === right.playedBy) {
      const rightType = getActionType(right.types);
      const rightPower = getModifiedEntryPower(state, right, rightType, characters);
      resolveUse(state, right, rightType === "attack", characters, { powerOverride: rightPower });
      finalizeEntryCard(state, right, characters);
      zone.cards.splice(index, 1);
      index = leftIndex;
      continue;
    }

    const rightType = getActionType(right.types);
    const leftType = getActionType(left.types);

    const rightPower = getModifiedEntryPower(state, right, rightType, characters);
    const leftPower = getModifiedEntryPower(state, left, leftType, characters);

    const rightNegates = !right.negated && hasNegateText(right);
    const leftNegates = !left.negated && hasNegateText(left);
    if (rightNegates && !left.negated) {
      left.negated = true;
      addLog(state, `${right.cardName} negates ${left.cardName}.`);
    }
    if (leftNegates && !right.negated) {
      right.negated = true;
      addLog(state, `${left.cardName} negates ${right.cardName}.`);
    }

    resolveEffectsForTiming(state, right, rightPower, "before_clash", false, characters);
    resolveEffectsForTiming(state, left, leftPower, "before_clash", false, characters);

    if (rightType === "attack" && leftType === "attack") {
      if (rightPower === leftPower) {
        addLog(state, `${right.cardName} and ${left.cardName} clash and are both cancelled.`);
        resolveEffectsForTiming(state, right, rightPower, "after_clash", false, characters);
        resolveEffectsForTiming(state, left, leftPower, "after_clash", false, characters);
        resolveUse(state, right, false, characters, { cancelled: true, powerOverride: rightPower });
        resolveUse(state, left, false, characters, { cancelled: true, powerOverride: leftPower });
        finalizeEntryCard(state, right, characters);
        finalizeEntryCard(state, left, characters);
        zone.cards.splice(leftIndex, 2);
        index = leftIndex - 1;
      } else if (rightPower > leftPower) {
        addLog(state, `${right.cardName} overpowers ${left.cardName}.`);
        resolveEffectsForTiming(state, right, rightPower, "after_clash", false, characters);
        resolveEffectsForTiming(state, left, leftPower, "after_clash", false, characters);
        resolveUse(state, left, false, characters, { cancelled: true, powerOverride: leftPower });
        finalizeEntryCard(state, left, characters);
        zone.cards.splice(leftIndex, 1);
        index = leftIndex;
      } else {
        addLog(state, `${left.cardName} overpowers ${right.cardName}.`);
        resolveEffectsForTiming(state, right, rightPower, "after_clash", false, characters);
        resolveEffectsForTiming(state, left, leftPower, "after_clash", false, characters);
        resolveUse(state, right, false, characters, { cancelled: true, powerOverride: rightPower });
        finalizeEntryCard(state, right, characters);
        zone.cards.splice(index, 1);
        index = leftIndex;
      }
      continue;
    }

    if (
      (rightType === "attack" && leftType === "defense") ||
      (rightType === "defense" && leftType === "attack")
    ) {
      const defense = rightType === "defense" ? right : left;
      const attack = rightType === "attack" ? right : left;
      const defensePower = defense === right ? rightPower : leftPower;
      const attackPower = attack === right ? rightPower : leftPower;

      resolveEffectsForTiming(state, right, rightPower, "after_clash", false, characters);
      resolveEffectsForTiming(state, left, leftPower, "after_clash", false, characters);

      resolveUse(state, defense, false, characters, { powerOverride: defensePower });

      const defenseCancelled = Boolean(defense.cancelledBeforeUse);
      const defenseKeywords = defenseCancelled
        ? { evade: false, counter: false, reuse: false, followUp: false, assistAttack: false }
        : getEntryKeywordFlags(defense);
      const attackKeywords = getEntryKeywordFlags(attack);
      let attackIsHit = true;
      let defenseReuse = false;

      const requiresZeroDamageCheck = defenseKeywords.evade || defenseKeywords.counter;
      let damageAfterShield: number | null = null;
      if (requiresZeroDamageCheck) {
        const attackDamage = estimateDamageForTiming(
          state,
          attack,
          attackPower,
          "on_use",
          characters
        );
        const attackTarget = getMatchCharacter(state, attack.targetId);
        const targetShield = attackTarget?.shield ?? 0;
        damageAfterShield = Math.max(attackDamage - targetShield, 0);
      }

      if (defenseKeywords.evade && damageAfterShield === 0) {
        attackIsHit = false;
        defenseReuse = true;
      }

      if (!defenseCancelled && defenseKeywords.counter && damageAfterShield === 0) {
        const defender = getMatchCharacter(state, defense.sourceId);
        const attacker = getMatchCharacter(state, attack.sourceId);
        if (defender && attacker) {
          state.counterWindow = {
            by: defense.playedBy,
            targetId: attacker.id,
            validForAction: (state.actionId ?? 0) + 1,
          };
          addLog(state, `${defender.name} can Counter ${attacker.name}.`);
        }
      }

      attack.mitigationText = defenseCancelled ? undefined : defense.effectText;
      resolveUse(state, attack, attackIsHit, characters, { powerOverride: attackPower });
      attack.mitigationText = undefined;

      const keepDefense = !defenseCancelled && (defenseReuse || defenseKeywords.reuse);
      const keepAttack = attackKeywords.reuse;
      const removeLeft = left === defense ? !keepDefense : !keepAttack;
      const removeRight = right === defense ? !keepDefense : !keepAttack;

      if (removeLeft && removeRight) {
        finalizeEntryCard(state, left, characters);
        finalizeEntryCard(state, right, characters);
        zone.cards.splice(leftIndex, 2);
        index = leftIndex - 1;
      } else if (removeLeft && !removeRight) {
        finalizeEntryCard(state, left, characters);
        zone.cards.splice(leftIndex, 1);
        index = leftIndex;
      } else if (!removeLeft && removeRight) {
        finalizeEntryCard(state, right, characters);
        zone.cards.splice(index, 1);
        index = leftIndex;
      } else {
        finalizeEntryCard(state, left, characters);
        zone.cards.splice(leftIndex, 1);
        index = leftIndex;
      }
      continue;
    }

    if (rightType === "defense" && leftType === "defense") {
      resolveEffectsForTiming(state, right, rightPower, "after_clash", false, characters);
      resolveEffectsForTiming(state, left, leftPower, "after_clash", false, characters);
      resolveUse(state, right, false, characters, { powerOverride: rightPower });
      resolveUse(state, left, false, characters, { powerOverride: leftPower });

      const rightReuse = !right.cancelledBeforeUse && getEntryKeywordFlags(right).reuse;
      const leftReuse = !left.cancelledBeforeUse && getEntryKeywordFlags(left).reuse;
      const removeLeft = !leftReuse;
      const removeRight = !rightReuse;

      if (removeLeft && removeRight) {
        finalizeEntryCard(state, left, characters);
        finalizeEntryCard(state, right, characters);
        zone.cards.splice(leftIndex, 2);
        index = leftIndex - 1;
      } else if (removeLeft && !removeRight) {
        finalizeEntryCard(state, left, characters);
        zone.cards.splice(leftIndex, 1);
        index = leftIndex;
      } else if (!removeLeft && removeRight) {
        finalizeEntryCard(state, right, characters);
        zone.cards.splice(index, 1);
        index = leftIndex;
      } else {
        finalizeEntryCard(state, left, characters);
        zone.cards.splice(leftIndex, 1);
        index = leftIndex;
      }
      continue;
    }

    resolveEffectsForTiming(state, right, rightPower, "after_clash", false, characters);
    resolveEffectsForTiming(state, left, leftPower, "after_clash", false, characters);
    resolveUse(state, right, rightType === "attack", characters, { powerOverride: rightPower });
    resolveUse(state, left, leftType === "attack", characters, { powerOverride: leftPower });
    finalizeEntryCard(state, right, characters);
    finalizeEntryCard(state, left, characters);
    zone.cards.splice(leftIndex, 2);
    index = leftIndex - 1;
  }

  zone.lastPlayedBy = undefined;
  zone.passCount = 0;
};

const findCard = (characters: Character[], characterId: string, cardSlot: string) => {
  const character = getCharacterById(characters, characterId);
  if (!character) return null;
  const primary = character.cards.find((card) => card.slot === cardSlot);
  if (primary) return primary;
  return character.createdCards?.find((card) => card.slot === cardSlot) ?? null;
};

const resolveCardTransforms = (
  card: Card,
  state: MatchState,
  sourceId: MatchCharacterId,
  targetId: MatchCharacterId,
  characters: Character[]
) => {
  if (!card.transforms?.length) return card;
  const source = getMatchCharacter(state, sourceId);
  const target = getMatchCharacter(state, targetId);
  if (!source || !target) return card;
  const sourceCharacter = getCharacterById(characters, source.characterId);
  const targetCharacter = getCharacterById(characters, target.characterId);
  const snapshot = snapshotStatuses(state);
  let resolved: Card | null = null;

  for (const transform of card.transforms) {
    if (!isConditionMet(transform.condition, snapshot, sourceId, targetId, sourceCharacter, targetCharacter)) {
      continue;
    }
    const replacement = findCard(characters, source.characterId, transform.cardSlot);
    if (replacement) {
      resolved = replacement;
    }
  }

  return resolved ?? card;
};

const zonesAreEmpty = (state: MatchState) =>
  Object.values(state.zones).every((zone) => zone.cards.length === 0);

const nextOccupiedZone = (state: MatchState) => {
  const entries: ZoneName[] = ["fast", "normal", "slow"];
  return entries.find((zone) => state.zones[zone].cards.length > 0) ?? null;
};

export const createMatchState = (
  characters: Character[],
  players: { id: PlayerId; name: string; characterIds: string[] }[],
  options: MatchOptions = {}
): MatchState => {
  const [first, second] = players;
  if (!first || !second) {
    throw new Error("Two players required.");
  }
  if (first.characterIds.length !== defaultLineSize || second.characterIds.length !== defaultLineSize) {
    throw new Error("Each player must select three characters.");
  }
  if (
    new Set(first.characterIds).size !== first.characterIds.length ||
    new Set(second.characterIds).size !== second.characterIds.length
  ) {
    throw new Error("Duplicate characters are not allowed on the same team.");
  }

  const rosterIds = new Set(characters.map((entry) => entry.id));
  if (
    !first.characterIds.every((id) => rosterIds.has(id)) ||
    !second.characterIds.every((id) => rosterIds.has(id))
  ) {
    throw new Error("Character selection is invalid.");
  }

  const rng = createRngState(options.seed);
  const transcript = options.enableTranscript
    ? createMatchTranscript(rng.seed, players)
    : undefined;

  const state: MatchState = {
    turn: 1,
    phase: "movement",
    actionId: 0,
    initiativePlayerId: "p1",
    activePlayerId: "p1",
    activeZone: null,
    pausedZones: [],
    zones: {
      fast: { zone: "fast", cards: [], passCount: 0 },
      normal: { zone: "normal", cards: [], passCount: 0 },
      slow: { zone: "slow", cards: [], passCount: 0 },
    },
    lineSize: defaultLineSize,
    movementPassCount: 0,
    players: {
      p1: {
        id: "p1",
        name: first.name,
        energy: 5,
        ultimate: 0,
        deck: [],
        hand: [],
        discard: [],
        exhausted: [],
        defeated: [],
        characters: first.characterIds.map((characterId, index) => {
          const data = getCharacterById(characters, characterId);
          const displayName = data ? `${data.name} ${data.version}`.trim() : characterId;
          return {
            id: buildMatchCharacterId("p1", characterId),
            characterId,
            name: displayName,
            hp: 100,
            shield: 0,
            statuses: {},
            resourceMax: {},
            position: index,
            defeated: false,
            turnFlags: {
              bankaiHitUsed: false,
              kyuubiCloneUsed: false,
              gamabuntaUsed: false,
            },
          };
        }),
      },
      p2: {
        id: "p2",
        name: second.name,
        energy: 5,
        ultimate: 0,
        deck: [],
        hand: [],
        discard: [],
        exhausted: [],
        defeated: [],
        characters: second.characterIds.map((characterId, index) => {
          const data = getCharacterById(characters, characterId);
          const displayName = data ? `${data.name} ${data.version}`.trim() : characterId;
          return {
            id: buildMatchCharacterId("p2", characterId),
            characterId,
            name: displayName,
            hp: 100,
            shield: 0,
            statuses: {},
            resourceMax: {},
            position: index,
            defeated: false,
            turnFlags: {
              bankaiHitUsed: false,
              kyuubiCloneUsed: false,
              gamabuntaUsed: false,
            },
          };
        }),
      },
    },
    playLocks: { p1: [], p2: [] },
    log: [],
    pendingTurnStartGains: {},
    nextCardInstanceId: 1,
    rng,
    transcript,
  };

  buildStartingZones(state, "p1", characters);
  buildStartingZones(state, "p2", characters);
  state.players.p1.characters.forEach((member) => {
    const character = getCharacterById(characters, member.characterId);
    if (character) applyStartingStatuses(member, character);
  });
  state.players.p2.characters.forEach((member) => {
    const character = getCharacterById(characters, member.characterId);
    if (character) applyStartingStatuses(member, character);
  });

  addLog(state, `Turn 1 begins. ${state.players.p1.name} has initiative.`);
  applyTurnStartEffects(state, "p1", characters, { resolveStun: true });
  applyTurnStartEffects(state, "p2", characters, { resolveStun: false });
  addLog(state, "Movement Round begins.");
  return state;
};

export const applyAction = (
  state: MatchState,
  action: Action,
  characters: Character[]
): { state: MatchState; error?: string } => {
  if (state.phase === "finished") return { state };
  const next = cloneState(state);
  next.actionId = (next.actionId ?? 0) + 1;
  if (next.counterWindow && next.counterWindow.validForAction < next.actionId) {
    next.counterWindow = undefined;
  }

  const finalize = (error?: string) => {
    recordTranscriptEntry(next, action, error);
    return error ? { state: next, error } : { state: next };
  };

  if (action.type === "clear_log") {
    next.log = [];
    return finalize();
  }

  if (action.type !== "play_card" && action.playerId !== next.activePlayerId) {
    return finalize("Not your turn.");
  }

  if (action.type === "play_card") {
    if (next.phase === "movement") {
      return finalize("Movement Round in progress.");
    }
    const team = next.players[action.playerId];
    let card: Card | null = null;
    let cardInstance: CardInstance | null = null;
    let cardInstanceIndex = -1;
    let sourceMember: MatchCharacter | null = null;

    if (action.cardInstanceId) {
      cardInstanceIndex = team.hand.findIndex(
        (instance) => instance.id === action.cardInstanceId
      );
      if (cardInstanceIndex === -1) {
        return finalize("Card not in hand.");
      }
      cardInstance = team.hand[cardInstanceIndex] ?? null;
      if (!cardInstance) return finalize("Card not found.");
      sourceMember = getMatchCharacter(next, cardInstance.ownerId);
      if (!sourceMember) return finalize("Card source not found.");
      card = findCard(characters, cardInstance.characterId, cardInstance.cardSlot);
    } else if (action.cardSlot) {
      if (action.sourceId) {
        sourceMember = getMatchCharacter(next, action.sourceId);
        const ownerTeam = sourceMember ? getTeamForCharacter(next, sourceMember.id) : null;
        if (!sourceMember || ownerTeam?.id !== action.playerId) {
          return finalize("Card source not found.");
        }
      } else {
        const matches = team.characters.filter((member) =>
          Boolean(findCard(characters, member.characterId, action.cardSlot!))
        );
        if (matches.length > 1) {
          return finalize("Card slot is ambiguous. Specify the source character.");
        }
        sourceMember = matches[0] ?? null;
      }
      if (!sourceMember) return finalize("Card source not found.");
      card = findCard(characters, sourceMember.characterId, action.cardSlot);
    }

    if (!card || !sourceMember) return finalize("Card not found.");
    if (sourceMember.defeated) {
      return finalize("That character is defeated.");
    }
    if (hasCombatRoundLock(next, action.playerId)) {
      return finalize("Cannot play cards this combat round.");
    }
    if (!action.cardInstanceId && !isUltimateCard(card)) {
      return finalize("Card must be played from hand.");
    }

    const initialTargetId = action.targetId ?? pickTargetId(card, sourceMember.id, next, characters);
    const resolvedCard = resolveCardTransforms(
      card,
      next,
      sourceMember.id,
      initialTargetId,
      characters
    );

    const counterWindow =
      next.counterWindow && next.counterWindow.validForAction === next.actionId
        ? next.counterWindow
        : null;
    const isOutOfTurn = action.playerId !== next.activePlayerId;
    const counterAllowed = Boolean(isOutOfTurn && counterWindow && counterWindow.by === action.playerId);
    const outOfTurnAllowed =
      isOutOfTurn &&
      (counterAllowed || canPlayAfterUse(next, resolvedCard, sourceMember.id, characters));
    if (action.playerId !== next.activePlayerId && !outOfTurnAllowed) {
      return finalize("Not your turn.");
    }

    const sourceCharacter = getCharacterById(characters, sourceMember.characterId);
    if (!sourceCharacter) {
      return finalize("Character not found.");
    }

    if (getActiveStatusState(sourceMember, "Deflate", sourceCharacter)) {
      return finalize("This character is Deflated and cannot play cards.");
    }

    const typeSet = new Set(resolvedCard.types.map(normalizeTag));
    const actionType = getActionType(resolvedCard.types);
    if (getActiveStatusState(sourceMember, "Disarm", sourceCharacter) && typeSet.has("physical")) {
      return finalize("Disarm prevents playing Physical cards.");
    }
    if (getActiveStatusState(sourceMember, "Silence", sourceCharacter) && typeSet.has("magical")) {
      return finalize("Silence prevents playing Magical cards.");
    }
    if (
      getActiveStatusState(sourceMember, "Seal", sourceCharacter) &&
      (actionType === "special" || typeSet.has("special"))
    ) {
      return finalize("Seal prevents playing Special cards.");
    }

    const choiceEffects =
      resolvedCard.effects?.filter((effect) => effect.type === "choose") ?? [];
    const textChoices = choiceEffects.length ? [] : getTextChoiceOptions(resolvedCard.effect);
    if (choiceEffects.length) {
      const choiceIndex = action.choiceIndex;
      if (choiceIndex === undefined || !Number.isInteger(choiceIndex)) {
        return finalize("Choice required.");
      }
      const invalidChoice = choiceEffects.some(
        (effect) => choiceIndex < 0 || choiceIndex >= effect.options.length
      );
      if (invalidChoice) {
        return finalize("Invalid choice.");
      }
    } else if (textChoices.length) {
      const choiceIndex = action.choiceIndex;
      if (choiceIndex === undefined || !Number.isInteger(choiceIndex)) {
        return finalize("Choice required.");
      }
      if (choiceIndex < 0 || choiceIndex >= textChoices.length) {
        return finalize("Invalid choice.");
      }
    }

    const xRange = getXRangeFromText(resolvedCard.effect);
    const fixedX = getFixedXFromText(resolvedCard.effect);
    if (xRange) {
      if (action.xValue === undefined || !Number.isInteger(action.xValue)) {
        return finalize("X value required.");
      }
      if (action.xValue < xRange.min || action.xValue > xRange.max) {
        return finalize("X value out of range.");
      }
    } else if (action.xValue !== undefined && action.xValue < 0) {
      return finalize("X value out of range.");
    }

    let xValue = action.xValue ?? 0;
    if (fixedX !== null) {
      xValue = fixedX;
    } else if (xRange) {
      xValue = action.xValue ?? 0;
    }

    const legalTargets = getLegalTargets(resolvedCard, sourceMember.id, next, characters);
    if (!legalTargets.length) {
      return finalize("No legal targets.");
    }
    const forcedCounterTarget = counterAllowed ? counterWindow?.targetId : null;
    if (forcedCounterTarget && !legalTargets.includes(forcedCounterTarget)) {
      return finalize("Counter must target the attacker.");
    }
    const targetId = forcedCounterTarget
      ?? (action.targetId && legalTargets.includes(action.targetId)
        ? action.targetId
        : legalTargets.includes(initialTargetId)
          ? initialTargetId
          : legalTargets[0]);
    if (!legalTargets.includes(targetId)) {
      return finalize("Illegal target.");
    }

    const restrictionError = getUseRestrictionError(
      resolvedCard,
      next,
      sourceMember.id,
      targetId,
      characters
    );
    if (restrictionError) {
      return finalize(restrictionError);
    }

    const cost = parseCost(resolvedCard.cost);
    if (cost.variable && action.xValue === undefined && fixedX === null) {
      return finalize("X value required.");
    }
    if (cost.variable && action.xValue !== undefined && !Number.isInteger(action.xValue)) {
      return finalize("X value must be an integer.");
    }
    const isAfterUse =
      next.afterUseWindow && next.afterUseWindow.validForAction === next.actionId;
    const isFollowUpPlay =
      Boolean(isAfterUse) && next.afterUseWindow?.lastUsedCharacterId === sourceMember.id;
    const followUpAdjustment = isFollowUpPlay
      ? getFollowUpCostAdjustment(resolvedCard.effect)
      : 0;
    const adjustedTotals = getAdjustedCostTotals(
      sourceMember,
      sourceCharacter,
      cost,
      xValue,
      cardInstance,
      followUpAdjustment
    );
    if (team.energy < adjustedTotals.energy || team.ultimate < adjustedTotals.ultimate) {
      return finalize("Insufficient resources.");
    }

    const effectiveSpeed = getEffectiveSpeed(resolvedCard.speed, sourceMember, sourceCharacter);
    const legalZones = getLegalZonesForSpeed(effectiveSpeed);
    if (!legalZones.includes(action.zone)) {
      return finalize("Illegal zone for card speed.");
    }

    if (next.activeZone) {
      if (action.zone !== next.activeZone && !isZoneFaster(action.zone, next.activeZone)) {
        return finalize("Cannot play in a slower zone than the active zone.");
      }
    }

    if (cardInstance && cardInstanceIndex >= 0) {
      cardInstance = team.hand.splice(cardInstanceIndex, 1)[0] ?? null;
    }

    team.energy -= adjustedTotals.energy;
    team.ultimate -= adjustedTotals.ultimate;
    if (adjustedTotals.energy > 0) {
      team.ultimate += adjustedTotals.energy;
    }

    if (!next.activeZone) {
      next.activeZone = action.zone;
      addLog(next, `Combat Round begins. Active Zone: ${zoneLabel(action.zone)}.`);
    } else if (action.zone !== next.activeZone && isZoneFaster(action.zone, next.activeZone)) {
      next.pausedZones.push(next.activeZone);
      next.activeZone = action.zone;
      addLog(next, `${zoneLabel(action.zone)} Zone interrupts and becomes Active.`);
    }

    const zone = next.activeZone ? next.zones[next.activeZone] : next.zones[action.zone];
    zone.lastPlayedBy = action.playerId;
    zone.passCount = 0;

    const entry: StackEntry = {
      id: `${action.playerId}-${resolvedCard.slot}-${zone.cards.length}`,
      cardSlot: resolvedCard.slot,
      cardName: resolvedCard.name,
      powerText: resolvedCard.power,
      effectText: resolvedCard.effect,
      effects: resolvedCard.effects,
      types: resolvedCard.types,
      speed: effectiveSpeed,
      playedBy: action.playerId,
      sourceId: sourceMember.id,
      targetId,
      targetText: resolvedCard.target,
      xValue,
      choiceIndex: action.choiceIndex,
      redirectTargetId: action.redirectTargetId,
      scryDiscardIds: action.scryDiscardIds,
      scryOrderIds: action.scryOrderIds,
      seekTakeIds: action.seekTakeIds,
      searchPickId: action.searchPickId,
      pushDirection: action.pushDirection,
      cardInstanceId: cardInstance?.id,
      cardInstance: cardInstance ?? undefined,
    };
    zone.cards.push(entry);

    if (resolvedCard.name !== card.name) {
      addLog(next, `${card.name} becomes ${resolvedCard.name}.`);
    }
    addLog(next, `${sourceMember.name} plays ${resolvedCard.name} in the ${zoneLabel(action.zone)} Zone.`);
    applyCardPlayedStatusRules(next, entry, adjustedTotals.energy, characters);
    if (next.phase === "finished") {
      return finalize();
    }
    const playPower = getModifiedEntryPower(
      next,
      entry,
      getActionType(entry.types),
      characters
    );
    resolveEffectsForTiming(next, entry, playPower, "on_play", false, characters);
    next.activePlayerId = getOpponentId(action.playerId);
    return finalize();
  }

  if (action.type === "move_swap") {
    if (next.phase !== "movement") {
      return finalize("Movement Round is not active.");
    }
    const team = next.players[action.playerId];
    if (team.energy < 1) {
      return finalize("Insufficient energy for a movement swap.");
    }
    const first = team.characters.find((member) => member.id === action.firstId);
    const second = team.characters.find((member) => member.id === action.secondId);
    if (!first || !second) {
      return finalize("Movement swap targets must be allied characters.");
    }
    if (!areAdjacent(first.position, second.position)) {
      return finalize("Movement swaps require adjacent allies.");
    }

    team.energy -= 1;
    addLog(next, `${team.name} spends 1 Energy to attempt a swap.`);
    const swapped = trySwapAllies(next, action.playerId, first.id, second.id, characters);
    if (swapped) {
      addLog(next, `${first.name} swaps positions with ${second.name}.`);
    }

    next.movementPassCount = 0;
    next.activePlayerId = getOpponentId(action.playerId);
    return finalize();
  }

  if (action.type === "pass") {
    if (next.phase === "movement") {
      const player = next.players[action.playerId];
      next.movementPassCount += 1;
      addLog(next, `${player.name} passes movement priority.`);
      if (next.movementPassCount >= 2) {
        next.phase = "combat";
        next.movementPassCount = 0;
        next.activePlayerId = next.initiativePlayerId;
        addLog(next, "Movement Round ends.");
      } else {
        next.activePlayerId = getOpponentId(action.playerId);
      }
      return finalize();
    }

    if (!next.activeZone) {
      return finalize("No active zone to pass.");
    }

    const zone = next.zones[next.activeZone];
    const player = next.players[action.playerId];
    zone.passCount += 1;
    addLog(next, `${player.name} passes.`);

    if (zone.passCount >= 2 && zone.lastPlayedBy === action.playerId) {
      const resolvedBy = action.playerId;
      resolveZone(next, next.activeZone, characters);

      const nextZone = next.pausedZones.pop() ?? nextOccupiedZone(next);
      if (nextZone && next.zones[nextZone].cards.length > 0) {
        next.activeZone = nextZone;
        addLog(next, `${zoneLabel(nextZone)} Zone becomes Active.`);
        next.activePlayerId = getOpponentId(resolvedBy);
      } else {
        next.activeZone = null;
        next.activePlayerId = next.initiativePlayerId;
        addLog(next, "Combat Round ends.");
        clearCombatRoundLocks(next);
      }
    } else {
      next.activePlayerId = getOpponentId(action.playerId);
    }

    return finalize();
  }

  if (action.type === "end_turn") {
    if (next.phase === "movement") {
      return finalize("Cannot end the turn during the Movement Round.");
    }
    if (action.playerId !== next.initiativePlayerId) {
      return finalize("Only the initiative player can end the turn.");
    }
    if (next.activeZone || !zonesAreEmpty(next)) {
      return finalize("Cannot end the turn during combat.");
    }

    applyTurnEndEffects(next, "p1", characters);
    applyTurnEndEffects(next, "p2", characters);
    if (next.phase === "finished") {
      return finalize();
    }
    advanceTurn(next, characters);
    return finalize();
  }

  return finalize();
};

export const replayTranscript = (
  characters: Character[],
  transcript: MatchTranscript
): { state: MatchState; error?: string; actionIndex?: number } => {
  let state = createMatchState(characters, transcript.players, {
    seed: transcript.seed,
  });

  for (let index = 0; index < transcript.actions.length; index += 1) {
    const entry = transcript.actions[index];
    const result = applyAction(state, entry.action, characters);
    const expectedError = Boolean(entry.error);
    const actualError = Boolean(result.error);
    if (expectedError !== actualError) {
      return {
        state: result.state,
        error: `Transcript mismatch at action ${index + 1}: expected ${
          entry.error ? `error (${entry.error})` : "no error"
        }, got ${result.error ? `error (${result.error})` : "no error"}.`,
        actionIndex: index,
      };
    }
    state = result.state;
  }

  return { state };
};
