import type { Card, Character, Effect, EffectAmount } from "@ua/data";

export type PlayerId = "p1" | "p2";
export type ZoneName = "fast" | "normal" | "slow";

type ActionType = "attack" | "defense" | "special";

export type MatchPlayer = {
  id: PlayerId;
  name: string;
  characterId: string;
  hp: number;
  shield: number;
  energy: number;
  ultimate: number;
  statuses: Record<string, number>;
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
  xValue: number;
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
  activePlayerId: PlayerId;
  initiativePlayerId: PlayerId;
  activeZone: ZoneName | null;
  pausedZones: ZoneName[];
  zones: Record<ZoneName, ZoneState>;
  players: Record<PlayerId, MatchPlayer>;
  log: string[];
  winnerId?: PlayerId;
};

export type Action =
  | { type: "play_card"; playerId: PlayerId; cardSlot: string; zone: ZoneName; xValue?: number }
  | { type: "pass"; playerId: PlayerId }
  | { type: "end_turn"; playerId: PlayerId }
  | { type: "clear_log"; playerId: PlayerId };

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

const getOpponentId = (playerId: PlayerId) => (playerId === "p1" ? "p2" : "p1");

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

const rollBetween = (min: number, max: number) => {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

export const canAfford = (player: MatchPlayer, cost: CostBreakdown, xValue = 0) => {
  const totals = computeCost(cost, xValue);
  return player.energy >= totals.energy && player.ultimate >= totals.ultimate;
};

export const rollPower = (powerText: string, xValue = 0) => {
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

  return rollBetween(min, max);
};

const pickTargetId = (card: Card, sourceId: PlayerId) => {
  const target = card.target.toLowerCase();
  if (target.includes("enemy")) return getOpponentId(sourceId);
  if (target.includes("self") || target.includes("ally")) return sourceId;
  return getOpponentId(sourceId);
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

const applyDamage = (target: MatchPlayer, damage: number) => {
  const absorbed = Math.min(target.shield, damage);
  target.shield -= absorbed;
  const remaining = damage - absorbed;
  target.hp = Math.max(target.hp - remaining, 0);
  return damage;
};

const applyStatus = (target: MatchPlayer, status: string, amount: number) => {
  if (!status) return;
  target.statuses[status] = (target.statuses[status] ?? 0) + amount;
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

const resolveEffectAmount = (amount: EffectAmount, power: number) => {
  if (amount.kind === "flat") return amount.value;
  if (amount.kind === "power") return power;
  if (amount.kind === "power_div") return Math.floor(power / amount.divisor);
  return 0;
};

const resolveStructuredEffects = (
  state: MatchState,
  entry: StackEntry,
  power: number,
  timing: Effect["timing"],
  isHit: boolean
) => {
  if (!entry.effects) return;
  entry.effects.forEach((effect) => {
    if (effect.timing !== timing) return;
    if (timing === "on_hit" && !isHit) return;

    switch (effect.type) {
      case "deal_damage": {
        const amount = resolveEffectAmount(effect.amount, power);
        if (amount <= 0) break;
        const target = state.players[entry.targetId];
        applyDamage(target, amount);
        addLog(state, `${state.players[entry.playedBy].name} deals ${amount} damage to ${target.name}.`);
        break;
      }
      case "gain_shield": {
        const amount = resolveEffectAmount(effect.amount, power);
        if (amount <= 0) break;
        const source = state.players[entry.playedBy];
        source.shield += amount;
        addLog(state, `${source.name} gains ${amount} shield.`);
        break;
      }
      case "heal": {
        const amount = resolveEffectAmount(effect.amount, power);
        if (amount <= 0) break;
        const source = state.players[entry.playedBy];
        source.hp = Math.min(source.hp + amount, 100);
        addLog(state, `${source.name} heals ${amount} HP.`);
        break;
      }
      case "gain_ultimate": {
        const amount = resolveEffectAmount(effect.amount, power);
        if (amount <= 0) break;
        const source = state.players[entry.playedBy];
        source.ultimate += amount;
        addLog(state, `${source.name} gains ${amount} ultimate meter.`);
        break;
      }
      case "gain_status": {
        const amount = resolveEffectAmount(effect.amount, power);
        if (amount <= 0) break;
        const source = state.players[entry.playedBy];
        applyStatus(source, effect.status, amount);
        addLog(state, `${source.name} gains ${amount} ${effect.status}.`);
        break;
      }
      case "inflict_status": {
        const amount = resolveEffectAmount(effect.amount, power);
        if (amount <= 0) break;
        const target = state.players[entry.targetId];
        applyStatus(target, effect.status, amount);
        addLog(state, `${target.name} gains ${amount} ${effect.status}.`);
        break;
      }
      default:
        break;
    }
  });
};

const resolveTextEffects = (
  state: MatchState,
  entry: StackEntry,
  power: number,
  isHit: boolean
) => {
  const onHitLines = entry.effectText.filter((line) => /on hit/i.test(line));
  const immediateLines = entry.effectText.filter((line) => !/on hit/i.test(line));

  immediateLines.forEach((line) => {
    const damage = parseDamageFromLine(line, power, entry.xValue);
    if (damage !== null && damage > 0) {
      const target = state.players[entry.targetId];
      applyDamage(target, damage);
      addLog(state, `${state.players[entry.playedBy].name} deals ${damage} damage to ${target.name}.`);
    }

    const shield = parseShieldFromLine(line, power, entry.xValue);
    if (shield !== null && shield > 0) {
      const source = state.players[entry.playedBy];
      source.shield += shield;
      addLog(state, `${source.name} gains ${shield} shield.`);
    }

    const heal = parseHealFromLine(line, power, entry.xValue);
    if (heal !== null && heal > 0) {
      const source = state.players[entry.playedBy];
      source.hp = Math.min(source.hp + heal, 100);
      addLog(state, `${source.name} heals ${heal} HP.`);
    }

    const ultimate = parseUltimateFromLine(line, power);
    if (ultimate !== null && ultimate > 0) {
      const source = state.players[entry.playedBy];
      source.ultimate += ultimate;
      addLog(state, `${source.name} gains ${ultimate} ultimate meter.`);
    }

    const statusChange = parseStatusChange(line);
    if (statusChange && statusChange.amount > 0) {
      const recipient = statusChange.type === "inflict" ? state.players[entry.targetId] : state.players[entry.playedBy];
      applyStatus(recipient, statusChange.status, statusChange.amount);
      addLog(state, `${recipient.name} gains ${statusChange.amount} ${statusChange.status}.`);
    }
  });

  if (isHit) {
    onHitLines.forEach((line) => {
      const statusChange = parseStatusChange(line);
      if (statusChange && statusChange.amount > 0) {
        const recipient = statusChange.type === "inflict" ? state.players[entry.targetId] : state.players[entry.playedBy];
        applyStatus(recipient, statusChange.status, statusChange.amount);
        addLog(state, `${recipient.name} gains ${statusChange.amount} ${statusChange.status}.`);
      }
    });
  }
};

const resolveUse = (state: MatchState, entry: StackEntry, isHit: boolean) => {
  const source = state.players[entry.playedBy];
  const target = state.players[entry.targetId];
  if (!source || !target) return;

  const power = rollPower(entry.powerText, entry.xValue);
  if (entry.effects && entry.effects.length > 0) {
    resolveStructuredEffects(state, entry, power, "on_use", isHit);
    if (isHit) {
      resolveStructuredEffects(state, entry, power, "on_hit", true);
    }
    resolveStructuredEffects(state, entry, power, "after_use", isHit);
  } else {
    resolveTextEffects(state, entry, power, isHit);
  }

  if (target.hp <= 0) {
    state.winnerId = source.id;
    state.phase = "finished";
    addLog(state, `${source.name} wins the match.`);
  }
};

const resolveZone = (state: MatchState, zoneName: ZoneName) => {
  const zone = state.zones[zoneName];
  if (!zone.cards.length) return;

  addLog(state, `${zoneLabel(zoneName)} Zone resolves.`);

  let index = zone.cards.length - 1;
  while (index >= 0) {
    const right = zone.cards[index];
    const leftIndex = index - 1;

    if (leftIndex < 0) {
      const rightType = getActionType(right.types);
      resolveUse(state, right, rightType === "attack");
      zone.cards.splice(index, 1);
      index -= 1;
      continue;
    }

    const left = zone.cards[leftIndex];
    if (left.playedBy === right.playedBy) {
      const rightType = getActionType(right.types);
      resolveUse(state, right, rightType === "attack");
      zone.cards.splice(index, 1);
      index = leftIndex;
      continue;
    }

    const rightType = getActionType(right.types);
    const leftType = getActionType(left.types);

    if (rightType === "attack" && leftType === "attack") {
      const rightPower = rollPower(right.powerText, right.xValue);
      const leftPower = rollPower(left.powerText, left.xValue);

      if (rightPower === leftPower) {
        addLog(state, `${right.cardName} and ${left.cardName} clash and are both cancelled.`);
        zone.cards.splice(leftIndex, 2);
        index = leftIndex - 1;
      } else if (rightPower > leftPower) {
        addLog(state, `${right.cardName} overpowers ${left.cardName}.`);
        zone.cards.splice(leftIndex, 1);
        index -= 1;
      } else {
        addLog(state, `${left.cardName} overpowers ${right.cardName}.`);
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
      resolveUse(state, defense, false);
      resolveUse(state, attack, true);
      zone.cards.splice(leftIndex, 2);
      index = leftIndex - 1;
      continue;
    }

    if (rightType === "defense" && leftType === "defense") {
      resolveUse(state, right, false);
      resolveUse(state, left, false);
      zone.cards.splice(leftIndex, 2);
      index = leftIndex - 1;
      continue;
    }

    resolveUse(state, right, rightType === "attack");
    resolveUse(state, left, leftType === "attack");
    zone.cards.splice(leftIndex, 2);
    index = leftIndex - 1;
  }

  zone.lastPlayedBy = undefined;
  zone.passCount = 0;
};

const findCard = (characters: Character[], characterId: string, cardSlot: string) => {
  const character = characters.find((item) => item.id === characterId);
  if (!character) return null;
  const primary = character.cards.find((card) => card.slot === cardSlot);
  if (primary) return primary;
  return character.createdCards?.find((card) => card.slot === cardSlot) ?? null;
};

const zonesAreEmpty = (state: MatchState) =>
  Object.values(state.zones).every((zone) => zone.cards.length === 0);

const nextOccupiedZone = (state: MatchState) => {
  const entries: ZoneName[] = ["fast", "normal", "slow"];
  return entries.find((zone) => state.zones[zone].cards.length > 0) ?? null;
};

export const createMatchState = (
  characters: Character[],
  players: { id: PlayerId; name: string; characterId: string }[]
): MatchState => {
  const [first, second] = players;
  if (!first || !second) {
    throw new Error("Two players required.");
  }

  const rosterIds = new Set(characters.map((entry) => entry.id));
  if (!rosterIds.has(first.characterId) || !rosterIds.has(second.characterId)) {
    throw new Error("Character selection is invalid.");
  }

  const state: MatchState = {
    turn: 1,
    phase: "combat",
    initiativePlayerId: "p1",
    activePlayerId: "p1",
    activeZone: null,
    pausedZones: [],
    zones: {
      fast: { zone: "fast", cards: [], passCount: 0 },
      normal: { zone: "normal", cards: [], passCount: 0 },
      slow: { zone: "slow", cards: [], passCount: 0 },
    },
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
      },
    },
    log: [],
  };

  addLog(state, `Turn 1 begins. ${state.players.p1.name} has initiative.`);
  return state;
};

export const applyAction = (
  state: MatchState,
  action: Action,
  characters: Character[]
): { state: MatchState; error?: string } => {
  if (state.phase === "finished") return { state };
  const next = cloneState(state);

  if (action.type === "clear_log") {
    next.log = [];
    return { state: next };
  }

  if (action.playerId !== next.activePlayerId) {
    return { state: next, error: "Not your turn." };
  }

  if (action.type === "play_card") {
    const player = next.players[action.playerId];
    const card = findCard(characters, player.characterId, action.cardSlot);
    if (!card) return { state: next, error: "Card not found." };

    const cost = parseCost(card.cost);
    if (cost.variable && action.xValue === undefined) {
      return { state: next, error: "X value required." };
    }
    const totals = computeCost(cost, action.xValue ?? 0);
    if (!canAfford(player, cost, action.xValue ?? 0)) {
      return { state: next, error: "Insufficient resources." };
    }

    const legalZones = getLegalZonesForSpeed(card.speed);
    if (!legalZones.includes(action.zone)) {
      return { state: next, error: "Illegal zone for card speed." };
    }

    if (next.activeZone) {
      if (action.zone !== next.activeZone && !isZoneFaster(action.zone, next.activeZone)) {
        return { state: next, error: "Cannot play in a slower zone than the active zone." };
      }
    }

    player.energy -= totals.energy;
    player.ultimate -= totals.ultimate;
    if (totals.energy > 0) {
      player.ultimate += totals.energy;
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

    const targetId = pickTargetId(card, action.playerId);
    zone.cards.push({
      id: `${action.playerId}-${card.slot}-${zone.cards.length}`,
      cardSlot: card.slot,
      cardName: card.name,
      powerText: card.power,
      effectText: card.effect,
      effects: card.effects,
      types: card.types,
      speed: card.speed,
      playedBy: action.playerId,
      targetId,
      xValue: action.xValue ?? 0,
    });

    addLog(next, `${player.name} plays ${card.name} in the ${zoneLabel(action.zone)} Zone.`);
    next.activePlayerId = getOpponentId(action.playerId);
    return { state: next };
  }

  if (action.type === "pass") {
    if (!next.activeZone) {
      return { state: next, error: "No active zone to pass." };
    }

    const zone = next.zones[next.activeZone];
    const player = next.players[action.playerId];
    zone.passCount += 1;
    addLog(next, `${player.name} passes.`);

    if (zone.passCount >= 2 && zone.lastPlayedBy === action.playerId) {
      const resolvedBy = action.playerId;
      resolveZone(next, next.activeZone);

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

    return { state: next };
  }

  if (action.type === "end_turn") {
    if (action.playerId !== next.initiativePlayerId) {
      return { state: next, error: "Only the initiative player can end the turn." };
    }
    if (next.activeZone || !zonesAreEmpty(next)) {
      return { state: next, error: "Cannot end the turn during combat." };
    }

    next.turn += 1;
    next.initiativePlayerId = getOpponentId(next.initiativePlayerId);
    next.activePlayerId = next.initiativePlayerId;
    next.pausedZones = [];
    next.activeZone = null;

    Object.values(next.zones).forEach((zone) => {
      zone.cards = [];
      zone.passCount = 0;
      zone.lastPlayedBy = undefined;
    });

    Object.values(next.players).forEach((player) => {
      player.energy = 5;
      player.shield = 0;
    });

    const initiator = next.players[next.initiativePlayerId];
    addLog(next, `Turn ${next.turn} begins. ${initiator.name} has initiative.`);
    return { state: next };
  }

  return { state: next };
};
