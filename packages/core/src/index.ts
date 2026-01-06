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
  StatusEffectDefinition,
  StatusValueStat,
} from "@ua/data";

export type PlayerId = "p1" | "p2";
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
  costAdjustment: number;
};

export type MatchPlayer = {
  id: PlayerId;
  name: string;
  characterId: string;
  hp: number;
  shield: number;
  energy: number;
  ultimate: number;
  statuses: Record<string, StatusState>;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  exhausted: CardInstance[];
  resourceMax: Record<string, number>;
};

export type StackEntry = {
  id: string;
  cardSlot: string;
  cardName: string;
  powerText: string;
  effectText: string[];
  effects?: Effect[];
  types: string[];
  speed: string;
  playedBy: PlayerId;
  targetId: PlayerId;
  targetText?: string;
  xValue: number;
  choiceIndex?: number;
  rolledPower?: number;
  mitigationText?: string[];
  cancelledBeforeUse?: boolean;
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
  phase: "combat" | "finished";
  actionId: number;
  activePlayerId: PlayerId;
  initiativePlayerId: PlayerId;
  activeZone: ZoneName | null;
  pausedZones: ZoneName[];
  zones: Record<ZoneName, ZoneState>;
  lineSize: number;
  positions: Record<PlayerId, number>;
  players: Record<PlayerId, MatchPlayer>;
  log: string[];
  winnerId?: PlayerId;
  pendingTurnStartGains: Record<PlayerId, PendingStatusGain[]>;
  turnFlags: Record<PlayerId, TurnFlags>;
  nextCardInstanceId: number;
  rng: RngState;
  transcript?: MatchTranscript;
  afterUseWindow?: {
    lastUsedBy: PlayerId;
    lastUsedCharacterId: string;
    validForAction: number;
  };
};

type StatusSnapshot = Record<PlayerId, Record<string, StatusState>>;

export type Action =
  | {
      type: "play_card";
      playerId: PlayerId;
      cardSlot?: string;
      cardInstanceId?: string;
      zone: ZoneName;
      xValue?: number;
      choiceIndex?: number;
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
  version: 1;
  seed: number;
  players: { id: PlayerId; name: string; characterId: string }[];
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
  players: { id: PlayerId; name: string; characterId: string }[]
): MatchTranscript => ({
  version: 1,
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

const baseHandSize = 5;
const defaultLineSize = 3;
const defaultPosition = Math.floor(defaultLineSize / 2);

const createCardInstance = (state: MatchState, cardSlot: string): CardInstance => {
  const id = `ci-${state.nextCardInstanceId}`;
  state.nextCardInstanceId += 1;
  return { id, cardSlot, costAdjustment: 0 };
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

const snapshotStatuses = (state: MatchState): StatusSnapshot => ({
  p1: cloneStatusMap(state.players.p1.statuses),
  p2: cloneStatusMap(state.players.p2.statuses),
});

const getSnapshotStatusState = (
  snapshot: StatusSnapshot,
  playerId: PlayerId,
  status: string
) => snapshot[playerId]?.[status] ?? createEmptyStatusState();

const getStatusState = (player: MatchPlayer, status: string) => {
  if (!player.statuses[status]) {
    player.statuses[status] = createEmptyStatusState();
  }
  return player.statuses[status];
};

const parseStatusLineValue = (line: string, label: string) => {
  const match = line.match(new RegExp(`${label}\\s*:?\\s*(?:Max\\s*)?(\\d+)`, "i"));
  return match ? Number(match[1]) : null;
};

const parseUniqueStatusDefinition = (status: Character["statusEffects"][number]) => {
  let potencyMax: number | undefined;
  let countMax: number | undefined;
  let stackMax: number | undefined;
  let valueMax: number | undefined;
  let baseValue: number | undefined;

  status.lines.forEach((line) => {
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
  player: MatchPlayer,
  status: string,
  character?: Character | null
) => {
  const state = player.statuses[status];
  if (!state) return null;
  const definition = getStatusDefinition(status, character);
  return isStatusActive(state, definition) ? state : null;
};

const getStatusStatValue = (
  player: MatchPlayer,
  status: string,
  stat: StatusValueStat,
  character?: Character | null
) => {
  const state = getActiveStatusState(player, status, character);
  if (!state) return 0;
  return state[stat];
};

const applyStatusStatDelta = (
  target: MatchPlayer,
  status: string,
  delta: number,
  stat: StatusValueStat,
  targetCharacter?: Character | null
) => {
  if (!status || delta === 0) return;
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

const expireStatus = (target: MatchPlayer, status: string) => {
  const state = target.statuses[status];
  if (!state) return;
  state.potency = 0;
  state.count = 0;
  state.stack = 0;
  state.value = 0;
};

const scheduleTurnStartGain = (
  state: MatchState,
  playerId: PlayerId,
  gain: PendingStatusGain
) => {
  state.pendingTurnStartGains[playerId].push(gain);
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

const canMovePlayer = (state: MatchState, playerId: PlayerId, characters: Character[]) => {
  const player = state.players[playerId];
  const character = getCharacterById(characters, player.characterId);
  return !getActiveStatusState(player, "Root", character);
};

const tryMovePlayer = (
  state: MatchState,
  playerId: PlayerId,
  nextPosition: number,
  characters: Character[]
) => {
  if (!isValidPosition(nextPosition, state.lineSize)) return false;
  if (!canMovePlayer(state, playerId, characters)) {
    addLog(state, `${state.players[playerId].name} is rooted and cannot move.`);
    return false;
  }
  state.positions[playerId] = nextPosition;
  return true;
};

const trySwapPlayers = (
  state: MatchState,
  firstId: PlayerId,
  secondId: PlayerId,
  characters: Character[]
) => {
  if (!canMovePlayer(state, firstId, characters) || !canMovePlayer(state, secondId, characters)) {
    addLog(state, "A rooted character cannot be moved or swapped.");
    return false;
  }
  const firstPos = state.positions[firstId];
  const secondPos = state.positions[secondId];
  if (!isValidPosition(firstPos, state.lineSize) || !isValidPosition(secondPos, state.lineSize)) {
    return false;
  }
  state.positions[firstId] = secondPos;
  state.positions[secondId] = firstPos;
  return true;
};

const applyStatusDelta = (
  target: MatchPlayer,
  status: string,
  amount: number,
  stat: StatusValueStat | undefined,
  targetCharacter?: Character | null
) => {
  if (!status || amount === 0) return;
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
  target: MatchPlayer,
  status: string,
  amount: number,
  stat: StatusValueStat | undefined,
  targetCharacter?: Character | null
) => {
  if (!status || Number.isNaN(amount)) return null;
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
  target: MatchPlayer,
  status: string,
  amount: number,
  stat: StatusValueStat | undefined,
  options: { minValue?: number; maxAmount?: number } = {},
  targetCharacter?: Character | null
) => {
  if (!status || Number.isNaN(amount)) return null;
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
  playerId: PlayerId,
  status: string,
  amount: number,
  character?: Character | null,
  options?: { allowPartial?: boolean; label?: string }
) => {
  if (!status || amount <= 0) return 0;
  const player = state.players[playerId];
  const statusState = player.statuses[status];
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
    `${player.name} spends ${spendAmount} ${options?.label ?? status}.`
  );
  return spendAmount;
};

const handleStatusOnGain = (
  target: MatchPlayer,
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
  targetId: PlayerId,
  status: string,
  targetCharacter?: Character | null
) => {
  const target = state.players[targetId];
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

const pruneStatuses = (player: MatchPlayer, character?: Character | null) => {
  Object.entries(player.statuses).forEach(([status, state]) => {
    if (persistentStatuses.has(status)) return;
    const definition = getStatusDefinition(status, character);
    if (!isStatusActive(state, definition)) {
      delete player.statuses[status];
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

const getEnergyCostAdjustment = (player: MatchPlayer, character?: Character | null) => {
  const focus = getStatusStatValue(player, "Focus", "potency", character);
  const strain = getStatusStatValue(player, "Strain", "potency", character);
  const bloodFocus = getStatusStatValue(player, "Blood Focus", "value", character);
  return strain - focus - bloodFocus;
};

const getSpeedShift = (player: MatchPlayer, character?: Character | null) => {
  const haste = Math.min(2, getStatusStatValue(player, "Haste", "potency", character));
  const slow = Math.min(2, getStatusStatValue(player, "Slow", "potency", character));
  return Math.max(-2, Math.min(2, haste - slow));
};

const getEffectiveSpeed = (
  speedText: string,
  player: MatchPlayer,
  character?: Character | null
) => {
  const shift = getSpeedShift(player, character);
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
  player: MatchPlayer,
  character: Character | null,
  actionType: ActionType
) => {
  let modifier = 0;
  if (actionType === "attack") {
    modifier += 0.1 * getStatusStatValue(player, "Strength", "potency", character);
    modifier -= 0.1 * getStatusStatValue(player, "Weak", "potency", character);
  } else if (actionType === "defense") {
    modifier += 0.1 * getStatusStatValue(player, "Dexterity", "potency", character);
    modifier -= 0.1 * getStatusStatValue(player, "Frail", "potency", character);
  }

  if (actionType !== "special") {
    modifier += 0.05 * getStatusStatValue(player, "Zenkai", "value", character);
  }

  return Math.max(0, 1 + modifier);
};

const applyPowerModifiers = (
  power: number,
  player: MatchPlayer,
  character: Character | null,
  actionType: ActionType
) => Math.max(0, Math.floor(power * getPowerMultiplier(player, character, actionType)));

const getDamageTakenMultiplier = (player: MatchPlayer, character: Character | null) => {
  const vulnerable = getStatusStatValue(player, "Vulnerable", "potency", character);
  const fortified = getStatusStatValue(player, "Fortified", "potency", character);
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
  player: MatchPlayer,
  character: Character | null,
  cost: CostBreakdown,
  xValue: number,
  cardInstance?: CardInstance | null,
  followUpAdjustment = 0
) => {
  const totals = computeCost(cost, xValue);
  const energyAdjustment = getEnergyCostAdjustment(player, character);
  const instanceAdjustment = cardInstance?.costAdjustment ?? 0;
  const energy = Math.max(0, totals.energy + energyAdjustment + instanceAdjustment + followUpAdjustment);
  return { energy, ultimate: totals.ultimate };
};

export const canAfford = (player: MatchPlayer, cost: CostBreakdown, xValue = 0) => {
  const totals = computeCost(cost, xValue);
  return player.energy >= totals.energy && player.ultimate >= totals.ultimate;
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

const pickTargetId = (
  card: Card,
  sourceId: PlayerId,
  state: MatchState,
  characters: Character[]
) => {
  const target = card.target.toLowerCase();
  if (target.includes("enemy")) {
    const opponentId = getOpponentId(sourceId);
    if (canTauntOverrideTarget(card)) {
      const opponent = state.players[opponentId];
      const opponentCharacter = getCharacterById(characters, opponent.characterId);
      if (getActiveStatusState(opponent, "Taunt", opponentCharacter)) {
        return opponentId;
      }
    }
    return opponentId;
  }
  if (target.includes("self") || target.includes("ally")) return sourceId;
  return getOpponentId(sourceId);
};

const getCharacterById = (characters: Character[], characterId: string) =>
  characters.find((item) => item.id === characterId) ?? null;

const drawCards = (state: MatchState, playerId: PlayerId, count: number) => {
  const player = state.players[playerId];
  let remaining = count;
  while (remaining > 0 && player.deck.length > 0) {
    const nextCard = player.deck.pop();
    if (!nextCard) break;
    player.hand.push(nextCard);
    remaining -= 1;
  }
};

const drawToHandSize = (
  state: MatchState,
  playerId: PlayerId,
  targetSize: number
) => {
  const player = state.players[playerId];
  const needed = Math.max(0, targetSize - player.hand.length);
  if (needed > 0) {
    drawCards(state, playerId, needed);
  }
};

const applyPrepareAdjustments = (
  state: MatchState,
  playerId: PlayerId,
  characters: Character[]
) => {
  const player = state.players[playerId];
  const character = getCharacterById(characters, player.characterId);
  if (!character) return;
  player.hand.forEach((instance) => {
    const card = findCard(characters, player.characterId, instance.cardSlot);
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
  const player = state.players[playerId];
  const remaining: CardInstance[] = [];
  player.hand.forEach((instance) => {
    const card = findCard(characters, player.characterId, instance.cardSlot);
    if (!card) return;
    const lifecycle = getLifecycleKeywords(card.effect, card.effects);
    if (lifecycle.ethereal) {
      player.exhausted.push(instance);
      addLog(state, `${player.name} exhausts ${card.name} (Ethereal).`);
      return;
    }
    if (lifecycle.retain) {
      remaining.push(instance);
      return;
    }
    player.discard.push(instance);
  });
  player.hand = remaining;
};

const buildStartingZones = (
  state: MatchState,
  playerId: PlayerId,
  characters: Character[]
) => {
  const player = state.players[playerId];
  const character = getCharacterById(characters, player.characterId);
  if (!character) return;
  const transformTargets = new Set(
    character.cards.flatMap((card) =>
      card.transforms?.map((transform) => transform.cardSlot) ?? []
    )
  );
  player.deck = [];
  player.hand = [];
  player.discard = [];
  player.exhausted = [];
  player.resourceMax = {};

  character.cards.forEach((card) => {
    if (isUltimateCard(card)) return;
    if (transformTargets.has(card.slot)) return;
    const instance = createCardInstance(state, card.slot);
    const lifecycle = getLifecycleKeywords(card.effect, card.effects);
    if (lifecycle.innate) {
      player.hand.push(instance);
    } else {
      player.deck.push(instance);
    }
  });

  shuffle(player.deck, state.rng);
};

const applyStartingStatuses = (
  state: MatchState,
  playerId: PlayerId,
  character: Character
) => {
  const player = state.players[playerId];
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
          applyStatusDelta(player, statusName, amount, undefined, character);
        }
        return;
      }
      const valueMatch = part.match(/^(\d+)\s+(.+)$/);
      if (valueMatch) {
        const amount = Number(valueMatch[1]);
        const statusName = valueMatch[2].trim().replace(/\.$/, "");
        if (amount > 0) {
          applyStatusDelta(player, statusName, amount, undefined, character);
          player.resourceMax[statusName] = amount;
        }
        return;
      }
      const statusName = part.replace(/\.$/, "");
      if (!statusName) return;
      applyStatusDelta(player, statusName, 1, undefined, character);
      player.resourceMax[statusName] = Math.max(player.resourceMax[statusName] ?? 0, 1);
    });
  });
};

const createCardsInHand = (
  state: MatchState,
  playerId: PlayerId,
  cardName: string,
  count: number,
  characters: Character[]
) => {
  const player = state.players[playerId];
  const character = getCharacterById(characters, player.characterId);
  if (!character?.createdCards?.length) return;
  const match = character.createdCards.find(
    (card) => card.name.toLowerCase() === cardName.toLowerCase()
  );
  if (!match) return;
  for (let i = 0; i < count; i += 1) {
    const instance = createCardInstance(state, match.slot);
    player.hand.push(instance);
  }
  addLog(state, `${player.name} creates ${count} ${match.name}.`);
};

const getEquippedWeaponStatus = (player: MatchPlayer, character: Character | null) => {
  const equipped = ["Equip: Handgun", "Equip: Riot Gun", "Equip: Chicago Typewriter"].find(
    (status) => getActiveStatusState(player, status, character)
  );
  return equipped ?? null;
};

const reloadEquippedWeapon = (
  state: MatchState,
  playerId: PlayerId,
  characters: Character[]
) => {
  const player = state.players[playerId];
  const character = getCharacterById(characters, player.characterId);
  const equipped = getEquippedWeaponStatus(player, character);
  if (!equipped) return;
  const ammoMap: Record<string, string | null> = {
    "Equip: Handgun": "Handgun Ammo",
    "Equip: Riot Gun": "Shotgun Ammo",
    "Equip: Chicago Typewriter": null,
  };
  const ammoStatus = ammoMap[equipped];
  if (!ammoStatus) return;
  const max = player.resourceMax[ammoStatus];
  if (!max) return;
  const current = getStatusStatValue(player, ammoStatus, "value", character);
  const delta = max - current;
  if (delta <= 0) return;
  applyStatusDelta(player, ammoStatus, delta, "value", character);
  addLog(state, `${player.name} reloads ${equipped.replace("Equip: ", "")}.`);
};

const switchEquipment = (
  state: MatchState,
  playerId: PlayerId,
  equipStatus: string,
  characters: Character[]
) => {
  const player = state.players[playerId];
  const character = getCharacterById(characters, player.characterId);
  if (!character) return;
  const active = getActiveStatusState(player, equipStatus, character);
  if (active) {
    reloadEquippedWeapon(state, playerId, characters);
    return;
  }
  ["Equip: Handgun", "Equip: Riot Gun", "Equip: Chicago Typewriter"].forEach((status) => {
    if (status !== equipStatus) {
      expireStatus(player, status);
    }
  });
  applyStatusDelta(player, equipStatus, 1, undefined, character);
  addLog(state, `${player.name} equips ${equipStatus.replace("Equip: ", "")}.`);
};

const applyStagnate = (
  state: MatchState,
  entry: StackEntry,
  amount: number,
  characters: Character[],
  targetId: PlayerId
) => {
  if (amount <= 0) return;
  const player = state.players[targetId];
  for (let i = 0; i < amount; i += 1) {
    if (!player.hand.length) break;
    const index = nextInt(state.rng, 0, player.hand.length - 1);
    const instance = player.hand[index];
    if (!instance) continue;
    instance.costAdjustment += 1;
    const card = findCard(characters, player.characterId, instance.cardSlot);
    if (card) {
      addLog(state, `${player.name}'s ${card.name} costs +1 Energy (Stagnate).`);
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

const parseCreateFromLine = (line: string) => {
  const normalized = normalizeText(line);
  const match = normalized.match(
    /Create\s+(\d+)\s+(.+?)\s+in\s+(?:this character's\s+)?hand/i
  );
  if (!match) return null;
  const count = Number(match[1]);
  const cardName = match[2].trim().replace(/\.$/, "");
  if (!cardName || Number.isNaN(count) || count <= 0) return null;
  return { count, cardName };
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

type SpendContext = {
  skipAll: boolean;
  skipDamage: boolean;
  ammoSpent: number;
  spentResources: Record<string, number>;
};

const getAvailableSpend = (
  player: MatchPlayer,
  status: string,
  amount: number,
  character: Character | null,
  allowPartial: boolean
) => {
  const state = player.statuses[status];
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
    reuse: false,
    followUp: false,
    assistAttack: false,
  };
  lines.forEach((line) => {
    const normalized = line.trim().replace(/\.$/, "").toLowerCase();
    if (normalized === "evade") flags.evade = true;
    if (normalized === "reuse") flags.reuse = true;
    if (normalized === "follow-up") flags.followUp = true;
    if (normalized === "assist attack") flags.assistAttack = true;
  });
  return flags;
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
  player: MatchPlayer,
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

  const statusEntries = Object.entries(player.statuses);
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
  playerId: PlayerId,
  card: Card,
  characters?: Character[]
) => {
  if (!state.afterUseWindow || state.afterUseWindow.validForAction !== state.actionId) {
    return false;
  }
  const flags = getKeywordFlags(card.effect);
  let followUpAllowed = flags.followUp;
  if (!followUpAllowed && characters) {
    const player = state.players[playerId];
    const character = getCharacterById(characters, player.characterId);
    const timeStop = getActiveStatusState(player, "The World: Time Stop", character);
    if (timeStop && getActionType(card.types) === "attack") {
      followUpAllowed = true;
    }
  }
  if (followUpAllowed && state.afterUseWindow.lastUsedBy === playerId) return true;
  if (flags.assistAttack && state.afterUseWindow.lastUsedBy !== playerId) return true;
  return false;
};

const applyStatusDamage = (
  state: MatchState,
  targetId: PlayerId,
  amount: number,
  label: string,
  character: Character | null
) => {
  if (amount <= 0) return;
  const target = state.players[targetId];
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
    state.winnerId = getOpponentId(targetId);
    state.phase = "finished";
    addLog(state, `${state.players[state.winnerId].name} wins the match.`);
  }
};

const applyHealing = (
  state: MatchState,
  targetId: PlayerId,
  amount: number,
  character: Character | null,
  label?: string
) => {
  if (amount <= 0) return 0;
  const target = state.players[targetId];
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
  target: MatchPlayer,
  damage: number,
  sourceTypes: string[],
  targetCharacter: Character | null,
  mitigationText?: string[]
) => {
  if (damage <= 0) return 0;
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

  return absorbed + barrierAbsorbed + remaining;
};

const addLog = (state: MatchState, entry: string) => {
  state.log.push(entry);
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
  const player = state.players[entry.playedBy];
  const character = getCharacterById(characters, player.characterId);

  const bleed = getActiveStatusState(player, "Bleed", character);
  if (bleed) {
    applyStatusDamage(state, entry.playedBy, bleed.potency, "Bleed", character);
    applyStatusDelta(player, "Bleed", energySpent, undefined, character);
  }

  const burn = getActiveStatusState(player, "Burn", character);
  if (burn) {
    applyStatusDamage(state, entry.playedBy, burn.potency, "Burn", character);
    applyStatusStatDelta(player, "Burn", -energySpent, "count", character);
  }

  const poison = getActiveStatusState(player, "Poison", character);
  if (poison) {
    applyStatusDelta(player, "Poison", energySpent, undefined, character);
  }

  const kyuubi = getActiveStatusState(player, "Kyuubi Chakra", character);
  const turnFlags = state.turnFlags[entry.playedBy];
  if (kyuubi && !turnFlags.kyuubiCloneUsed && entry.cardName === "Shadow Clone Jutsu") {
    applyStatusDelta(player, "Shadow Clones", kyuubi.potency, undefined, character);
    turnFlags.kyuubiCloneUsed = true;
  }

  const gamabunta = getActiveStatusState(player, "Summoned: Gamabunta", character);
  if (
    gamabunta &&
    !turnFlags.gamabuntaUsed &&
    getActionType(entry.types) === "attack" &&
    energySpent >= 2 &&
    entry.targetId === getOpponentId(entry.playedBy)
  ) {
    turnFlags.gamabuntaUsed = true;
    createCardsInHand(state, entry.playedBy, "Gamabunta: Toad Smash", 1, characters);
  }

  pruneStatuses(player, character);
};

const applyTurnStartEffects = (
  state: MatchState,
  playerId: PlayerId,
  characters: Character[],
  options?: { resolveStun?: boolean }
) => {
  const player = state.players[playerId];
  const character = getCharacterById(characters, player.characterId);
  resetTurnFlags(state.turnFlags[playerId]);

  const pending = state.pendingTurnStartGains[playerId];
  if (pending.length) {
    pending.forEach((gain) => {
      applyStatusDelta(player, gain.status, gain.amount, gain.stat, character);
    });
    pending.length = 0;
  }

  const gainStatus = (status: string, amount: number, stat?: StatusValueStat) => {
    applyStatusDelta(player, status, amount, stat, character);
  };

  if (getActiveStatusState(player, "Equip: Handgun", character)) {
    gainStatus("Dexterity", 1);
  }
  if (getActiveStatusState(player, "Equip: Riot Gun", character)) {
    gainStatus("Strength", 1);
  }
  if (getActiveStatusState(player, "Equip: Chicago Typewriter", character)) {
    gainStatus("Haste", 1);
  }

  const kaioken = getActiveStatusState(player, "Kaioken", character);
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

  const kyuubi = getActiveStatusState(player, "Kyuubi Chakra", character);
  if (kyuubi) {
    const boost = kyuubi.potency;
    if (boost > 0) {
      gainStatus("Strength", boost);
      gainStatus("Haste", boost);
    }
  }

  if (getActiveStatusState(player, "Bankai: Tensa Zangetsu", character)) {
    gainStatus("Haste", 2);
    gainStatus("Strength", 1);
  }
  if (getActiveStatusState(player, "Hollow Interference", character)) {
    gainStatus("Haste", 2);
    gainStatus("Strength", 2);
  }

  const stateValue = getStatusStatValue(player, "State", "value", character);
  const stateBoost = Math.floor(stateValue / 10);
  if (stateBoost > 0 && getActiveStatusState(player, "State: Normal", character)) {
    gainStatus("Strength", stateBoost);
    gainStatus("Dexterity", stateBoost);
    gainStatus("Haste", stateBoost);
  }
  if (stateBoost > 0 && getActiveStatusState(player, "State: Serious", character)) {
    gainStatus("Strength", stateBoost);
    gainStatus("Dexterity", stateBoost);
    gainStatus("Fortified", stateBoost);
    gainStatus("Haste", stateBoost);
  }
  const extraDraw = getActiveStatusState(player, "State: Bored", character) ? 1 : 0;
  drawToHandSize(state, playerId, baseHandSize + extraDraw);
  applyPrepareAdjustments(state, playerId, characters);

  const stunned = Boolean(getActiveStatusState(player, "Stun", character));
  if (stunned && options?.resolveStun) {
    expireStatus(player, "Stun");
  }
  return stunned && Boolean(options?.resolveStun);
};

const applyTurnEndEffects = (state: MatchState, playerId: PlayerId, characters: Character[]) => {
  if (state.phase === "finished") return;
  const player = state.players[playerId];
  const character = getCharacterById(characters, player.characterId);

  const updateStatus = (
    statusName: string,
    updater: (statusState: StatusState, definition: StatusDefinition) => void
  ) => {
    const statusState = player.statuses[statusName];
    if (!statusState) return;
    const definition = getStatusDefinition(statusName, character);
    const wasActive = isStatusActive(statusState, definition);
    if (!wasActive) return;
    updater(statusState, definition);
    if (wasActive && !isStatusActive(statusState, definition)) {
      handleStatusExpiration(state, playerId, statusName, character);
    }
  };

  updateStatus("Bleed", (statusState) => {
    statusState.count = Math.floor(statusState.count / 2);
  });
  updateStatus("Burn", (statusState) => {
    applyStatusDamage(state, playerId, statusState.potency, "Burn", character);
    statusState.count = Math.floor(statusState.count / 2);
  });
  updateStatus("Poison", (statusState) => {
    applyStatusDamage(state, playerId, statusState.potency, "Poison", character);
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
      applyHealing(state, playerId, statusState.potency, character, "Regen");
    }
    statusState.count = clampValue(statusState.count - 1, definition.countMax);
  });
  updateStatus("Renewal", (statusState, definition) => {
    if (statusState.potency > 0) {
      const amount = Math.floor((100 * statusState.potency) / 100);
      applyHealing(state, playerId, amount, character, "Renewal");
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
    applyStatusDamage(state, playerId, statusState.stack * 5, "Spectro Frazzle", character);
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
      player.hp = 0;
      state.winnerId = getOpponentId(playerId);
      state.phase = "finished";
      addLog(state, `${player.name} succumbs to Death by Death Note.`);
      addLog(state, `${state.players[state.winnerId].name} wins the match.`);
    }
  });

  updateStatus("Cover", () => {
    expireStatus(player, "Cover");
  });
  updateStatus("Stun", () => {
    expireStatus(player, "Stun");
  });
  updateStatus("Gear 2nd", () => {
    expireStatus(player, "Gear 2nd");
  });
  updateStatus("Gear 3rd", () => {
    expireStatus(player, "Gear 3rd");
  });
  updateStatus("Hollow Interference", () => {
    expireStatus(player, "Hollow Interference");
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
      const drain = Math.floor(player.hp * 0.05 * statusState.potency);
      applyStatusDamage(state, playerId, drain, "Kyuubi Chakra", character);
    }
  });
  updateStatus("Kaioken", (statusState, definition) => {
    statusState.count = clampValue(statusState.count - 1, definition.countMax);
    if (statusState.potency > 0) {
      const drain = Math.floor(player.hp * 0.1 * statusState.potency);
      applyStatusDamage(state, playerId, drain, "Kaioken", character);
    }
  });

  pruneStatuses(player, character);
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

    Object.values(state.zones).forEach((zone) => {
      zone.cards = [];
      zone.passCount = 0;
      zone.lastPlayedBy = undefined;
    });

    Object.values(state.players).forEach((player) => {
      player.energy = 5;
      player.shield = 0;
    });

    const initiator = state.players[state.initiativePlayerId];
    addLog(state, `Turn ${state.turn} begins. ${initiator.name} has initiative.`);
    const skipInitiative = applyTurnStartEffects(state, state.initiativePlayerId, characters, {
      resolveStun: true,
    });
    const otherPlayer = getOpponentId(state.initiativePlayerId);
    applyTurnStartEffects(state, otherPlayer, characters, { resolveStun: false });

    if (!skipInitiative) {
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
  sourceId: PlayerId,
  targetId: PlayerId,
  sourceCharacter: Character | null,
  targetCharacter: Character | null
) => {
  if (!condition) return true;
  const threshold = condition.min ?? 1;
  switch (condition.kind) {
    case "self_has_status": {
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
  playerId: PlayerId,
  status: string,
  min: number,
  character: Character | null
) => {
  const state = getSnapshotStatusState(snapshot, playerId, status);
  const definition = getStatusDefinition(status, character);
  return isStatusActive(state, definition) && getStatusPrimaryValue(state, definition) >= min;
};

const getUseRestrictionError = (
  card: Card,
  state: MatchState,
  sourceId: PlayerId,
  targetId: PlayerId,
  characters: Character[]
) => {
  const restrictions = card.restrictions ?? [];
  if (!restrictions.length) return null;
  const snapshot = snapshotStatuses(state);
  const sourceCharacter = getCharacterById(characters, state.players[sourceId].characterId);
  const targetCharacter = getCharacterById(characters, state.players[targetId].characterId);

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
  source: MatchPlayer,
  target: MatchPlayer,
  sourceCharacter: Character | null,
  targetCharacter: Character | null,
  spendContext: SpendContext
) => {
  effects.forEach((effect) => {
    if (effect.timing !== timing) return;
    if (timing === "on_hit" && !isHit) return;
    if (!isConditionMet(effect.condition, snapshot, entry.playedBy, entry.targetId, sourceCharacter, targetCharacter)) {
      return;
    }

    switch (effect.type) {
      case "deal_damage": {
        if (spendContext.skipDamage) break;
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        const hits =
          effect.hits === undefined ? 1 : resolveEffectScalar(effect.hits, entry.xValue);
        const total = amount * hits;
        if (total <= 0) break;
        const applied = applyDamage(
          target,
          total,
          entry.types,
          targetCharacter,
          entry.mitigationText
        );
        addLog(state, `${state.players[entry.playedBy].name} deals ${applied} damage to ${target.name}.`);
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
        applyHealing(state, entry.playedBy, amount, sourceCharacter);
        break;
      }
      case "gain_ultimate": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        if (amount <= 0) break;
        source.ultimate += amount;
        addLog(state, `${source.name} gains ${amount} ultimate meter.`);
        break;
      }
      case "gain_status": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        if (amount <= 0) break;
        if (effect.status === "Stagnate") {
          applyStagnate(state, entry, amount, characters, entry.playedBy);
        } else {
          applyStatusDelta(source, effect.status, amount, effect.stat, sourceCharacter);
          addLog(state, `${source.name} gains ${amount} ${effect.status}.`);
        }
        break;
      }
      case "inflict_status": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        if (amount <= 0) break;
        if (effect.status === "Stagnate") {
          applyStagnate(state, entry, amount, characters, entry.targetId);
        } else {
          applyStatusDelta(target, effect.status, amount, effect.stat, targetCharacter);
          addLog(state, `${target.name} gains ${amount} ${effect.status}.`);
        }
        break;
      }
      case "set_status": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        const recipient = effect.target === "target" ? target : source;
        const recipientCharacter = effect.target === "target" ? targetCharacter : sourceCharacter;
        const applied = setStatusValue(recipient, effect.status, amount, effect.stat, recipientCharacter);
        if (applied === null) break;
        addLog(state, `${recipient.name} sets ${effect.status} to ${applied}.`);
        break;
      }
      case "reduce_status": {
        const amount = resolveEffectAmount(effect.amount, power, entry.xValue);
        const recipient = effect.target === "target" ? target : source;
        const recipientCharacter = effect.target === "target" ? targetCharacter : sourceCharacter;
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
        const applied = applyDamage(
          target,
          total,
          entry.types,
          targetCharacter,
          entry.mitigationText
        );
        addLog(state, `${state.players[entry.playedBy].name} deals ${applied} damage to ${target.name}.`);
        break;
      }
      case "reload_equipped": {
        reloadEquippedWeapon(state, entry.playedBy, characters);
        break;
      }
      case "switch_equip": {
        switchEquipment(state, entry.playedBy, effect.status, characters);
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
          source,
          target,
          sourceCharacter,
          targetCharacter,
          spendContext
        );
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
  spendContext: SpendContext
) => {
  if (!entry.effects) return;
  const source = state.players[entry.playedBy];
  const target = state.players[entry.targetId];
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
    source,
    target,
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
  const source = state.players[entry.playedBy];
  const target = state.players[entry.targetId];
  const sourceCharacter = getCharacterById(characters, source.characterId);
  const targetCharacter = getCharacterById(characters, target.characterId);
  const segments = getTimedTextSegments(entry.effectText);
  const context: SpendContext = {
    skipAll: false,
    skipDamage: false,
    ammoSpent: 0,
    spentResources: {},
  };

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
          entry.playedBy,
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
            entry.playedBy,
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
          entry.playedBy,
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
          entry.playedBy,
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
  spendContext: SpendContext
) => {
  if (spendContext.skipAll) return;
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

  segments.forEach((segment) => {
    if (segment.timing !== timing) return;
    const line = segment.text;
    const normalized = normalizeText(line).toLowerCase();
    if (normalized === "choose 1:") return;
    if (options.length && normalizedOptions.includes(normalized) && normalized !== chosenOption) {
      return;
    }

    const create = parseCreateFromLine(line);
    if (create) {
      createCardsInHand(state, entry.playedBy, create.cardName, create.count, characters);
    }

    const drawCount = parseDrawFromLine(line);
    if (drawCount && drawCount > 0) {
      drawCards(state, entry.playedBy, drawCount);
    }

    if (!hasReloadEffect && isReloadLine(line)) {
      reloadEquippedWeapon(state, entry.playedBy, characters);
    }

    const switchEquip = hasSwitchEquipEffect ? null : parseEquipSwitchLine(line);
    if (switchEquip) {
      switchEquipment(state, entry.playedBy, switchEquip, characters);
    }

    const xConditionalMatch = normalized.match(
      /If X is (\d+),\s*inflict\s+(\d+)\s+([^.,]+)/i
    );
    if (xConditionalMatch) {
      const xTarget = Number(xConditionalMatch[1]);
      const amount = Number(xConditionalMatch[2]);
      const status = xConditionalMatch[3].split(/ and |, /i)[0].trim();
      if (!Number.isNaN(xTarget) && entry.xValue === xTarget && amount > 0 && status) {
        const target = state.players[entry.targetId];
        const targetCharacter = getCharacterById(characters, target.characterId);
        applyStatusDelta(target, status, amount, undefined, targetCharacter);
        addLog(state, `${target.name} gains ${amount} ${status}.`);
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
  spendContext: SpendContext
) => {
  if (timing === "on_hit" && !isHit) return;
  if (spendContext.skipAll) return;
  const source = state.players[entry.playedBy];
  const target = state.players[entry.targetId];
  const sourceCharacter = getCharacterById(characters, source.characterId);
  const targetCharacter = getCharacterById(characters, target.characterId);
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
        const applied = applyDamage(
          target,
          totalDamage,
          entry.types,
          targetCharacter,
          entry.mitigationText
        );
        addLog(
          state,
          `${state.players[entry.playedBy].name} deals ${applied} damage to ${target.name}.`
        );
      }
    }

    const shield = parseShieldFromLine(line, power, entry.xValue);
    if (shield !== null && shield > 0) {
      source.shield += shield;
      addLog(state, `${source.name} gains ${shield} shield.`);
    }

    const heal = parseHealFromLine(line, power, entry.xValue);
    if (heal !== null && heal > 0) {
      applyHealing(state, entry.playedBy, heal, sourceCharacter);
    }

    const ultimate = parseUltimateFromLine(line, power);
    if (ultimate !== null && ultimate > 0) {
      source.ultimate += ultimate;
      addLog(state, `${source.name} gains ${ultimate} ultimate meter.`);
    }

    const spendInflict = parseSpendInflictLine(line);
    const statusChange = spendInflict ? null : parseStatusChange(line);
    if (statusChange && statusChange.amount > 0) {
      if (!spendContext.skipAll) {
        const recipient = statusChange.type === "inflict" ? target : source;
        const recipientCharacter =
          statusChange.type === "inflict" ? targetCharacter : sourceCharacter;
        if (statusChange.status === "Stagnate") {
          applyStagnate(state, entry, statusChange.amount, characters, recipient.id);
        } else {
          applyStatusDelta(
            recipient,
            statusChange.status,
            statusChange.amount,
            undefined,
            recipientCharacter
          );
          addLog(state, `${recipient.name} gains ${statusChange.amount} ${statusChange.status}.`);
        }
      }
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
  const source = state.players[entry.playedBy];
  const target = state.players[entry.targetId];
  const sourceCharacter = getCharacterById(characters, source.characterId);
  const targetCharacter = getCharacterById(characters, target.characterId);
  const spendContext = resolveSpendContext(state, entry, timing, characters);
  resolveTextMetaEffects(state, entry, timing, characters, spendContext);

  if (entry.effects && entry.effects.length > 0) {
    const snapshot = snapshotStatuses(state);
    if (!spendContext.skipAll) {
      resolveStructuredEffects(state, entry, power, timing, isHit, characters, snapshot, spendContext);
    }
  } else {
    resolveTextEffectsForTiming(state, entry, power, timing, isHit, characters, spendContext);
  }

  pruneStatuses(source, sourceCharacter);
  pruneStatuses(target, targetCharacter);
};

const estimateDamageForTiming = (
  state: MatchState,
  entry: StackEntry,
  power: number,
  timing: Effect["timing"],
  characters: Character[]
) => {
  const spendContext = resolveSpendContext(state, entry, timing, characters, { preview: true });
  if (entry.effects && entry.effects.length > 0) {
    if (spendContext.skipAll || spendContext.skipDamage) return 0;
    const snapshot = snapshotStatuses(state);
    const source = state.players[entry.playedBy];
    const target = state.players[entry.targetId];
    const sourceCharacter = getCharacterById(characters, source.characterId);
    const targetCharacter = getCharacterById(characters, target.characterId);
    let total = 0;

    forEachStructuredEffect(entry.effects, timing, entry.choiceIndex, (effect) => {
      if (effect.type !== "deal_damage" && effect.type !== "deal_damage_per_spent") return;
      if (
        !isConditionMet(
          effect.condition,
          snapshot,
          entry.playedBy,
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
  const source = state.players[entry.playedBy];
  const target = state.players[entry.targetId];
  if (!source || !target) return;

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

  if (!cancelled) {
    if (getActionType(entry.types) === "attack") {
      const targetText = entry.targetText?.toLowerCase() ?? "";
      if (
        targetText.includes("enemy") &&
        !targetText.includes("all") &&
        !targetText.includes("random") &&
        entry.targetId !== entry.playedBy
      ) {
        const targetCharacter = getCharacterById(characters, target.characterId);
        const cover = getActiveStatusState(target, "Cover", targetCharacter);
        if (cover && cover.value > 0) {
          applyStatusStatDelta(target, "Cover", -1, "value", targetCharacter);
          addLog(state, `${target.name} uses Cover to redirect the attack.`);
        }
      }
    }
    resolveEffectsForTiming(state, entry, power, "before_use", isHit, characters);
    resolveEffectsForTiming(state, entry, power, "on_use", isHit, characters);
    if (isHit) {
      resolveEffectsForTiming(state, entry, power, "on_hit", true, characters);
      if (getActionType(entry.types) === "attack") {
        const targetCharacter = getCharacterById(characters, target.characterId);
        const thorns = getActiveStatusState(target, "Thorns", targetCharacter);
        if (thorns && thorns.potency > 0) {
          const sourceCharacter = getCharacterById(characters, source.characterId);
          applyStatusDamage(state, source.id, thorns.potency, "Thorns", sourceCharacter);
        }
      }
    }
    resolveEffectsForTiming(state, entry, power, "after_use", isHit, characters);
  }
  resolveEffectsForTiming(state, entry, power, "always", isHit, characters);

  if (!cancelled && isHit && getActionType(entry.types) === "attack") {
    const sourceCharacter = getCharacterById(characters, source.characterId);
    const bankai = getActiveStatusState(source, "Bankai: Tensa Zangetsu", sourceCharacter);
    const flags = state.turnFlags[entry.playedBy];
    if (bankai && !flags.bankaiHitUsed) {
      applyStatusDelta(source, "Reiatsu", 1, undefined, sourceCharacter);
      flags.bankaiHitUsed = true;
      addLog(state, `${source.name} gains 1 Reiatsu from Bankai.`);
    }
  }

  if (!cancelled) {
    state.afterUseWindow = {
      lastUsedBy: entry.playedBy,
      lastUsedCharacterId: source.characterId,
      validForAction: (state.actionId ?? 0) + 1,
    };
  }

  if (target.hp <= 0) {
    state.winnerId = source.id;
    state.phase = "finished";
    addLog(state, `${source.name} wins the match.`);
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
  const player = state.players[entry.playedBy];
  const character = getCharacterById(characters, player.characterId);
  return applyPowerModifiers(base, player, character, actionType);
};

const finalizeEntryCard = (state: MatchState, entry: StackEntry, characters: Character[]) => {
  if (!entry.cardInstance) return;
  const player = state.players[entry.playedBy];
  const card = findCard(characters, player.characterId, entry.cardSlot);
  if (!card) return;
  const lifecycle = getLifecycleKeywords(card.effect, card.effects);
  if (lifecycle.exhaust) {
    player.exhausted.push(entry.cardInstance);
  } else {
    player.discard.push(entry.cardInstance);
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
        ? { evade: false, reuse: false, followUp: false, assistAttack: false }
        : getKeywordFlags(defense.effectText);
      const attackKeywords = getKeywordFlags(attack.effectText);
      let attackIsHit = true;
      let defenseReuse = false;

      if (defenseKeywords.evade) {
        const attackDamage = estimateDamageForTiming(
          state,
          attack,
          attackPower,
          "on_use",
          characters
        );
        const attackTarget = state.players[attack.targetId];
        const damageAfterShield = Math.max(attackDamage - attackTarget.shield, 0);
        if (damageAfterShield === 0) {
          attackIsHit = false;
          defenseReuse = true;
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

      const rightReuse = !right.cancelledBeforeUse && getKeywordFlags(right.effectText).reuse;
      const leftReuse = !left.cancelledBeforeUse && getKeywordFlags(left.effectText).reuse;
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
  sourceId: PlayerId,
  targetId: PlayerId,
  characters: Character[]
) => {
  if (!card.transforms?.length) return card;
  const source = state.players[sourceId];
  const target = state.players[targetId];
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
  players: { id: PlayerId; name: string; characterId: string }[],
  options: MatchOptions = {}
): MatchState => {
  const [first, second] = players;
  if (!first || !second) {
    throw new Error("Two players required.");
  }

  const rosterIds = new Set(characters.map((entry) => entry.id));
  if (!rosterIds.has(first.characterId) || !rosterIds.has(second.characterId)) {
    throw new Error("Character selection is invalid.");
  }

  const rng = createRngState(options.seed);
  const transcript = options.enableTranscript
    ? createMatchTranscript(rng.seed, players)
    : undefined;

  const state: MatchState = {
    turn: 1,
    phase: "combat",
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
    positions: { p1: defaultPosition, p2: defaultPosition },
    players: {
      p1: {
        id: "p1",
        name: first.name,
        characterId: first.characterId,
        hp: 100,
        shield: 0,
        energy: 5,
        ultimate: 0,
        statuses: {},
        deck: [],
        hand: [],
        discard: [],
        exhausted: [],
        resourceMax: {},
      },
      p2: {
        id: "p2",
        name: second.name,
        characterId: second.characterId,
        hp: 100,
        shield: 0,
        energy: 5,
        ultimate: 0,
        statuses: {},
        deck: [],
        hand: [],
        discard: [],
        exhausted: [],
        resourceMax: {},
      },
    },
    log: [],
    pendingTurnStartGains: { p1: [], p2: [] },
    turnFlags: {
      p1: { bankaiHitUsed: false, kyuubiCloneUsed: false, gamabuntaUsed: false },
      p2: { bankaiHitUsed: false, kyuubiCloneUsed: false, gamabuntaUsed: false },
    },
    nextCardInstanceId: 1,
    rng,
    transcript,
  };

  buildStartingZones(state, "p1", characters);
  buildStartingZones(state, "p2", characters);
  const p1Character = getCharacterById(characters, state.players.p1.characterId);
  const p2Character = getCharacterById(characters, state.players.p2.characterId);
  if (p1Character) applyStartingStatuses(state, "p1", p1Character);
  if (p2Character) applyStartingStatuses(state, "p2", p2Character);

  addLog(state, `Turn 1 begins. ${state.players.p1.name} has initiative.`);
  applyTurnStartEffects(state, "p1", characters, { resolveStun: true });
  applyTurnStartEffects(state, "p2", characters, { resolveStun: false });
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
    const player = next.players[action.playerId];
    const sourceCharacter = getCharacterById(characters, player.characterId);
    let card: Card | null = null;
    let cardInstance: CardInstance | null = null;
    let cardInstanceIndex = -1;

    if (action.cardInstanceId) {
      cardInstanceIndex = player.hand.findIndex(
        (instance) => instance.id === action.cardInstanceId
      );
      if (cardInstanceIndex === -1) {
        return finalize("Card not in hand.");
      }
      cardInstance = player.hand[cardInstanceIndex] ?? null;
      if (!cardInstance) return finalize("Card not found.");
      card = findCard(characters, player.characterId, cardInstance.cardSlot);
    } else if (action.cardSlot) {
      card = findCard(characters, player.characterId, action.cardSlot);
    }

    if (!card) return finalize("Card not found.");
    if (!action.cardInstanceId && !isUltimateCard(card)) {
      return finalize("Card must be played from hand.");
    }

    const initialTargetId = pickTargetId(card, action.playerId, next, characters);
    const resolvedCard = resolveCardTransforms(
      card,
      next,
      action.playerId,
      initialTargetId,
      characters
    );

    const outOfTurnAllowed =
      action.playerId !== next.activePlayerId &&
      canPlayAfterUse(next, action.playerId, resolvedCard, characters);
    if (action.playerId !== next.activePlayerId && !outOfTurnAllowed) {
      return finalize("Not your turn.");
    }

    if (getActiveStatusState(player, "Deflate", sourceCharacter)) {
      return finalize("This character is Deflated and cannot play cards.");
    }

    const typeSet = new Set(resolvedCard.types.map(normalizeTag));
    const actionType = getActionType(resolvedCard.types);
    if (getActiveStatusState(player, "Disarm", sourceCharacter) && typeSet.has("physical")) {
      return finalize("Disarm prevents playing Physical cards.");
    }
    if (getActiveStatusState(player, "Silence", sourceCharacter) && typeSet.has("magical")) {
      return finalize("Silence prevents playing Magical cards.");
    }
    if (
      getActiveStatusState(player, "Seal", sourceCharacter) &&
      (actionType === "special" || typeSet.has("special"))
    ) {
      return finalize("Seal prevents playing Special cards.");
    }

    const choiceEffects =
      resolvedCard.effects?.filter((effect) => effect.type === "choose") ?? [];
    const textChoices = choiceEffects.length ? [] : getTextChoiceOptions(resolvedCard.effect);
    if (choiceEffects.length) {
      if (action.choiceIndex === undefined || !Number.isInteger(action.choiceIndex)) {
        return finalize("Choice required.");
      }
      const invalidChoice = choiceEffects.some(
        (effect) => action.choiceIndex < 0 || action.choiceIndex >= effect.options.length
      );
      if (invalidChoice) {
        return finalize("Invalid choice.");
      }
    } else if (textChoices.length) {
      if (action.choiceIndex === undefined || !Number.isInteger(action.choiceIndex)) {
        return finalize("Choice required.");
      }
      if (action.choiceIndex < 0 || action.choiceIndex >= textChoices.length) {
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

    const targetId = pickTargetId(resolvedCard, action.playerId, next, characters);
    const restrictionError = getUseRestrictionError(
      resolvedCard,
      next,
      action.playerId,
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
      Boolean(isAfterUse) && next.afterUseWindow?.lastUsedBy === action.playerId;
    const followUpAdjustment = isFollowUpPlay
      ? getFollowUpCostAdjustment(resolvedCard.effect)
      : 0;
    const adjustedTotals = getAdjustedCostTotals(
      player,
      sourceCharacter,
      cost,
      xValue,
      cardInstance,
      followUpAdjustment
    );
    if (player.energy < adjustedTotals.energy || player.ultimate < adjustedTotals.ultimate) {
      return finalize("Insufficient resources.");
    }

    const effectiveSpeed = getEffectiveSpeed(resolvedCard.speed, player, sourceCharacter);
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
      cardInstance = player.hand.splice(cardInstanceIndex, 1)[0] ?? null;
    }

    player.energy -= adjustedTotals.energy;
    player.ultimate -= adjustedTotals.ultimate;
    if (adjustedTotals.energy > 0) {
      player.ultimate += adjustedTotals.energy;
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
      targetId,
      targetText: resolvedCard.target,
      xValue,
      choiceIndex: action.choiceIndex,
      cardInstanceId: cardInstance?.id,
      cardInstance: cardInstance ?? undefined,
    };
    zone.cards.push(entry);

    if (resolvedCard.name !== card.name) {
      addLog(next, `${card.name} becomes ${resolvedCard.name}.`);
    }
    addLog(next, `${player.name} plays ${resolvedCard.name} in the ${zoneLabel(action.zone)} Zone.`);
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

  if (action.type === "pass") {
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
      }
    } else {
      next.activePlayerId = getOpponentId(action.playerId);
    }

    return finalize();
  }

  if (action.type === "end_turn") {
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
