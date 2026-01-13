import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { characters as roster, keywords, statusEffects } from "@ua/data";
import type { Card, Character, Keyword, StatusEffectDefinition } from "@ua/data";
import {
  applyAction,
  createMatchState,
  getLegalTargets,
  parseCost,
  type CombatResolution,
  type MatchCharacterId,
  type MatchState,
  type PlayerId,
  type StackEntry,
  type ZoneName,
} from "@ua/core";

type Stage = "setup" | "match";

type SelectionState = {
  p1: string[];
  p2: string[];
};

type RelayConnectionStatus = "idle" | "connecting" | "connected";

type RelayLobbySnapshot = {
  code: string;
  hostId: string;
  players: { id: string; name: string }[];
};

type RelayEventMessage = {
  type: "lobby_event" | "game_event";
  event: string;
  data?: Record<string, unknown>;
  from?: string;
};

type SetupSyncPayload = {
  selection: SelectionState;
  names: { p1: string; p2: string };
};

const defaultRelayUrl = import.meta.env.VITE_RELAY_URL ?? "ws://localhost:8787";

const createClientId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
};

const getStoredClientId = () => {
  if (typeof window === "undefined") {
    return createClientId();
  }
  const stored = window.localStorage.getItem("ua-client-id");
  if (stored) return stored;
  const next = createClientId();
  window.localStorage.setItem("ua-client-id", next);
  return next;
};

const getStoredSkipCombat = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("ua-skip-combat") === "true";
};

const defaultSelection = (): SelectionState => {
  const sorted = sortRoster(roster);
  const p1 = sorted.slice(0, 3).map((entry) => entry.id);
  const p2 = sorted.slice(3, 6).map((entry) => entry.id);
  const fallback = sorted[0]?.id ?? "";
  return {
    p1: p1.length === 3 ? p1 : [fallback, fallback, fallback],
    p2: p2.length === 3 ? p2 : [fallback, fallback, fallback],
  };
};

const sortRoster = (list: Character[]) =>
  [...list].sort((a, b) => `${a.name} ${a.version}`.localeCompare(`${b.name} ${b.version}`));

const getCharacter = (list: Character[], id: string) => list.find((entry) => entry.id === id);

type Team = MatchState["players"][PlayerId];
type TeamMember = Team["characters"][number];
type CardInstance = Team["hand"][number];
type TeamLookup = { teamId: PlayerId; team: Team; member: TeamMember };

type CombatSide = {
  entry: NonNullable<CombatResolution["steps"][number]["left"]>;
  teamId: PlayerId;
  member: TeamMember;
  character?: Character;
  targetName: string;
  artUrl: string | null;
  power: number | null;
};

type PileType = "deck" | "discard" | "exhausted";

type PileSummary = {
  name: string;
  slot: string;
  count: number;
  types: string;
  owner: string;
};

type HandEntry = {
  instance: CardInstance;
  card: Card;
  owner: TeamMember;
  ownerTeam: Team;
  ownerCharacter: Character;
};

type UltimateEntry = {
  card: Card;
  member: TeamMember;
  character: Character;
};

type RedirectOption = {
  id: MatchCharacterId;
  label: string;
  source: "cover" | "redirect";
};

type ScryState = {
  cards: CardInstance[];
  discardIds: string[];
  orderIds: string[];
};

type SeekState = {
  cards: CardInstance[];
  takeIds?: string[];
  take: number;
  criteria: string;
};

type SearchState = {
  options: { id: string; label: string }[];
  pickId?: string;
  criteria: string;
};

type PendingPlay = {
  playerId: PlayerId;
  card: Card;
  baseCard: Card;
  baseCardSlot: string;
  cardInstanceId?: string;
  sourceId: MatchCharacterId;
  zones: ZoneName[];
  zone: ZoneName;
  xValue: number;
  xRange?: { min: number; max: number } | null;
  choices: { index: number; label: string }[];
  choiceIndex: number;
  targets: { id: MatchCharacterId; label: string }[];
  targetId: MatchCharacterId;
  redirectOptions: RedirectOption[];
  redirectTargetId?: MatchCharacterId;
  scry?: ScryState | null;
  seek?: SeekState | null;
  search?: SearchState | null;
  needsPushDirection: boolean;
  pushDirection?: "left" | "right";
};

const getCardBySlot = (character: Character | undefined, slot: string) => {
  if (!character) return undefined;
  const card = character.cards.find((entry) => entry.slot === slot);
  if (card) return card;
  return character.createdCards?.find((entry) => entry.slot === slot);
};

const getCardByInstance = (instance: CardInstance) => {
  const owner = getCharacter(roster, instance.characterId);
  return getCardBySlot(owner, instance.cardSlot);
};

const getTeamIdFromMatchCharacterId = (matchId: MatchCharacterId) => {
  if (matchId.startsWith("p1:")) return "p1" as const;
  if (matchId.startsWith("p2:")) return "p2" as const;
  return null;
};

const getMemberById = (
  state: MatchState,
  matchId: MatchCharacterId
): TeamLookup | null => {
  const teamId = getTeamIdFromMatchCharacterId(matchId);
  if (teamId) {
    const team = state.players[teamId];
    const member = team.characters.find((entry) => entry.id === matchId);
    return member ? { teamId, team, member } : null;
  }
  for (const candidateId of ["p1", "p2"] as PlayerId[]) {
    const team = state.players[candidateId];
    const member = team.characters.find((entry) => entry.id === matchId);
    if (member) return { teamId: candidateId, team, member };
  }
  return null;
};

const formatMemberLabel = (state: MatchState, matchId: MatchCharacterId) => {
  const entry = getMemberById(state, matchId);
  if (!entry) return matchId;
  return `${entry.team.name}: ${entry.member.name}`;
};

const pileLabelMap: Record<PileType, string> = {
  deck: "Deck",
  discard: "Discard",
  exhausted: "Exhausted",
};

const getPileInstances = (
  player: MatchState["players"][PlayerId],
  pile: PileType
) => {
  if (pile === "deck") return player.deck;
  if (pile === "discard") return player.discard;
  return player.exhausted;
};

const summarizePile = (instances: CardInstance[]): PileSummary[] => {
  const map = new Map<string, PileSummary>();
  instances.forEach((instance) => {
    const card = getCardByInstance(instance);
    const owner = getCharacter(roster, instance.characterId);
    const ownerLabel = owner ? `${owner.name} (${owner.version})` : instance.characterId;
    const name = card?.name ?? instance.cardSlot;
    const types = card ? card.types.join(" / ") : "Unknown";
    const key = `${instance.cardSlot}-${name}-${instance.characterId}`;
    const entry = map.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      map.set(key, { name, slot: instance.cardSlot, count: 1, types, owner: ownerLabel });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const isUltimateCard = (card: Card) =>
  card.types.some((type) => type.toLowerCase() === "ultimate");

const isStatusActive = (state?: TeamMember["statuses"][string]) => {
  if (!state) return false;
  if (state.potency > 0) return state.count > 0;
  if (state.stack > 0) return true;
  return state.value > 0;
};

const getStatusStat = (
  member: TeamMember,
  status: string,
  stat: "potency" | "count" | "stack" | "value"
) => {
  const state = member.statuses[status];
  if (!isStatusActive(state)) return 0;
  return state[stat];
};

const getEnergyCostAdjustment = (member: TeamMember) => {
  const focus = getStatusStat(member, "Focus", "potency");
  const strain = getStatusStat(member, "Strain", "potency");
  const bloodFocus = getStatusStat(member, "Blood Focus", "value");
  return strain - focus - bloodFocus;
};

const getAdjustedEnergyCost = (
  member: TeamMember,
  cost: ReturnType<typeof parseCost>,
  xValue: number,
  cardInstance?: CardInstance,
  followUpAdjustment = 0
) => {
  const variableEnergy =
    cost.variable?.type === "energy" ? cost.variable.multiplier * xValue : 0;
  const base =
    cost.energy +
    variableEnergy +
    getEnergyCostAdjustment(member) +
    (cardInstance?.costAdjustment ?? 0) +
    followUpAdjustment;
  return Math.max(0, base);
};

const canAffordWithAdjustments = (
  team: Team,
  member: TeamMember,
  cost: ReturnType<typeof parseCost>,
  xValue: number,
  cardInstance?: CardInstance,
  followUpAdjustment = 0
) => {
  const energyCost = getAdjustedEnergyCost(
    member,
    cost,
    xValue,
    cardInstance,
    followUpAdjustment
  );
  const variableUltimate =
    cost.variable?.type === "ultimate" ? cost.variable.multiplier * xValue : 0;
  const ultimateCost = cost.ultimate + variableUltimate;
  return team.energy >= energyCost && team.ultimate >= ultimateCost;
};

const getMaxX = (
  team: Team,
  member: TeamMember,
  cost: ReturnType<typeof parseCost>,
  cardInstance?: CardInstance,
  followUpAdjustment = 0
) => {
  if (!cost.variable) return 0;
  const available =
    cost.variable.type === "energy"
      ? team.energy -
        Math.max(
          0,
          cost.energy +
            getEnergyCostAdjustment(member) +
            (cardInstance?.costAdjustment ?? 0) +
            followUpAdjustment
        )
      : team.ultimate - cost.ultimate;
  if (available <= 0) return 0;
  return Math.floor(available / cost.variable.multiplier);
};

const formatRoles = (roles: string[]) =>
  roles.map((role) => role.replace("role-", "")).join(", ");

const formatStatusValue = (state: TeamMember["statuses"][string]) => {
  if (state.potency > 0 || state.count > 0) {
    return `P${state.potency}/C${state.count}`;
  }
  if (state.stack > 0) {
    return `${state.stack}`;
  }
  if (state.value > 0) {
    return `${state.value}`;
  }
  return null;
};

const formatStatusList = (statuses: TeamMember["statuses"]) =>
  Object.entries(statuses)
    .map(([status, state]) => {
      const value = formatStatusValue(state);
      return value ? [status, value] : null;
    })
    .filter((entry): entry is [string, string] => entry !== null);

const zoneRank: Record<ZoneName, number> = { slow: 0, normal: 1, fast: 2 };

const zoneLabel = (zone: ZoneName) => zone.charAt(0).toUpperCase() + zone.slice(1);

type StackLifecycle = {
  label: string;
  tone: "active" | "paused" | "queued" | "cancelled";
};

const getStackLifecycleTag = (
  entry: StackEntry,
  zone: { isActive: boolean; isPaused: boolean },
  index: number
): StackLifecycle => {
  if (entry.cancelledBeforeUse) {
    return { label: "Cancelled", tone: "cancelled" };
  }
  if (zone.isActive && index === 0) {
    return { label: "Resolving", tone: "active" };
  }
  if (zone.isPaused) {
    return { label: "Paused", tone: "paused" };
  }
  if (index === 0) {
    return { label: "Next", tone: "queued" };
  }
  return { label: "Queued", tone: "queued" };
};

const getLegalZonesForSpeed = (speed: string): ZoneName[] => {
  const normalized = speed.trim().toLowerCase();
  if (normalized.includes("fast")) return ["fast", "normal", "slow"];
  if (normalized.includes("normal")) return ["normal", "slow"];
  return ["slow"];
};

const getSpeedShift = (member: TeamMember) => {
  const haste = Math.min(2, getStatusStat(member, "Haste", "potency"));
  const slow = Math.min(2, getStatusStat(member, "Slow", "potency"));
  return Math.max(-2, Math.min(2, haste - slow));
};

const getEffectiveSpeed = (
  speed: string,
  member: TeamMember
) => {
  const shift = getSpeedShift(member);
  if (shift === 0) return speed;
  const normalized = speed.trim().toLowerCase();
  const order = ["slow", "normal", "fast"];
  const labels = ["Slow", "Normal", "Fast"];
  const index = order.findIndex((entry) => normalized.includes(entry));
  if (index === -1) return speed;
  const nextIndex = Math.max(0, Math.min(order.length - 1, index + shift));
  return labels[nextIndex];
};

const getXRangeFromText = (card: Card) => {
  for (const line of card.effect) {
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

const getFollowUpCostAdjustment = (card: Card) => {
  for (const line of card.effect) {
    const match = line.match(/On Follow-Up:\s*([+-]\d+)\s+Energy Cost/i);
    if (match) {
      const value = Number(match[1]);
      if (!Number.isNaN(value)) return value;
    }
  }
  return 0;
};

type PendingWindowContext = {
  type: "after_use" | "counter";
  zone: ZoneName;
  playerId: PlayerId;
  counterTargetId?: MatchCharacterId;
};

const getPendingWindow = (state: MatchState): PendingWindowContext | null => {
  if (!state.pendingResolution) return null;
  const nextActionId = state.actionId + 1;
  if (state.pendingResolution.window === "counter") {
    const window = state.counterWindow;
    if (!window || window.validForAction !== nextActionId) return null;
    return {
      type: "counter",
      zone: window.zone,
      playerId: window.by,
      counterTargetId: window.targetId,
    };
  }
  const window = state.afterUseWindow;
  if (!window || window.validForAction !== nextActionId) return null;
  return {
    type: "after_use",
    zone: window.zone,
    playerId: window.lastUsedBy,
  };
};

const getPlayableZones = (
  card: Card,
  state: MatchState,
  member: TeamMember
): ZoneName[] => {
  const effectiveSpeed = getEffectiveSpeed(card.speed, member);
  const legal = getLegalZonesForSpeed(effectiveSpeed);
  const pendingWindow = getPendingWindow(state);
  if (pendingWindow) {
    return legal.includes(pendingWindow.zone) ? [pendingWindow.zone] : [];
  }
  if (!state.activeZone) return legal;
  return legal.filter(
    (zone) => zone === state.activeZone || zoneRank[zone] > zoneRank[state.activeZone!]
  );
};

const getCardKeywords = (card: Card) => {
  const flags = { followUp: false, assistAttack: false };
  card.effect.forEach((line) => {
    const normalized = line.trim().replace(/\.$/, "").toLowerCase();
    if (normalized === "follow-up") flags.followUp = true;
    if (normalized === "assist attack") flags.assistAttack = true;
  });
  return flags;
};

const getTextChoiceOptions = (card: Card) => {
  const choiceIndex = card.effect.findIndex(
    (line) => line.trim().toLowerCase().replace(/\.$/, "") === "choose 1:"
  );
  if (choiceIndex === -1) return [];
  const options: string[] = [];
  for (let index = choiceIndex + 1; index < card.effect.length; index += 1) {
    const line = card.effect[index]?.trim();
    if (!line) continue;
    if (/^if\s+/i.test(line)) continue;
    if (/^innate\b/i.test(line)) continue;
    if (/^retain\b/i.test(line)) continue;
    options.push(line);
  }
  return options;
};

const normalizeLine = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeText = (value: string) => normalizeLine(value).replace(/\.$/, "");

const getActiveEffectLines = (card: Card, choiceIndex: number) => {
  const options = getTextChoiceOptions(card);
  if (!options.length) return card.effect;
  const normalizedOptions = options.map((option) => normalizeText(option).toLowerCase());
  const normalizedChoice =
    normalizedOptions[choiceIndex] ?? normalizedOptions[0] ?? "";
  return card.effect.filter((line) => {
    const normalized = normalizeText(line).toLowerCase();
    if (normalized === "choose 1:") return false;
    if (normalizedOptions.includes(normalized) && normalized !== normalizedChoice) {
      return false;
    }
    return true;
  });
};

const parseScryCount = (lines: string[], xValue: number) => {
  for (const line of lines) {
    const match = normalizeText(line).match(/Scry\s+(\d+|X)/i);
    if (!match) continue;
    const token = match[1].toLowerCase();
    const count = token === "x" ? xValue : Number(token);
    if (!Number.isNaN(count)) return count;
  }
  return null;
};

const parseSeekInfo = (lines: string[], xValue: number) => {
  for (const line of lines) {
    const match = normalizeLine(line).match(/Seek\s+(\d+|X)\s*\((.+)\)/i);
    if (!match) continue;
    const token = match[1].toLowerCase();
    const count = token === "x" ? xValue : Number(token);
    if (Number.isNaN(count)) continue;
    const parts = match[2].split(",");
    const criteria = parts[0]?.trim();
    const takeRaw = parts[1]?.trim();
    const take = takeRaw ? Number(takeRaw) : 1;
    if (!criteria || Number.isNaN(take)) continue;
    return { count, criteria, take };
  }
  return null;
};

const parseSearchCriteria = (lines: string[]) => {
  for (const line of lines) {
    const match = normalizeText(line).match(/Search(?:\s+your\s+draw\s+pile)?\s+for\s+(.+)/i);
    if (!match) continue;
    const criteria = match[1].trim().replace(/\.$/, "");
    return criteria || null;
  }
  return null;
};

const parseRedirectSpec = (lines: string[]) => {
  for (const line of lines) {
    const match = normalizeLine(line).match(/^Redirect\s*\(([^)]+)\)/i);
    if (match) return match[1].trim();
  }
  return null;
};

const parsePushAmount = (lines: string[], xValue: number) => {
  for (const line of lines) {
    const match = normalizeText(line).match(/^Push\s+(\d+|X)/i);
    if (!match) continue;
    const token = match[1].toLowerCase();
    const amount = token === "x" ? xValue : Number(token);
    if (!Number.isNaN(amount)) return amount;
  }
  return null;
};

const isSingleTargetCard = (card: Card) => {
  const targetText = card.target.toLowerCase();
  if (!targetText) return false;
  if (targetText.includes("random") || targetText.includes("all")) return false;
  if (card.types.some((type) => ["aoe", "area"].includes(type.toLowerCase()))) return false;
  return (
    targetText.includes("enemy") ||
    targetText.includes("ally") ||
    targetText.includes("self")
  );
};

const getTopCards = (deck: CardInstance[], count: number) => {
  if (count <= 0) return [];
  return deck.slice(Math.max(0, deck.length - count)).reverse();
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
    return tags.every((tag) => card.types.some((type) => type.toLowerCase() === tag));
  }

  const cleaned = normalized.replace(/\b(a|an|the|card|cards)\b/g, "").trim();
  if (!cleaned) return true;
  return normalizeText(card.name).toLowerCase().includes(cleaned);
};

const parseCoverScope = (statusName: string) => {
  const normalized = normalizeText(statusName).toLowerCase();
  return normalized.includes("adjacent") ? "adjacent" : "all";
};

const getRedirectSpecTargets = (
  state: MatchState,
  sourceId: MatchCharacterId,
  targetId: MatchCharacterId,
  spec: string
) => {
  const normalized = normalizeText(spec).toLowerCase();
  const sourceEntry = getMemberById(state, sourceId);
  if (!sourceEntry) return [];
  const sourceTeam = sourceEntry.team;
  const enemyTeam = state.players[sourceTeam.id === "p1" ? "p2" : "p1"];

  if (normalized.includes("self")) return [sourceId];
  if (normalized.includes("target")) return [targetId];
  if (normalized.includes("ally")) {
    return sourceTeam.characters.filter((member) => !member.defeated).map((member) => member.id);
  }
  if (normalized.includes("enemy") || normalized.includes("opponent")) {
    return enemyTeam.characters.filter((member) => !member.defeated).map((member) => member.id);
  }
  return [];
};

const buildRedirectOptions = (
  state: MatchState,
  card: Card,
  sourceId: MatchCharacterId,
  targetId: MatchCharacterId,
  choiceIndex: number
) => {
  if (!isSingleTargetCard(card)) return [];
  const legalTargets = getLegalTargets(card, sourceId, state, roster);
  if (!legalTargets.length) return [];
  const legalSet = new Set(legalTargets);
  const options: RedirectOption[] = [];
  const lines = getActiveEffectLines(card, choiceIndex);
  const isAttack = card.types.some((type) => type.toLowerCase() === "attack");

  if (isAttack) {
    const targetEntry = getMemberById(state, targetId);
    if (targetEntry) {
      const targetMember = targetEntry.member;
      targetEntry.team.characters.forEach((member) => {
        if (member.defeated || member.id === targetMember.id) return;
        const statusNames = Object.keys(member.statuses).filter((status) =>
          normalizeText(status).toLowerCase().startsWith("cover")
        );
        statusNames.forEach((status) => {
          if (!isStatusActive(member.statuses[status])) return;
          const scope = parseCoverScope(status);
          if (scope === "adjacent" && Math.abs(member.position - targetMember.position) !== 1) {
            return;
          }
          if (!legalSet.has(member.id)) return;
          options.push({
            id: member.id,
            label: `${formatMemberLabel(state, member.id)} (Cover)`,
            source: "cover",
          });
        });
      });
    }
  }

  const spec = parseRedirectSpec(lines);
  if (spec) {
    const candidates = getRedirectSpecTargets(state, sourceId, targetId, spec);
    candidates.forEach((candidate) => {
      if (!legalSet.has(candidate)) return;
      options.push({
        id: candidate,
        label: `${formatMemberLabel(state, candidate)} (Redirect)`,
        source: "redirect",
      });
    });
  }

  const deduped = new Map<MatchCharacterId, RedirectOption>();
  options.forEach((option) => {
    if (!deduped.has(option.id)) deduped.set(option.id, option);
  });

  return Array.from(deduped.values()).sort((left, right) =>
    left.label.localeCompare(right.label)
  );
};

const buildScryState = (
  state: MatchState,
  card: Card,
  sourceId: MatchCharacterId,
  xValue: number,
  choiceIndex: number,
  previous?: ScryState | null
) => {
  const lines = getActiveEffectLines(card, choiceIndex);
  const count = parseScryCount(lines, xValue);
  if (!count || count <= 0) return null;
  const teamId = getTeamIdFromMatchCharacterId(sourceId);
  if (!teamId) return null;
  const cards = getTopCards(state.players[teamId].deck, count);
  const cardIds = cards.map((instance) => instance.id);
  let discardIds = previous?.discardIds?.filter((id) => cardIds.includes(id)) ?? [];
  let orderIds =
    previous?.orderIds?.filter((id) => cardIds.includes(id)) ?? [...cardIds];
  const remainingIds = cardIds.filter((id) => !discardIds.includes(id));
  orderIds = orderIds.filter((id) => remainingIds.includes(id));
  if (orderIds.length !== remainingIds.length) {
    orderIds = remainingIds;
  }
  return { cards, discardIds, orderIds };
};

const buildSeekState = (
  state: MatchState,
  card: Card,
  sourceId: MatchCharacterId,
  xValue: number,
  choiceIndex: number,
  previous?: SeekState | null
) => {
  const lines = getActiveEffectLines(card, choiceIndex);
  const seek = parseSeekInfo(lines, xValue);
  if (!seek || seek.count <= 0) return null;
  const teamId = getTeamIdFromMatchCharacterId(sourceId);
  if (!teamId) return null;
  const cards = getTopCards(state.players[teamId].deck, seek.count);
  const cardIds = cards.map((instance) => instance.id);
  const takeIds = previous?.takeIds?.filter((id) => cardIds.includes(id));
  return { cards, takeIds, take: seek.take, criteria: seek.criteria };
};

const buildSearchState = (
  state: MatchState,
  card: Card,
  sourceId: MatchCharacterId,
  choiceIndex: number,
  previous?: SearchState | null
) => {
  const lines = getActiveEffectLines(card, choiceIndex);
  const criteria = parseSearchCriteria(lines);
  if (!criteria) return null;
  const teamId = getTeamIdFromMatchCharacterId(sourceId);
  if (!teamId) return null;
  const instances = state.players[teamId].deck.filter((instance) => {
    const found = getCardByInstance(instance);
    return found ? matchesSearchCriteria(found, criteria) : false;
  });
  const grouped = new Map<string, { id: string; label: string; count: number }>();
  instances.forEach((instance) => {
    const cardEntry = getCardByInstance(instance);
    const owner = getCharacter(roster, instance.characterId);
    const ownerLabel = owner ? owner.name : instance.characterId;
    const name = cardEntry?.name ?? instance.cardSlot;
    const key = `${instance.cardSlot}-${instance.characterId}`;
    const label = `${name} (${ownerLabel})`;
    const entry = grouped.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      grouped.set(key, { id: instance.id, label, count: 1 });
    }
  });
  const options = Array.from(grouped.values()).map((entry) => ({
    id: entry.id,
    label: entry.count > 1 ? `${entry.label} x${entry.count}` : entry.label,
  }));
  options.sort((left, right) => left.label.localeCompare(right.label));
  const pickId =
    previous?.pickId && options.some((option) => option.id === previous.pickId)
      ? previous.pickId
      : undefined;
  return { options, pickId, criteria };
};

const needsPushDirection = (
  state: MatchState,
  card: Card,
  sourceId: MatchCharacterId,
  targetId: MatchCharacterId,
  xValue: number,
  choiceIndex: number
) => {
  const lines = getActiveEffectLines(card, choiceIndex);
  const amount = parsePushAmount(lines, xValue);
  if (!amount || amount <= 0) return false;
  const sourceEntry = getMemberById(state, sourceId);
  const targetEntry = getMemberById(state, targetId);
  if (!sourceEntry || !targetEntry) return false;
  return sourceEntry.member.position === targetEntry.member.position;
};

const canReactAfterUse = (
  state: MatchState,
  card: Card,
  sourceId: MatchCharacterId
) => {
  const pendingWindow = getPendingWindow(state);
  if (!pendingWindow || pendingWindow.type !== "after_use") return false;
  const window = state.afterUseWindow;
  if (!window || window.validForAction !== state.actionId + 1) return false;
  const teamId = getTeamIdFromMatchCharacterId(sourceId);
  if (!teamId || teamId !== pendingWindow.playerId) return false;
  const ownerEntry = getMemberById(state, sourceId);
  if (!ownerEntry || ownerEntry.member.defeated) return false;
  const zones = getPlayableZones(card, state, ownerEntry.member);
  if (!zones.length) return false;
  const flags = getCardKeywords(card);
  let followUpAllowed = flags.followUp;
  if (!followUpAllowed) {
    const lastUsed = getMemberById(state, window.lastUsedCharacterId);
    const timeStop = lastUsed
      ? isStatusActive(lastUsed.member.statuses["The World: Time Stop"])
      : false;
    if (timeStop && card.types.some((type) => type.toLowerCase() === "attack")) {
      followUpAllowed = true;
    }
  }
  if (followUpAllowed && window.lastUsedCharacterId === sourceId) return true;
  if (flags.assistAttack && window.lastUsedCharacterId !== sourceId) return true;
  return false;
};

const canReactCounter = (state: MatchState, card: Card, sourceId: MatchCharacterId) => {
  const pendingWindow = getPendingWindow(state);
  if (!pendingWindow || pendingWindow.type !== "counter") return false;
  const teamId = getTeamIdFromMatchCharacterId(sourceId);
  if (!teamId || teamId !== pendingWindow.playerId) return false;
  const ownerEntry = getMemberById(state, sourceId);
  if (!ownerEntry || ownerEntry.member.defeated) return false;
  const zones = getPlayableZones(card, state, ownerEntry.member);
  if (!zones.length) return false;
  const targetId = pendingWindow.counterTargetId;
  if (!targetId) return false;
  const legalTargets = getLegalTargets(card, sourceId, state, roster);
  return legalTargets.includes(targetId);
};

const getReactivePlayers = (state: MatchState) => {
  const pendingWindow = getPendingWindow(state);
  return pendingWindow ? [pendingWindow.playerId] : [];
};

const getCardChoices = (card: Card) => {
  const choice = card.effects?.find((effect) => effect.type === "choose");
  if (choice && choice.type === "choose") {
    return choice.options.map((option, index) => ({
      index,
      label: option.label ?? `Option ${index + 1}`,
    }));
  }
  const textChoices = getTextChoiceOptions(card);
  if (!textChoices.length) return [];
  return textChoices.map((option, index) => ({
    index,
    label: option,
  }));
};

type LogKind = "played" | "used" | "cancelled";

const logKindLabels: Record<LogKind, string> = {
  played: "Played",
  used: "Used",
  cancelled: "Cancelled",
};

type LogEntry = {
  summary: string;
  details?: string[];
  kind?: LogKind;
};

type LogGroup = {
  title: string;
  entries: LogEntry[];
};

type CombatPlaybackPhase = "pairing" | "roll" | "impact";

type CombatLogEvent = {
  kind: "damage" | "shield" | "heal" | "overpower" | "cancelled" | "negate";
  source?: string;
  target?: string;
  amount?: number;
  cardNames?: string[];
  line: string;
};

type CombatPlayback = {
  resolution: CombatResolution;
  stepIndex: number;
  phase: CombatPlaybackPhase;
  stepEvents: CombatLogEvent[][];
};

const parseLogEntry = (line: string): LogEntry => {
  const dealMatch = line.match(/^(.+?) deals (\d+) damage to (.+?)\.$/);
  if (dealMatch) {
    const [, source, amount, target] = dealMatch;
    return { summary: `${source} deals ${amount} damage`, details: [`Target: ${target}`] };
  }
  const takeMatch = line.match(/^(.+?) takes (\d+) damage from (.+?)\.$/);
  if (takeMatch) {
    const [, target, amount, source] = takeMatch;
    return { summary: `${target} takes ${amount} damage`, details: [`Source: ${source}`] };
  }
  const healMatch = line.match(/^(.+?) heals (\d+) HP(?: from (.+?))?\.$/);
  if (healMatch) {
    const [, target, amount, source] = healMatch;
    const details = source ? [`Source: ${source}`] : undefined;
    return { summary: `${target} heals ${amount} HP`, details };
  }
  const shieldMatch = line.match(/^(.+?) gains (\d+) shield\.$/);
  if (shieldMatch) {
    const [, target, amount] = shieldMatch;
    return { summary: `${target} gains ${amount} shield` };
  }
  const coverRedirectMatch = line.match(/uses Cover to redirect the attack\.$/i);
  if (coverRedirectMatch) {
    return { summary: line };
  }
  const useMatch = line.match(/^(.+?) uses (.+?)\.$/);
  if (useMatch) {
    const [, player, cardName] = useMatch;
    return { summary: `${player} uses ${cardName}`, kind: "used" };
  }
  const playMatch = line.match(/^(.+?) plays (.+?) in the (.+?) Zone\.$/);
  if (playMatch) {
    const [, player, cardName, zoneName] = playMatch;
    return {
      summary: `${player} plays ${cardName}`,
      details: [`Zone: ${zoneName}`],
      kind: "played",
    };
  }
  const overpowerMatch = line.match(/^(.+?) overpowers (.+?)\.$/);
  if (overpowerMatch) {
    const [, winner, loser] = overpowerMatch;
    return {
      summary: `${winner} overpowers ${loser}`,
      details: [`Cancelled: ${loser}`],
      kind: "cancelled",
    };
  }
  if (line.toLowerCase().includes("cancelled")) {
    return { summary: line, kind: "cancelled" };
  }
  return { summary: line };
};

const groupLogEntries = (entries: string[]): LogGroup[] => {
  if (entries.length === 0) return [];
  const groups: LogGroup[] = [];
  let current: LogGroup = { title: "Timeline", entries: [] };

  entries.forEach((line) => {
    const turnMatch = line.match(/^Turn\s+\d+\s+begins\./);
    if (turnMatch) {
      if (current.entries.length > 0) {
        groups.push(current);
      }
      current = { title: line, entries: [] };
      return;
    }
    current.entries.push(parseLogEntry(line));
  });

  if (current.entries.length > 0) {
    groups.push(current);
  }
  return groups;
};

const parseCombatLogEvent = (line: string): CombatLogEvent | null => {
  const dealMatch = line.match(/^(.+?) deals (\d+) damage to (.+?)\.$/);
  if (dealMatch) {
    const [, source, amount, target] = dealMatch;
    return { kind: "damage", source, target, amount: Number(amount), line };
  }
  const takeMatch = line.match(/^(.+?) takes (\d+) damage from (.+?)\.$/);
  if (takeMatch) {
    const [, target, amount, source] = takeMatch;
    return { kind: "damage", source, target, amount: Number(amount), line };
  }
  const healMatch = line.match(/^(.+?) heals (\d+) HP(?: from (.+?))?\.$/);
  if (healMatch) {
    const [, target, amount, source] = healMatch;
    return { kind: "heal", source, target, amount: Number(amount), line };
  }
  const shieldMatch = line.match(/^(.+?) gains (\d+) shield\.$/);
  if (shieldMatch) {
    const [, target, amount] = shieldMatch;
    return { kind: "shield", target, amount: Number(amount), line };
  }
  const overpowerMatch = line.match(/^(.+?) overpowers (.+?)\.$/);
  if (overpowerMatch) {
    const [, winner, loser] = overpowerMatch;
    return { kind: "overpower", cardNames: [winner, loser], line };
  }
  const clashMatch = line.match(/^(.+?) and (.+?) clash and are both cancelled\.$/);
  if (clashMatch) {
    const [, left, right] = clashMatch;
    return { kind: "cancelled", cardNames: [left, right], line };
  }
  const negateMatch = line.match(/^(.+?) negates (.+?)\.$/);
  if (negateMatch) {
    const [, source, target] = negateMatch;
    return { kind: "negate", cardNames: [source, target], line };
  }
  return null;
};

const getStepMatchNames = (
  state: MatchState,
  step: CombatResolution["steps"][number]
) => {
  const names = new Set<string>();
  const cardNames = new Set<string>();
  const addEntry = (entry?: CombatResolution["steps"][number]["left"]) => {
    if (!entry) return;
    cardNames.add(entry.cardName);
    const source = getMemberById(state, entry.sourceId);
    if (source) names.add(source.member.name);
    const target = getMemberById(state, entry.targetId);
    if (target) names.add(target.member.name);
  };
  addEntry(step.left);
  addEntry(step.right);
  return { names, cardNames };
};

const buildCombatStepEvents = (
  state: MatchState,
  resolution: CombatResolution
) => {
  const stepEvents = resolution.steps.map(() => [] as CombatLogEvent[]);
  const events = state.log
    .slice(resolution.logStart, resolution.logEnd)
    .map((line) => parseCombatLogEvent(line))
    .filter((entry): entry is CombatLogEvent => Boolean(entry));
  let cursor = 0;
  events.forEach((event) => {
    for (let index = cursor; index < resolution.steps.length; index += 1) {
      const step = resolution.steps[index];
      const { names, cardNames } = getStepMatchNames(state, step);
      const cardMatch =
        event.cardNames?.some((name) => cardNames.has(name)) ?? false;
      const nameMatch =
        (event.source && names.has(event.source)) ||
        (event.target && names.has(event.target));
      if (cardMatch || nameMatch) {
        stepEvents[index].push(event);
        cursor = index;
        return;
      }
    }
  });
  return stepEvents;
};

const normalizeKey = (value: string) => value.trim().toLowerCase();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type KeywordMatcher = {
  keyword: Keyword;
  regex: RegExp;
};

const buildKeywordMatchers = (list: Keyword[]): KeywordMatcher[] =>
  [...list]
    .sort((a, b) => b.name.length - a.name.length)
    .map((keyword) => ({
      keyword,
      regex: new RegExp(`\\b${escapeRegex(keyword.name)}\\b`, "i"),
    }));

const findKeywordMatch = (line: string, matchers: KeywordMatcher[]) =>
  matchers.find((matcher) => matcher.regex.test(line));

type StatusPrimaryStat = "potency" | "stack" | "value";

type StatusDisplayInfo = {
  modeLabel: string;
  turnEnd: string;
  primaryStat: StatusPrimaryStat;
};

const getStatusModeLabel = (status: StatusEffectDefinition) => {
  if (status.potencyMax !== undefined || status.countMax !== undefined) return "P/C";
  if (status.stackMax !== undefined) return "S";
  if (status.valueMax !== undefined) return "V";
  return "None";
};

const getStatusPrimaryStat = (status: StatusEffectDefinition): StatusPrimaryStat => {
  if (status.potencyMax !== undefined || status.countMax !== undefined) return "potency";
  if (status.stackMax !== undefined) return "stack";
  return "value";
};

const getStatusTurnEnd = (status: StatusEffectDefinition) => {
  const turnEndRules = status.rules
    .filter((rule) => rule.timing.trim().toLowerCase() === "turn end")
    .map((rule) => rule.text.trim())
    .filter(Boolean);
  if (!turnEndRules.length) return "No change";
  return turnEndRules.join(" / ");
};

const getStatusPrimaryValue = (
  member: TeamMember,
  status: string,
  lookup: Map<string, StatusDisplayInfo>
) => {
  const state = member.statuses[status];
  if (!state) return 0;
  const primaryStat = lookup.get(normalizeKey(status))?.primaryStat ?? "value";
  if (primaryStat === "potency") {
    return state.potency > 0 && state.count > 0 ? state.potency : 0;
  }
  if (primaryStat === "stack") return state.stack;
  return state.value;
};

type SoundEffect =
  | "click"
  | "confirm"
  | "error"
  | "card"
  | "pass"
  | "turn"
  | "victory"
  | "open"
  | "swap"
  | "roll"
  | "clash"
  | "hit"
  | "shield"
  | "heal";

type DeckPulse = "draw" | "shuffle" | null;

const useSoundEffects = (enabled: boolean, volume: number) => {
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      const current = audioRef.current;
      if (current) {
        current.close().catch(() => undefined);
      }
    };
  }, []);

  const play = useCallback(
    (effect: SoundEffect) => {
      if (!enabled || volume <= 0) return;
      if (typeof window === "undefined") return;
      const audioContextCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!audioContextCtor) return;
      if (!audioRef.current) {
        audioRef.current = new audioContextCtor();
      }
      const ctx = audioRef.current;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => undefined);
      }

      const now = ctx.currentTime;
      const maxVolume = Math.max(0.001, Math.min(1, volume));
      const scheduleTone = ({
        start = 0,
        duration,
        freq,
        freqEnd,
        type = "sine",
        gain = 0.2,
      }: {
        start?: number;
        duration: number;
        freq: number;
        freqEnd?: number;
        type?: OscillatorType;
        gain?: number;
      }) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(freq, now + start);
        if (freqEnd) {
          oscillator.frequency.exponentialRampToValueAtTime(
            freqEnd,
            now + start + duration
          );
        }
        const peak = Math.max(0.001, gain * maxVolume);
        const attack = Math.min(0.02, duration / 3);
        const release = Math.min(0.12, duration);
        gainNode.gain.setValueAtTime(0.0001, now + start);
        gainNode.gain.exponentialRampToValueAtTime(peak, now + start + attack);
        gainNode.gain.exponentialRampToValueAtTime(
          0.0001,
          now + start + duration + release
        );
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start(now + start);
        oscillator.stop(now + start + duration + release);
      };

      switch (effect) {
        case "click":
          scheduleTone({
            freq: 520,
            freqEnd: 380,
            duration: 0.05,
            type: "square",
            gain: 0.15,
          });
          break;
        case "confirm":
          scheduleTone({
            freq: 440,
            freqEnd: 640,
            duration: 0.08,
            type: "triangle",
            gain: 0.22,
          });
          scheduleTone({
            start: 0.07,
            freq: 640,
            freqEnd: 760,
            duration: 0.08,
            type: "triangle",
            gain: 0.18,
          });
          break;
        case "card":
          scheduleTone({
            freq: 240,
            freqEnd: 460,
            duration: 0.12,
            type: "sawtooth",
            gain: 0.2,
          });
          scheduleTone({
            start: 0.05,
            freq: 460,
            freqEnd: 360,
            duration: 0.08,
            type: "sine",
            gain: 0.15,
          });
          break;
        case "pass":
          scheduleTone({
            freq: 260,
            freqEnd: 180,
            duration: 0.1,
            type: "sine",
            gain: 0.16,
          });
          break;
        case "turn":
          scheduleTone({
            freq: 330,
            freqEnd: 520,
            duration: 0.12,
            type: "triangle",
            gain: 0.2,
          });
          scheduleTone({
            start: 0.1,
            freq: 520,
            freqEnd: 660,
            duration: 0.1,
            type: "triangle",
            gain: 0.18,
          });
          break;
        case "error":
          scheduleTone({
            freq: 220,
            freqEnd: 120,
            duration: 0.2,
            type: "sawtooth",
            gain: 0.2,
          });
          break;
        case "victory":
          scheduleTone({ freq: 392, duration: 0.12, type: "sine", gain: 0.18 });
          scheduleTone({ start: 0.12, freq: 494, duration: 0.12, type: "sine", gain: 0.18 });
          scheduleTone({ start: 0.24, freq: 587, duration: 0.16, type: "sine", gain: 0.2 });
          break;
        case "open":
          scheduleTone({
            freq: 360,
            freqEnd: 520,
            duration: 0.09,
            type: "triangle",
            gain: 0.16,
          });
          break;
        case "swap":
          scheduleTone({
            freq: 300,
            freqEnd: 420,
            duration: 0.1,
            type: "square",
            gain: 0.16,
          });
          break;
        case "roll":
          scheduleTone({
            freq: 560,
            freqEnd: 640,
            duration: 0.05,
            type: "triangle",
            gain: 0.14,
          });
          scheduleTone({
            start: 0.06,
            freq: 520,
            freqEnd: 720,
            duration: 0.06,
            type: "triangle",
            gain: 0.12,
          });
          scheduleTone({
            start: 0.14,
            freq: 480,
            freqEnd: 760,
            duration: 0.07,
            type: "triangle",
            gain: 0.12,
          });
          break;
        case "clash":
          scheduleTone({
            freq: 200,
            freqEnd: 120,
            duration: 0.18,
            type: "sawtooth",
            gain: 0.22,
          });
          scheduleTone({
            start: 0.08,
            freq: 320,
            freqEnd: 180,
            duration: 0.14,
            type: "square",
            gain: 0.18,
          });
          break;
        case "hit":
          scheduleTone({
            freq: 140,
            freqEnd: 90,
            duration: 0.12,
            type: "sawtooth",
            gain: 0.22,
          });
          break;
        case "shield":
          scheduleTone({
            freq: 420,
            freqEnd: 560,
            duration: 0.12,
            type: "sine",
            gain: 0.16,
          });
          break;
        case "heal":
          scheduleTone({
            freq: 360,
            freqEnd: 520,
            duration: 0.12,
            type: "sine",
            gain: 0.16,
          });
          scheduleTone({
            start: 0.08,
            freq: 520,
            freqEnd: 660,
            duration: 0.12,
            type: "sine",
            gain: 0.14,
          });
          break;
      }
    },
    [enabled, volume]
  );

  return useMemo(() => ({ play }), [play]);
};

type SoundControlsProps = {
  enabled: boolean;
  volume: number;
  onToggle: () => void;
  onVolumeChange: (value: number) => void;
};

const SoundControls = ({
  enabled,
  volume,
  onToggle,
  onVolumeChange,
}: SoundControlsProps) => (
  <div className="ua-sound">
    <button
      type="button"
      className="ua-button ua-button--ghost ua-sound__toggle"
      onClick={onToggle}
      aria-pressed={enabled}
    >
      {enabled ? "SFX On" : "SFX Off"}
    </button>
    <input
      type="range"
      min={0}
      max={100}
      value={Math.round(volume * 100)}
      onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
      aria-label="Sound effects volume"
      disabled={!enabled}
    />
  </div>
);


const App = () => {
  const rosterSorted = useMemo(() => sortRoster(roster), []);
  const keywordMatchers = useMemo(() => buildKeywordMatchers(keywords), [keywords]);
  const statusDetails = useMemo(() => {
    const map = new Map<string, StatusDisplayInfo>();
    statusEffects.forEach((status) => {
      map.set(normalizeKey(status.name), {
        modeLabel: getStatusModeLabel(status),
        turnEnd: getStatusTurnEnd(status),
        primaryStat: getStatusPrimaryStat(status),
      });
    });
    return map;
  }, [statusEffects]);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const resolveCardForDisplay = useCallback(
    (card: Card, sourceId: MatchCharacterId, targetId?: MatchCharacterId) => {
      if (!matchState || !card.transforms?.length) return card;
      const sourceEntry = getMemberById(matchState, sourceId);
      if (!sourceEntry) return card;
      const targetEntry = targetId ? getMemberById(matchState, targetId) : null;
      const character = getCharacter(roster, sourceEntry.member.characterId);
      if (!character) return card;
      let resolved = card;

      card.transforms.forEach((transform) => {
        const condition = transform.condition;
        let shouldTransform = false;
        if (!condition) {
          shouldTransform = true;
        } else {
          switch (condition.kind) {
            case "self_has_status":
              shouldTransform =
                getStatusPrimaryValue(sourceEntry.member, condition.status, statusDetails) >=
                (condition.min ?? 1);
              break;
            case "self_missing_status":
              shouldTransform =
                getStatusPrimaryValue(sourceEntry.member, condition.status, statusDetails) <= 0;
              break;
            case "target_has_status":
              if (!targetEntry) return;
              shouldTransform =
                getStatusPrimaryValue(targetEntry.member, condition.status, statusDetails) >=
                (condition.min ?? 1);
              break;
            case "target_missing_status":
              if (!targetEntry) return;
              shouldTransform =
                getStatusPrimaryValue(targetEntry.member, condition.status, statusDetails) <= 0;
              break;
            default:
              return;
          }
        }
        if (!shouldTransform) return;
        const replacement = getCardBySlot(character, transform.cardSlot);
        if (replacement) {
          resolved = replacement;
        }
      });

      return resolved;
    },
    [matchState, statusDetails]
  );
  const [stage, setStage] = useState<Stage>("setup");
  const [names, setNames] = useState({ p1: "Player 1", p2: "Player 2" });
  const [selection, setSelection] = useState<SelectionState>(defaultSelection);
  const [relayUrl, setRelayUrl] = useState(defaultRelayUrl);
  const [relayName, setRelayName] = useState("Player 1");
  const [relayStatus, setRelayStatus] = useState<RelayConnectionStatus>("idle");
  const [lobbyCode, setLobbyCode] = useState("");
  const [lobby, setLobby] = useState<RelayLobbySnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.55);
  const [skipCombat, setSkipCombat] = useState(getStoredSkipCombat);
  const [combatPlayback, setCombatPlayback] = useState<CombatPlayback | null>(null);
  const [deckPulse, setDeckPulse] = useState<Record<PlayerId, DeckPulse>>({
    p1: null,
    p2: null,
  });
  const [recentlyDealt, setRecentlyDealt] = useState<Record<string, boolean>>({});
  const [pendingPlay, setPendingPlay] = useState<PendingPlay | null>(null);
  const [inspectPile, setInspectPile] = useState<{
    playerId: PlayerId;
    pile: PileType;
  } | null>(null);
  const sound = useSoundEffects(soundEnabled, soundVolume);
  const clientIdRef = useRef(getStoredClientId());
  const socketRef = useRef<WebSocket | null>(null);
  const lobbyRef = useRef<RelayLobbySnapshot | null>(null);
  const selectionRef = useRef(selection);
  const namesRef = useRef(names);
  const matchStateRef = useRef<MatchState | null>(null);
  const syncRequestedRef = useRef(false);
  const winnerRef = useRef<string | null>(null);
  const deckCountsRef = useRef<Record<PlayerId, number>>({ p1: 0, p2: 0 });
  const logIndexRef = useRef(0);
  const handIdsRef = useRef<Set<string>>(new Set());
  const dealtTimeoutsRef = useRef<Map<string, number>>(new Map());
  const deckTimeoutsRef = useRef<Record<PlayerId, number | null>>({
    p1: null,
    p2: null,
  });
  const matchSyncRef = useRef(false);
  const lastResolutionRef = useRef<number | null>(null);
  const combatTimerRef = useRef<number | null>(null);
  const reportMessage = (text: string) => {
    setMessage(text);
    sound.play("error");
  };
  const clientId = clientIdRef.current;
  const isConnected = relayStatus === "connected";
  const isMultiplayer = Boolean(lobby);
  const isHost = lobby?.hostId === clientId;
  const localSeat = isMultiplayer ? (isHost ? "p1" : "p2") : null;
  const hasRemotePlayer = (lobby?.players.length ?? 0) > 1;
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  useEffect(() => {
    namesRef.current = names;
  }, [names]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ua-skip-combat", skipCombat ? "true" : "false");
  }, [skipCombat]);
  useEffect(() => {
    matchStateRef.current = matchState;
  }, [matchState]);
  useEffect(() => {
    lobbyRef.current = lobby;
  }, [lobby]);
  const clearVisualTimers = useCallback(() => {
    dealtTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    dealtTimeoutsRef.current.clear();
    (Object.keys(deckTimeoutsRef.current) as PlayerId[]).forEach((playerId) => {
      const timeoutId = deckTimeoutsRef.current[playerId];
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        deckTimeoutsRef.current[playerId] = null;
      }
    });
  }, []);
  const clearCombatTimer = useCallback(() => {
    if (combatTimerRef.current !== null) {
      window.clearTimeout(combatTimerRef.current);
      combatTimerRef.current = null;
    }
  }, []);
  const resetVisualState = () => {
    clearVisualTimers();
    clearCombatTimer();
    setDeckPulse({ p1: null, p2: null });
    setRecentlyDealt({});
    deckCountsRef.current = { p1: 0, p2: 0 };
    logIndexRef.current = 0;
    handIdsRef.current = new Set();
    matchSyncRef.current = false;
    lastResolutionRef.current = null;
    setCombatPlayback(null);
  };
  const sendRelay = useCallback(
    (payload: Record<string, unknown>) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reportMessage("Relay is not connected.");
        return false;
      }
      socket.send(JSON.stringify(payload));
      return true;
    },
    [reportMessage]
  );
  const broadcastSelectionState = useCallback(
    (payload: SetupSyncPayload) => {
      if (!isMultiplayer || !isHost) return;
      sendRelay({ type: "game_event", event: "selection_update", data: payload });
    },
    [isHost, isMultiplayer, sendRelay]
  );
  const requestSelectionUpdate = useCallback(
    (playerId: PlayerId, selectionUpdate: string[], nameUpdate: string) => {
      if (!isMultiplayer || isHost) return;
      sendRelay({
        type: "game_event",
        event: "selection_request",
        data: { playerId, selection: selectionUpdate, name: nameUpdate },
      });
    },
    [isHost, isMultiplayer, sendRelay]
  );
  const applySetupChange = useCallback(
    (playerId: PlayerId, update: { selection?: string[]; name?: string }) => {
      const nextSelection: SelectionState = {
        p1: [...selectionRef.current.p1],
        p2: [...selectionRef.current.p2],
      };
      const nextNames = { ...namesRef.current };
      if (update.selection) {
        nextSelection[playerId] = [...update.selection];
      }
      if (update.name !== undefined) {
        nextNames[playerId] = update.name;
      }
      setSelection(nextSelection);
      setNames(nextNames);
      if (!isMultiplayer) return;
      if (isHost) {
        broadcastSelectionState({ selection: nextSelection, names: nextNames });
        return;
      }
      if (localSeat === playerId) {
        requestSelectionUpdate(playerId, nextSelection[playerId], nextNames[playerId]);
      }
    },
    [broadcastSelectionState, isHost, isMultiplayer, localSeat, requestSelectionUpdate]
  );
  const applyActionAndSync = useCallback(
    (action: Parameters<typeof applyAction>[1]) => {
      const currentState = matchStateRef.current;
      if (!currentState) return;
      const result = applyAction(currentState, action, roster);
      matchStateRef.current = result.state;
      setMatchState(result.state);
      if (lobbyRef.current && lobbyRef.current.hostId === clientIdRef.current) {
        sendRelay({ type: "game_event", event: "state_update", data: { state: result.state } });
        if (result.error) {
          sendRelay({
            type: "game_event",
            event: "action_error",
            data: { message: result.error },
          });
        }
      }
      if (result.error) {
        reportMessage(result.error);
        return;
      }
      setMessage(null);
      switch (action.type) {
        case "play_card":
          sound.play("card");
          break;
        case "pass":
          sound.play("pass");
          break;
        case "end_turn":
          sound.play("turn");
          break;
        case "move_swap":
          sound.play("swap");
          break;
        case "clear_log":
          sound.play("click");
          break;
      }
      const winnerId = result.state.winnerId ?? null;
      if (winnerId && winnerId !== winnerRef.current) {
        sound.play("victory");
      }
      winnerRef.current = winnerId;
    },
    [reportMessage, sendRelay, sound]
  );
  const dispatchAction = useCallback(
    (action: Parameters<typeof applyAction>[1]) => {
      if (isMultiplayer && localSeat && action.playerId !== localSeat) {
        reportMessage("Not your team.");
        return;
      }
      if (!isMultiplayer) {
        applyActionAndSync(action);
        return;
      }
      if (isHost) {
        applyActionAndSync(action);
        return;
      }
      sendRelay({ type: "game_event", event: "action_request", data: { action } });
    },
    [applyActionAndSync, isHost, isMultiplayer, localSeat, reportMessage, sendRelay]
  );
  const canEditSetup = (playerId: PlayerId) => {
    if (!isMultiplayer) return true;
    if (!hasRemotePlayer) return true;
    return localSeat === playerId;
  };
  const canControlPlayer = (playerId: PlayerId) => !isMultiplayer || localSeat === playerId;
  const relayStatusLabel =
    relayStatus === "connecting"
      ? "Connecting"
      : relayStatus === "connected"
        ? isMultiplayer
          ? "In Lobby"
          : "Connected"
        : "Offline";
  const handleRelayEvent = useCallback(
    (message: RelayEventMessage) => {
      if (message.type === "lobby_event") {
        if (message.event === "return_to_lobby" && message.from !== clientId) {
          setMatchState(null);
          setStage("setup");
          setPendingPlay(null);
          resetVisualState();
          reportMessage("Host returned to lobby.");
        }
        return;
      }

      if (message.event === "selection_update") {
        const data = message.data as SetupSyncPayload | undefined;
        if (data?.selection && data?.names) {
          setSelection(data.selection);
          setNames(data.names);
        }
        return;
      }

      if (message.event === "selection_request") {
        const lobbySnapshot = lobbyRef.current;
        if (!lobbySnapshot || lobbySnapshot.hostId !== clientIdRef.current) return;
        const data = message.data as
          | { playerId?: string; selection?: string[]; name?: string }
          | undefined;
        if (!data) return;
        const playerId = data?.playerId === "p1" || data?.playerId === "p2" ? data.playerId : null;
        if (!playerId) return;
        const nextSelection: SelectionState = {
          p1: [...selectionRef.current.p1],
          p2: [...selectionRef.current.p2],
        };
        const nextNames = { ...namesRef.current };
        if (Array.isArray(data.selection) && data.selection.length === 3) {
          nextSelection[playerId] = [...data.selection];
        }
        if (typeof data.name === "string") {
          nextNames[playerId] = data.name;
        }
        setSelection(nextSelection);
        setNames(nextNames);
        broadcastSelectionState({ selection: nextSelection, names: nextNames });
        return;
      }

      if (message.event === "state_update") {
        if (message.from === clientId) return;
        const data = message.data as
          | { state?: MatchState; selection?: SelectionState; names?: { p1: string; p2: string } }
          | undefined;
        if (!data?.state) return;
        if (!matchStateRef.current) {
          resetVisualState();
        }
        matchStateRef.current = data.state;
        setMatchState(data.state);
        setStage("match");
        setPendingPlay(null);
        if (data.selection && data.names) {
          setSelection(data.selection);
          setNames(data.names);
        }
        setMessage(null);
        return;
      }

      if (message.event === "action_request") {
        const lobbySnapshot = lobbyRef.current;
        if (!lobbySnapshot || lobbySnapshot.hostId !== clientIdRef.current) return;
        const data = message.data as { action?: Parameters<typeof applyAction>[1] } | undefined;
        if (!data?.action) return;
        if (message.from) {
          const seat = message.from === lobbySnapshot.hostId ? "p1" : "p2";
          if (data.action.playerId && data.action.playerId !== seat) {
            sendRelay({
              type: "game_event",
              event: "action_error",
              data: { message: "Not your team." },
            });
            return;
          }
        }
        if (!matchStateRef.current) {
          sendRelay({
            type: "game_event",
            event: "action_error",
            data: { message: "Match is not running." },
          });
          return;
        }
        applyActionAndSync(data.action);
        return;
      }

      if (message.event === "sync_request") {
        const lobbySnapshot = lobbyRef.current;
        if (!lobbySnapshot || lobbySnapshot.hostId !== clientIdRef.current) return;
        if (matchStateRef.current) {
          sendRelay({
            type: "game_event",
            event: "state_update",
            data: {
              state: matchStateRef.current,
              selection: selectionRef.current,
              names: namesRef.current,
            },
          });
        } else {
          sendRelay({
            type: "game_event",
            event: "selection_update",
            data: { selection: selectionRef.current, names: namesRef.current },
          });
        }
        return;
      }

      if (message.event === "action_error") {
        if (message.from === clientId) return;
        const data = message.data as { message?: string } | undefined;
        if (data?.message) {
          reportMessage(data.message);
        }
      }
    },
    [applyActionAndSync, broadcastSelectionState, clientId, reportMessage, resetVisualState, sendRelay]
  );
  const handleRelayMessage = useCallback(
    (raw: string) => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        reportMessage("Invalid relay payload.");
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const message = parsed as { type?: string; [key: string]: unknown };
      if (message.type === "hello_ack") return;
      if (message.type === "error" && typeof message.message === "string") {
        reportMessage(message.message);
        return;
      }
      if (message.type === "lobby_snapshot") {
        const snapshot = message.lobby as RelayLobbySnapshot | undefined;
        if (!snapshot) return;
        setLobby(snapshot);
        if (snapshot.hostId !== clientId && !syncRequestedRef.current) {
          syncRequestedRef.current = true;
          sendRelay({ type: "game_event", event: "sync_request", data: {} });
        }
        return;
      }
      if (message.type === "lobby_closed") {
        const reason =
          typeof message.reason === "string" ? message.reason : "Lobby closed.";
        setLobby(null);
        syncRequestedRef.current = false;
        setMatchState(null);
        setStage("setup");
        setPendingPlay(null);
        resetVisualState();
        reportMessage(reason);
        return;
      }
      if (message.type === "lobby_event" || message.type === "game_event") {
        handleRelayEvent(message as RelayEventMessage);
      }
    },
    [clientId, handleRelayEvent, reportMessage, resetVisualState, sendRelay]
  );
  const connectRelay = useCallback(() => {
    if (relayStatus !== "idle") return;
    const target = relayUrl.trim();
    if (!target) {
      reportMessage("Relay URL is required.");
      return;
    }
    setRelayStatus("connecting");
    const socket = new WebSocket(target);
    socketRef.current = socket;
    socket.onopen = () => {
      setRelayStatus("connected");
      syncRequestedRef.current = false;
      const name = relayName.trim() || "Player";
      sendRelay({ type: "hello", clientId, name });
    };
    socket.onmessage = (event) => {
      handleRelayMessage(event.data);
    };
    socket.onerror = () => {
      reportMessage("Relay connection failed.");
    };
    socket.onclose = () => {
      setRelayStatus("idle");
      socketRef.current = null;
      syncRequestedRef.current = false;
      if (lobbyRef.current) {
        setLobby(null);
        setMatchState(null);
        setStage("setup");
        setPendingPlay(null);
        resetVisualState();
      }
    };
  }, [clientId, handleRelayMessage, relayName, relayStatus, relayUrl, reportMessage, resetVisualState, sendRelay]);
  const disconnectRelay = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (lobbyRef.current) {
      sendRelay({ type: "leave_lobby" });
    }
    socket.close();
  }, [sendRelay]);
  const createLobby = useCallback(() => {
    if (!isConnected) {
      reportMessage("Connect to the relay first.");
      return;
    }
    if (isMultiplayer) return;
    sendRelay({ type: "create_lobby" });
  }, [isConnected, isMultiplayer, reportMessage, sendRelay]);
  const joinLobby = useCallback(() => {
    if (!isConnected) {
      reportMessage("Connect to the relay first.");
      return;
    }
    if (isMultiplayer) return;
    const code = lobbyCode.trim().toUpperCase();
    if (!code) {
      reportMessage("Enter a lobby code.");
      return;
    }
    sendRelay({ type: "join_lobby", code });
  }, [isConnected, isMultiplayer, lobbyCode, reportMessage, sendRelay]);
  const leaveLobby = useCallback(() => {
    if (!isConnected || !lobby) return;
    sendRelay({ type: "leave_lobby" });
    setLobby(null);
    syncRequestedRef.current = false;
    setMatchState(null);
    setStage("setup");
    setPendingPlay(null);
    resetVisualState();
  }, [isConnected, lobby, resetVisualState, sendRelay]);
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);
  const markDealtCards = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setRecentlyDealt((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
    ids.forEach((id) => {
      const existing = dealtTimeoutsRef.current.get(id);
      if (existing) {
        window.clearTimeout(existing);
      }
      const timeoutId = window.setTimeout(() => {
        dealtTimeoutsRef.current.delete(id);
        setRecentlyDealt((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 600);
      dealtTimeoutsRef.current.set(id, timeoutId);
    });
  }, []);
  const queueDeckPulse = useCallback((playerId: PlayerId, effect: DeckPulse) => {
    if (!effect) return;
    setDeckPulse((prev) => ({ ...prev, [playerId]: effect }));
    const existing = deckTimeoutsRef.current[playerId];
    if (existing) {
      window.clearTimeout(existing);
    }
    deckTimeoutsRef.current[playerId] = window.setTimeout(() => {
      deckTimeoutsRef.current[playerId] = null;
      setDeckPulse((prev) => ({ ...prev, [playerId]: null }));
    }, 650);
  }, []);
  const toggleSound = () => {
    if (soundEnabled) {
      sound.play("click");
    }
    setSoundEnabled((prev) => !prev);
  };
  const toggleSkipCombat = () => {
    if (soundEnabled) {
      sound.play("click");
    }
    setSkipCombat((prev) => !prev);
  };
  const updateSoundVolume = (value: number) => {
    setSoundVolume(Math.max(0, Math.min(1, value)));
  };
  const soundControls = (
    <SoundControls
      enabled={soundEnabled}
      volume={soundVolume}
      onToggle={toggleSound}
      onVolumeChange={updateSoundVolume}
    />
  );
  const combatSpeed = 1;

  const startMatch = () => {
    try {
      if (isMultiplayer && !isHost) {
        reportMessage("Only the host can start the match.");
        return;
      }
      resetVisualState();
      const state = createMatchState(roster, [
        { id: "p1", name: names.p1.trim() || "Player 1", characterIds: selection.p1 },
        { id: "p2", name: names.p2.trim() || "Player 2", characterIds: selection.p2 },
      ]);
      setMatchState(state);
      setStage("match");
      setMessage(null);
      winnerRef.current = null;
      sound.play("confirm");
      if (isMultiplayer && isHost) {
        sendRelay({
          type: "game_event",
          event: "state_update",
          data: { state, selection, names },
        });
      }
    } catch (error) {
      reportMessage(error instanceof Error ? error.message : "Failed to start match.");
    }
  };

  const resetMatch = () => {
    setMatchState(null);
    setStage("setup");
    setMessage(null);
    setPendingPlay(null);
    winnerRef.current = null;
    resetVisualState();
    sound.play("click");
    if (isMultiplayer && isHost) {
      sendRelay({ type: "lobby_event", event: "return_to_lobby", data: {} });
    }
  };

  useEffect(() => {
    return () => {
      clearVisualTimers();
      clearCombatTimer();
    };
  }, [clearCombatTimer, clearVisualTimers]);

  useEffect(() => {
    if (!matchState) {
      matchSyncRef.current = false;
      return;
    }
    const players: PlayerId[] = ["p1", "p2"];
    const nextDeckCounts = {
      p1: matchState.players.p1.deck.length,
      p2: matchState.players.p2.deck.length,
    };
    const isFirstSync = !matchSyncRef.current;
    if (isFirstSync) {
      matchSyncRef.current = true;
      deckCountsRef.current = nextDeckCounts;
      logIndexRef.current = matchState.log.length;
    } else {
      players.forEach((playerId) => {
        const previous = deckCountsRef.current[playerId];
        const current = nextDeckCounts[playerId];
        if (previous !== current) {
          queueDeckPulse(playerId, current > previous ? "shuffle" : "draw");
        }
      });
      deckCountsRef.current = nextDeckCounts;
      const newLogs = matchState.log.slice(logIndexRef.current);
      logIndexRef.current = matchState.log.length;
      newLogs.forEach((entry) => {
        if (!entry.includes("shuffles their discard into the draw pile.")) return;
        const name = entry.split(" shuffles")[0];
        const teamId = players.find((playerId) => matchState.players[playerId].name === name);
        if (teamId) {
          queueDeckPulse(teamId, "shuffle");
        }
      });
    }

    const newHandIds: string[] = [];
    const currentHandIds = new Set<string>();
    players.forEach((playerId) => {
      matchState.players[playerId].hand.forEach((instance) => {
        currentHandIds.add(instance.id);
        if (!handIdsRef.current.has(instance.id)) {
          newHandIds.push(instance.id);
        }
      });
    });
    if (newHandIds.length > 0) {
      markDealtCards(newHandIds);
    }
    handIdsRef.current = currentHandIds;
  }, [matchState, markDealtCards, queueDeckPulse]);

  const stopCombatPlayback = useCallback(() => {
    clearCombatTimer();
    setCombatPlayback(null);
  }, [clearCombatTimer]);

  const startCombatPlayback = useCallback(
    (resolution: CombatResolution, state: MatchState) => {
      if (resolution.steps.length === 0) return;
      const stepEvents = buildCombatStepEvents(state, resolution);
      setCombatPlayback({ resolution, stepIndex: 0, phase: "pairing", stepEvents });
    },
    []
  );

  useEffect(() => {
    if (!matchState) {
      lastResolutionRef.current = null;
      stopCombatPlayback();
      return;
    }
    if (skipCombat) {
      stopCombatPlayback();
      return;
    }
    const resolution = matchState.lastResolution;
    if (!resolution) return;
    if (resolution.actionId === lastResolutionRef.current) return;
    lastResolutionRef.current = resolution.actionId;
    startCombatPlayback(resolution, matchState);
  }, [matchState, skipCombat, startCombatPlayback, stopCombatPlayback]);

  useEffect(() => {
    if (skipCombat) {
      stopCombatPlayback();
    }
  }, [skipCombat, stopCombatPlayback]);

  useEffect(() => {
    if (!combatPlayback) return;
    const { phase, resolution, stepIndex } = combatPlayback;
    const totalSteps = resolution.steps.length;
    if (stepIndex >= totalSteps) {
      stopCombatPlayback();
      return;
    }

    if (phase === "roll") {
      sound.play("roll");
    }

    if (phase === "impact") {
      sound.play("clash");
      const events = combatPlayback.stepEvents[stepIndex] ?? [];
      events.forEach((event, index) => {
        const delay = (0.08 * index) / combatSpeed;
        const playEffect = () => {
          if (event.kind === "damage") sound.play("hit");
          if (event.kind === "shield") sound.play("shield");
          if (event.kind === "heal") sound.play("heal");
        };
        if (delay === 0) {
          playEffect();
        } else {
          window.setTimeout(playEffect, delay * 1000);
        }
      });
    }

    const baseDurations: Record<CombatPlaybackPhase, number> = {
      pairing: 720,
      roll: 620,
      impact: 900,
    };
    const duration = baseDurations[phase] / combatSpeed;
    clearCombatTimer();
    combatTimerRef.current = window.setTimeout(() => {
      setCombatPlayback((prev) => {
        if (!prev) return prev;
        if (prev.phase === "pairing") {
          return { ...prev, phase: "roll" };
        }
        if (prev.phase === "roll") {
          return { ...prev, phase: "impact" };
        }
        if (prev.phase === "impact") {
          const nextIndex = prev.stepIndex + 1;
          if (nextIndex >= totalSteps) {
            return null;
          }
          return { ...prev, stepIndex: nextIndex, phase: "pairing" };
        }
        return prev;
      });
    }, duration);

    return () => {
      clearCombatTimer();
    };
  }, [combatPlayback, clearCombatTimer, combatSpeed, sound, stopCombatPlayback]);

  const buildPendingMeta = (
    base: Omit<
      PendingPlay,
      | "redirectOptions"
      | "redirectTargetId"
      | "scry"
      | "seek"
      | "search"
      | "needsPushDirection"
      | "pushDirection"
    >,
    previous?: PendingPlay | null
  ): PendingPlay => {
    const scry = buildScryState(
      matchState!,
      base.card,
      base.sourceId,
      base.xValue,
      base.choiceIndex,
      previous?.scry ?? undefined
    );
    const seek = buildSeekState(
      matchState!,
      base.card,
      base.sourceId,
      base.xValue,
      base.choiceIndex,
      previous?.seek ?? undefined
    );
    const search = buildSearchState(
      matchState!,
      base.card,
      base.sourceId,
      base.choiceIndex,
      previous?.search ?? undefined
    );
    const redirectOptions = buildRedirectOptions(
      matchState!,
      base.card,
      base.sourceId,
      base.targetId,
      base.choiceIndex
    );
    const redirectTargetId =
      previous?.redirectTargetId &&
      redirectOptions.some((option) => option.id === previous.redirectTargetId)
        ? previous.redirectTargetId
        : undefined;
    const needsPush = needsPushDirection(
      matchState!,
      base.card,
      base.sourceId,
      base.targetId,
      base.xValue,
      base.choiceIndex
    );
    const pushDirection = needsPush ? previous?.pushDirection : undefined;
    return {
      ...base,
      scry,
      seek,
      search,
      redirectOptions,
      redirectTargetId,
      needsPushDirection: needsPush,
      pushDirection,
    };
  };

  const buildPendingPlay = (
    base: {
      playerId: PlayerId;
      baseCard: Card;
      baseCardSlot: string;
      cardInstanceId?: string;
      sourceId: MatchCharacterId;
      targets: { id: MatchCharacterId; label: string }[];
      targetId: MatchCharacterId;
      zone?: ZoneName;
      xValue?: number;
      choiceIndex?: number;
    },
    previous?: PendingPlay | null
  ): PendingPlay => {
    const ownerEntry = getMemberById(matchState!, base.sourceId);
    if (!ownerEntry) {
      return previous ?? {
        playerId: base.playerId,
        card: base.baseCard,
        baseCard: base.baseCard,
        baseCardSlot: base.baseCardSlot,
        cardInstanceId: base.cardInstanceId,
        sourceId: base.sourceId,
        zones: [],
        zone: "normal",
        xValue: 0,
        xRange: null,
        choices: [],
        choiceIndex: 0,
        targets: base.targets,
        targetId: base.targetId,
        redirectOptions: [],
        needsPushDirection: false,
      };
    }
    const member = ownerEntry.member;
    const team = matchState!.players[base.playerId];
    const cardInstance = base.cardInstanceId
      ? team.hand.find((instance) => instance.id === base.cardInstanceId)
      : undefined;
    const card = resolveCardForDisplay(base.baseCard, base.sourceId, base.targetId);
    const zones = getPlayableZones(card, matchState!, member);
    const safeZones = zones.length > 0 ? zones : previous?.zones ?? ["normal"];
    const zone = safeZones.includes(base.zone ?? safeZones[0])
      ? (base.zone ?? safeZones[0])
      : safeZones[0];
    const choices = getCardChoices(card);
    const choiceIndex =
      choices.length === 0
        ? 0
        : Math.min(base.choiceIndex ?? 0, Math.max(choices.length - 1, 0));
    const xRange = getXRangeFromText(card);
    const cost = parseCost(card.cost);
    const pendingWindow = getPendingWindow(matchState!);
    const isAfterUse =
      pendingWindow?.type === "after_use" &&
      matchState!.afterUseWindow &&
      matchState!.afterUseWindow.validForAction === matchState!.actionId + 1;
    const isFollowUpPlay =
      Boolean(isAfterUse) && matchState!.afterUseWindow?.lastUsedCharacterId === base.sourceId;
    const followUpAdjustment = isFollowUpPlay ? getFollowUpCostAdjustment(card) : 0;
    const max = cost.variable
      ? getMaxX(team, member, cost, cardInstance, followUpAdjustment)
      : 0;
    let xValue = base.xValue ?? (xRange ? xRange.max : max);
    if (xRange) {
      xValue = Math.max(xRange.min, Math.min(xRange.max, xValue));
    } else if (cost.variable) {
      xValue = Math.max(0, Math.min(max, xValue));
    }

    return buildPendingMeta(
      {
        playerId: base.playerId,
        card,
        baseCard: base.baseCard,
        baseCardSlot: base.baseCardSlot,
        cardInstanceId: base.cardInstanceId,
        sourceId: base.sourceId,
        zones: safeZones,
        zone,
        xValue,
        xRange,
        choices,
        choiceIndex,
        targets: base.targets,
        targetId: base.targetId,
      },
      previous
    );
  };

  const updatePendingPlay = (overrides: Partial<PendingPlay>) => {
    setPendingPlay((prev) => {
      if (!prev || !matchState) return prev;
      const merged = { ...prev, ...overrides };
      return buildPendingPlay(
        {
          playerId: merged.playerId,
          baseCard: merged.baseCard,
          baseCardSlot: merged.baseCardSlot,
          cardInstanceId: merged.cardInstanceId,
          sourceId: merged.sourceId,
          targets: merged.targets,
          targetId: merged.targetId,
          zone: merged.zone,
          xValue: merged.xValue,
          choiceIndex: merged.choiceIndex,
        },
        merged
      );
    });
  };

  const handlePlayCard = (
    playerId: PlayerId,
    card: Card,
    sourceId: MatchCharacterId,
    cardInstanceId?: string
  ) => {
    if (!matchState) return;
    if (isMultiplayer && !canControlPlayer(playerId)) {
      reportMessage("Not your team.");
      return;
    }
    if (matchState.phase === "movement") {
      reportMessage("Movement Round in progress.");
      return;
    }
    const team = matchState.players[playerId];
    const ownerEntry = getMemberById(matchState, sourceId);
    if (!ownerEntry || ownerEntry.teamId !== playerId) {
      reportMessage("Card source not found.");
      return;
    }
    const member = ownerEntry.member;
    let targets = getLegalTargets(card, sourceId, matchState, roster).map((targetId) => ({
      id: targetId,
      label: formatMemberLabel(matchState, targetId),
    }));
    if (!targets.length) {
      reportMessage("No legal targets.");
      return;
    }
    const pendingWindow = getPendingWindow(matchState);
    if (pendingWindow?.type === "counter" && pendingWindow.counterTargetId) {
      targets = targets.filter((target) => target.id === pendingWindow.counterTargetId);
      if (!targets.length) {
        reportMessage("Counter must target the attacker.");
        return;
      }
    }
    const initialTargetId = targets[0].id;
    const playCard = resolveCardForDisplay(card, sourceId, initialTargetId);
    const zones = getPlayableZones(playCard, matchState, member);
    if (!zones.length) {
      reportMessage("No legal zones available.");
      return;
    }
    const cardInstance = cardInstanceId
      ? team.hand.find((instance) => instance.id === cardInstanceId)
      : undefined;
    const cost = parseCost(playCard.cost);
    const xRange = getXRangeFromText(playCard);
    const isAfterUse =
      pendingWindow?.type === "after_use" &&
      matchState.afterUseWindow &&
      matchState.afterUseWindow.validForAction === matchState.actionId + 1;
    const isFollowUpPlay =
      Boolean(isAfterUse) && matchState.afterUseWindow?.lastUsedCharacterId === sourceId;
    const followUpAdjustment = isFollowUpPlay ? getFollowUpCostAdjustment(playCard) : 0;
    const max = cost.variable
      ? getMaxX(team, member, cost, cardInstance, followUpAdjustment)
      : 0;
    const baseAffordable = canAffordWithAdjustments(
      team,
      member,
      cost,
      0,
      cardInstance,
      followUpAdjustment
    );
    const choices = getCardChoices(playCard);
    const targetText = playCard.target.toLowerCase();
    if (targetText.includes("all enemies") || targetText.includes("all allies")) {
      targets = [targets[0]];
    }
    const pendingWithMeta = buildPendingPlay(
      {
        playerId,
        baseCard: card,
        baseCardSlot: card.slot,
        cardInstanceId,
        sourceId,
        targets,
        targetId: initialTargetId,
        zone: zones[0],
        xValue: xRange ? xRange.max : max,
        choiceIndex: 0,
      },
      null
    );
    const needsMetaModal =
      Boolean(pendingWithMeta.scry) ||
      Boolean(pendingWithMeta.seek) ||
      Boolean(pendingWithMeta.search) ||
      pendingWithMeta.redirectOptions.length > 1 ||
      pendingWithMeta.needsPushDirection;
    const needsModal =
      zones.length > 1 ||
      cost.variable ||
      choices.length > 0 ||
      Boolean(xRange) ||
      targets.length > 1 ||
      needsMetaModal;
    if (cost.variable && !baseAffordable) {
      reportMessage("Insufficient resources.");
      return;
    }
    if (!cost.variable && xRange && !baseAffordable) {
      reportMessage("Insufficient resources.");
      return;
    }
    if (xRange && xRange.max < xRange.min) {
      reportMessage("Invalid X range.");
      return;
    }
    if (!needsModal) {
      dispatchAction({
        type: "play_card",
        playerId,
        cardInstanceId,
        cardSlot: card.slot,
        sourceId,
        targetId: targets[0].id,
        zone: zones[0],
      });
      return;
    }
    sound.play("open");
    setPendingPlay(pendingWithMeta);
  };

  const openPile = (playerId: PlayerId, pile: PileType) => {
    setInspectPile({ playerId, pile });
    sound.play("open");
  };

  const closePile = () => {
    setInspectPile(null);
    sound.play("click");
  };

  const confirmXPlay = () => {
    if (!pendingPlay) return;
    dispatchAction({
      type: "play_card",
      playerId: pendingPlay.playerId,
      cardSlot: pendingPlay.baseCardSlot,
      cardInstanceId: pendingPlay.cardInstanceId,
      sourceId: pendingPlay.sourceId,
      targetId: pendingPlay.targetId,
      zone: pendingPlay.zone,
      xValue: pendingPlay.xValue,
      choiceIndex: pendingPlay.choices.length ? pendingPlay.choiceIndex : undefined,
      redirectTargetId: pendingPlay.redirectTargetId,
      scryDiscardIds: pendingPlay.scry?.discardIds,
      scryOrderIds: pendingPlay.scry?.orderIds,
      seekTakeIds: pendingPlay.seek?.takeIds,
      searchPickId: pendingPlay.search?.pickId,
      pushDirection: pendingPlay.pushDirection,
    });
    setPendingPlay(null);
  };

  const toggleScryDiscard = (cardId: string) => {
    if (!pendingPlay?.scry) return;
    const wasDiscarded = pendingPlay.scry.discardIds.includes(cardId);
    const discardIds = wasDiscarded
      ? pendingPlay.scry.discardIds.filter((id) => id !== cardId)
      : [...pendingPlay.scry.discardIds, cardId];
    let orderIds = pendingPlay.scry.orderIds.filter((id) => !discardIds.includes(id));
    if (wasDiscarded && !orderIds.includes(cardId)) {
      orderIds = [...orderIds, cardId];
    }
    updatePendingPlay({
      scry: {
        ...pendingPlay.scry,
        discardIds,
        orderIds,
      },
    });
  };

  const moveScryOrder = (cardId: string, direction: number) => {
    if (!pendingPlay?.scry) return;
    const orderIds = [...pendingPlay.scry.orderIds];
    const index = orderIds.indexOf(cardId);
    const nextIndex = index + direction;
    if (index === -1 || nextIndex < 0 || nextIndex >= orderIds.length) return;
    const [moved] = orderIds.splice(index, 1);
    orderIds.splice(nextIndex, 0, moved);
    updatePendingPlay({
      scry: {
        ...pendingPlay.scry,
        orderIds,
      },
    });
  };

  const toggleSeekTake = (cardId: string) => {
    if (!pendingPlay?.seek) return;
    const current = pendingPlay.seek.takeIds ? [...pendingPlay.seek.takeIds] : [];
    const index = current.indexOf(cardId);
    if (index >= 0) {
      current.splice(index, 1);
    } else if (current.length < pendingPlay.seek.take) {
      current.push(cardId);
    }
    updatePendingPlay({
      seek: {
        ...pendingPlay.seek,
        takeIds: current,
      },
    });
  };

  const setSeekAuto = () => {
    if (!pendingPlay?.seek) return;
    updatePendingPlay({
      seek: {
        ...pendingPlay.seek,
        takeIds: undefined,
      },
    });
  };

  const setSeekNone = () => {
    if (!pendingPlay?.seek) return;
    updatePendingPlay({
      seek: {
        ...pendingPlay.seek,
        takeIds: [],
      },
    });
  };

  const setSearchPick = (pickId?: string) => {
    if (!pendingPlay?.search) return;
    updatePendingPlay({
      search: {
        ...pendingPlay.search,
        pickId,
      },
    });
  };

  const setRedirectTarget = (targetId?: MatchCharacterId) => {
    if (!pendingPlay) return;
    updatePendingPlay({ redirectTargetId: targetId });
  };

  const setPushDirection = (direction?: "left" | "right") => {
    if (!pendingPlay) return;
    updatePendingPlay({ pushDirection: direction });
  };

  if (stage === "setup") {
    return (
      <div className="ua-shell">
      <header className="ua-header">
        <div>
          <p className="ua-kicker">Universal Arena</p>
          <h1>{isMultiplayer ? "Multiplayer Setup" : "Local Match Setup"}</h1>
          <p className="ua-subtitle">
            Pick three characters per team from the current roster and start a match.
          </p>
        </div>
        <div className="ua-header__actions">
          {soundControls}
          <label className="ua-toggle">
            <input type="checkbox" checked={skipCombat} onChange={toggleSkipCombat} />
            Skip Combat
          </label>
          <div className="ua-badge">Prototype Engine</div>
        </div>
      </header>

      {message && <div className="ua-toast">{message}</div>}

      <section className="ua-panel ua-panel--wide">
        <div className="ua-panel__header">
          <h2>Multiplayer (Relay)</h2>
          <span className="ua-panel__tag">{relayStatusLabel}</span>
        </div>
        <div className="ua-help-row">
          <label className="ua-label">
            Relay URL
            <input
              value={relayUrl}
              disabled={relayStatus !== "idle"}
              onChange={(event) => setRelayUrl(event.target.value)}
            />
          </label>
          <label className="ua-label">
            Display name
            <input
              value={relayName}
              disabled={relayStatus !== "idle"}
              onChange={(event) => setRelayName(event.target.value)}
            />
          </label>
          <label className="ua-label">
            Lobby code
            <input
              value={lobbyCode}
              disabled={!isConnected || isMultiplayer}
              onChange={(event) => setLobbyCode(event.target.value.toUpperCase())}
            />
          </label>
        </div>
        <div className="ua-help-row">
          <button
            className="ua-button"
            disabled={relayStatus !== "idle"}
            onClick={connectRelay}
          >
            Connect
          </button>
          <button
            className="ua-button ua-button--ghost"
            disabled={!isConnected}
            onClick={disconnectRelay}
          >
            Disconnect
          </button>
          <button
            className="ua-button"
            disabled={!isConnected || isMultiplayer}
            onClick={createLobby}
          >
            Create Lobby
          </button>
          <button
            className="ua-button"
            disabled={!isConnected || isMultiplayer || !lobbyCode.trim()}
            onClick={joinLobby}
          >
            Join Lobby
          </button>
          <button
            className="ua-button ua-button--ghost"
            disabled={!isMultiplayer}
            onClick={leaveLobby}
          >
            Leave Lobby
          </button>
        </div>
        {isMultiplayer ? (
          <p className="ua-zone-status">
            Lobby {lobby?.code} • {isHost ? "Host (P1)" : "Guest (P2)"} • Players:{" "}
            {lobby?.players.map((player) => player.name).join(", ")}
          </p>
        ) : (
          <p className="ua-zone-status">
            Use the relay to play remotely. The match setup below controls the in-game names.
          </p>
        )}
      </section>

      <section className="ua-setup-grid">
          {(["p1", "p2"] as PlayerId[]).map((playerId) => {
            const selected = selection[playerId];
            const selectedCharacters = selected
              .map((id) => getCharacter(roster, id))
              .filter((entry): entry is Character => Boolean(entry));
            const taken = new Set(selected);
            return (
              <div key={playerId} className="ua-panel">
                <div className="ua-panel__header">
                  <h2>{playerId === "p1" ? "Player One" : "Player Two"}</h2>
                  <span className="ua-panel__tag">{playerId.toUpperCase()}</span>
                </div>
                  <label className="ua-label">
                    Name
                    <input
                      value={names[playerId]}
                      disabled={!canEditSetup(playerId)}
                      onChange={(event) =>
                        applySetupChange(playerId, { name: event.target.value })
                      }
                    />
                  </label>
                <div className="ua-team-selects">
                  {selected.map((selectionId, index) => (
                    <label key={`${playerId}-${index}`} className="ua-label">
                      Character {index + 1}
                        <select
                          value={selectionId}
                          disabled={!canEditSetup(playerId)}
                          onChange={(event) =>
                            applySetupChange(playerId, {
                              selection: selection[playerId].map((entry, entryIndex) =>
                                entryIndex === index ? event.target.value : entry
                              ),
                            })
                          }
                        >
                        {rosterSorted.map((entry) => (
                          <option
                            key={entry.id}
                            value={entry.id}
                            disabled={taken.has(entry.id) && entry.id !== selectionId}
                          >
                            {entry.name} ({entry.version})
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {selectedCharacters.length > 0 && (
                  <div className="ua-team-preview">
                    {selectedCharacters.map((character) => (
                      <div key={character.id} className="ua-team-preview__card">
                        <p className="ua-character-title">
                          {character.name} <span>({character.version})</span>
                        </p>
                        <p className="ua-character-origin">{character.origin}</p>
                        <p className="ua-character-roles">{formatRoles(character.roles)}</p>
                        <p className="ua-character-difficulty">
                          Difficulty: {character.difficulty}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className="ua-panel ua-panel--wide">
          <h2>Roster Overview</h2>
          <div className="ua-roster-grid">
            {rosterSorted.map((entry) => (
              <article key={entry.id} className="ua-roster-card">
                <div>
                  <h3>
                    {entry.name} <span>({entry.version})</span>
                  </h3>
                  <p>{entry.origin}</p>
                </div>
                <div>
                  <span className="ua-pill">{formatRoles(entry.roles)}</span>
                  <span className="ua-pill">Difficulty: {entry.difficulty}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="ua-actions">
          <button
            className="ua-button ua-button--primary"
            disabled={isMultiplayer && !isHost}
            onClick={startMatch}
          >
            Start Match
          </button>
        </div>
      </div>
    );
  }

  if (!matchState) {
    return null;
  }

  const activeTeam = matchState.players[matchState.activePlayerId];
  const isMovementRound = matchState.phase === "movement";
  const activeZoneLabel = matchState.activeZone ? zoneLabel(matchState.activeZone) : "None";
  const pausedZonesLabel = matchState.pausedZones.length
    ? matchState.pausedZones.map(zoneLabel).join(", ")
    : "None";
  const pendingWindow = getPendingWindow(matchState);
  const allReactivePlayers = getReactivePlayers(matchState);
  const reactivePlayers = allReactivePlayers.filter(
    (playerId) => playerId !== matchState.activePlayerId
  );
  const reactionNames = allReactivePlayers
    .map((playerId) => matchState.players[playerId]?.name)
    .filter((name): name is string => Boolean(name));
  const buildHandEntries = (team: Team): HandEntry[] =>
    team.hand
      .map((instance) => {
        const ownerEntry = getMemberById(matchState, instance.ownerId);
        if (!ownerEntry) return null;
        const ownerCharacter = getCharacter(roster, ownerEntry.member.characterId);
        if (!ownerCharacter) return null;
        const card = getCardBySlot(ownerCharacter, instance.cardSlot);
        if (!card) return null;
        return {
          instance,
          card,
          owner: ownerEntry.member,
          ownerTeam: ownerEntry.team,
          ownerCharacter,
        };
      })
      .filter((entry): entry is HandEntry => Boolean(entry));
  const activeHand = buildHandEntries(activeTeam);
  const activeUltimates = activeTeam.characters.flatMap((member) => {
    const character = getCharacter(roster, member.characterId);
    if (!character) return [];
    return character.cards
      .filter((card) => isUltimateCard(card))
      .map((card) => ({ card, member, character }));
  });
  const inspectPlayer = inspectPile ? matchState.players[inspectPile.playerId] : null;
  const inspectInstances =
    inspectPlayer && inspectPile ? getPileInstances(inspectPlayer, inspectPile.pile) : [];
  const isDeckPile = inspectPile?.pile === "deck";
  const orderedInstances = !isDeckPile ? [...inspectInstances].reverse() : [];
  const inspectSummary = isDeckPile
    ? summarizePile(inspectInstances)
    : [];
  const inspectLabel =
    inspectPile && inspectPlayer
      ? `${inspectPlayer.name} ${pileLabelMap[inspectPile.pile]}`
      : "";
  const inspectNote = inspectPile
    ? isDeckPile
      ? "Order is hidden. Counts are grouped by card."
      : "Top is most recent. List shows actual order."
    : "";
  const sortedMovementMembers = [...activeTeam.characters].sort(
    (left, right) => left.position - right.position
  );
  const movementPairs = sortedMovementMembers
    .slice(0, -1)
    .map((member, index) => ({
      left: member,
      right: sortedMovementMembers[index + 1]!,
    }))
    .filter((pair) => pair.right.position - pair.left.position === 1);
  const cardFlowTip =
    "Played: placed in a legal zone after paying cost and choosing legal targets.\n" +
    "Used: the card's effects apply (default timing is On Use).\n" +
    "Cancelled: skips Before Use, On Use, On Hit, After Use; Always still applies.\n" +
    "Negated: skips all effects, including Always.";
  const timingTip =
    "On Hit: an Attack is a hit, even if it deals 0 damage.\n" +
    "On Damage: damage is actually dealt after mitigation (Shield, Barrier, or HP), >0.\n" +
    "On HP Damage: HP is reduced by damage after mitigation.";
  const zoneOrder: ZoneName[] = ["fast", "normal", "slow"];
  const zoneRail = zoneOrder.map((zone) => {
    const data = matchState.zones[zone];
    const cards = data.cards;
    const nextCard = cards[cards.length - 1];
    const leftCard = cards[cards.length - 2];
    const nextPair =
      cards.length === 0
        ? null
        : cards.length === 1
          ? `Next: ${nextCard?.cardName ?? "Card"}`
          : `Next: ${nextCard?.cardName ?? "Card"} vs ${leftCard?.cardName ?? "Card"}`;
    return {
      zone,
      cards,
      nextPair,
      isActive: matchState.activeZone === zone,
      isPaused: matchState.pausedZones.includes(zone),
    };
  });
  const zoneStacks = zoneOrder.map((zone) => {
    const data = matchState.zones[zone];
    const cards = data.cards;
    const top = cards[cards.length - 1];
    const next = cards[cards.length - 2];
    return {
      zone,
      cards: [...cards].reverse(),
      clash: cards.length >= 2 ? { left: next, right: top } : null,
      isActive: matchState.activeZone === zone,
      isPaused: matchState.pausedZones.includes(zone),
    };
  });
  const zoneRuleHint = matchState.activeZone
    ? "Cards may be played in the active zone or any faster zone allowed by their speed. Slower zones are locked until the active zone resolves."
    : "No active zone yet. Cards can be played in any zone allowed by their speed.";
  const logGroups = groupLogEntries(matchState.log);
  const formationRows = Array.from({ length: matchState.lineSize }, (_, index) => {
    const left =
      matchState.players.p1.characters.find((member) => member.position === index) ??
      null;
    const right =
      matchState.players.p2.characters.find((member) => member.position === index) ??
      null;
    return { index, left, right };
  });
  const renderEffectLine = (line: string, key: string) => {
    const match = findKeywordMatch(line, keywordMatchers);
    if (!match) return <p key={key}>{line}</p>;
    const tier = match.keyword.tier ?? "Unspecified";
    const tip = `${match.keyword.name}\nTier: ${tier}\n${match.keyword.description}`;
    return (
      <p key={key}>
        <span className="ua-tooltip ua-keyword" data-tip={tip}>
          {line}
        </span>
      </p>
    );
  };
  const pendingTargetPreview =
    pendingPlay && matchState
      ? (() => {
          const options = pendingPlay.targets.map((target) => {
            const resolvedCard = resolveCardForDisplay(
              pendingPlay.baseCard,
              pendingPlay.sourceId,
              target.id
            );
            const legalTargets = getLegalTargets(
              resolvedCard,
              pendingPlay.sourceId,
              matchState,
              roster
            );
            const isTransformed = resolvedCard.slot !== pendingPlay.baseCardSlot;
            const isRetarget = !legalTargets.includes(target.id);
            return {
              ...target,
              resolvedCard,
              legalTargets,
              isTransformed,
              isRetarget,
            };
          });
          const active = options.find((option) => option.id === pendingPlay.targetId) ?? null;
          const legalTargetLabels = active
            ? active.legalTargets.map((targetId) =>
                formatMemberLabel(matchState, targetId)
              )
            : [];
          const autoTargetLabel =
            active && active.legalTargets.length > 0
              ? formatMemberLabel(matchState, active.legalTargets[0])
              : null;
          return { options, active, legalTargetLabels, autoTargetLabel };
        })()
      : null;
  const isTransformPreview =
    pendingPlay && pendingPlay.baseCardSlot !== pendingPlay.card.slot;
  const renderCharacterCard = (member: TeamMember | null) => {
    if (!member) {
      return (
        <div className="ua-character-card ua-character-card--empty">
          <div className="ua-combat-empty">Empty slot</div>
        </div>
      );
    }
    const character = getCharacter(roster, member.characterId);
    const statusEntries = formatStatusList(member.statuses);
    return (
      <div className={`ua-character-card${member.defeated ? " is-defeated" : ""}`}>
        <div className="ua-character-card__header">
          <div>
            <p className="ua-character-title">
              {character?.name ?? member.characterId}{" "}
              {character?.version ? <span>({character.version})</span> : null}
            </p>
            {character && (
              <p className="ua-character-origin">{character.origin}</p>
            )}
          </div>
          {member.defeated && (
            <span className="ua-character-card__tag">Defeated</span>
          )}
        </div>
        <div className="ua-stats ua-stats--compact">
          <div>
            <span>HP</span>
            <strong>{member.hp}</strong>
          </div>
          <div>
            <span>Shield</span>
            <strong>{member.shield}</strong>
          </div>
        </div>
        {statusEntries.length > 0 && (
          <div className="ua-statuses">
            {statusEntries.map(([status, value]) => {
              const info = statusDetails.get(normalizeKey(status));
              const tip = info
                ? `${status}\nMode: ${info.modeLabel}\nTurn End: ${info.turnEnd}`
                : null;
              return (
                <span
                  key={status}
                  className={`ua-pill${info ? " ua-tooltip ua-status-pill" : ""}`}
                  data-tip={tip ?? undefined}
                  tabIndex={info ? 0 : undefined}
                >
                  {status}: {value}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  };
  const combatOverlay =
    combatPlayback && matchState
      ? (() => {
          const step = combatPlayback.resolution.steps[combatPlayback.stepIndex];
          if (!step) return null;
          const outcomeLabelMap: Record<string, string> = {
            single: "Unopposed",
            same_team: "Chain Resolve",
            attack_tie: "Clash: Draw",
            attack_right: "Overpower",
            attack_left: "Overpower",
            attack_vs_defense: "Attack vs Defense",
            defense_vs_defense: "Guarding",
            opposed: "Opposed",
          };
          const phaseLabelMap: Record<CombatPlaybackPhase, string> = {
            pairing: "Pairing",
            roll: "Roll",
            impact: "Impact",
          };
          const getSide = (
            entry: CombatResolution["steps"][number]["left"],
            power: number | undefined
          ): CombatSide | null => {
            if (!entry) return null;
            const lookup = getMemberById(matchState, entry.sourceId);
            if (!lookup) return null;
            const target = getMemberById(matchState, entry.targetId);
            const character = getCharacter(roster, lookup.member.characterId);
            const artUrl = character?.art ? `/assets/characters/${character.art}` : null;
            return {
              entry,
              teamId: lookup.teamId,
              member: lookup.member,
              character: character ?? undefined,
              targetName: target?.member.name ?? "Unknown",
              artUrl,
              power: power ?? null,
            };
          };
          const leftCandidate = getSide(step.left, step.leftPower);
          const rightCandidate = getSide(step.right, step.rightPower);
          const sides = [leftCandidate, rightCandidate].filter(
            (side): side is CombatSide => Boolean(side)
          );
          const leftSide =
            sides.find((side) => side.teamId === "p1") ?? sides[0] ?? null;
          let rightSide =
            sides.find((side) => side.teamId === "p2") ??
            (sides.length > 1 ? sides.find((side) => side !== leftSide) ?? null : null);
          if (leftSide && rightSide && rightSide.entry.id === leftSide.entry.id) {
            rightSide = sides.find((side) => side.entry.id !== leftSide.entry.id) ?? null;
          }
          const winnerEntryId =
            step.outcome === "attack_right"
              ? step.right?.id
              : step.outcome === "attack_left"
                ? step.left?.id
                : null;
          const stepEvents = combatPlayback.stepEvents[combatPlayback.stepIndex] ?? [];
          const buildImpactTokens = (side: CombatSide | null) => {
            if (!side) return [];
            return stepEvents
              .filter(
                (event) =>
                  (event.kind === "damage" ||
                    event.kind === "shield" ||
                    event.kind === "heal") &&
                  event.target === side.member.name
              )
              .map((event, index) => ({
                id: `${event.kind}-${event.target}-${index}`,
                kind: event.kind,
                amount: event.amount ?? 0,
              }));
          };
          const leftImpact = buildImpactTokens(leftSide);
          const rightImpact = buildImpactTokens(rightSide);
          const zoneName = zoneLabel(combatPlayback.resolution.zone);
          const stepLabel = `Clash ${combatPlayback.stepIndex + 1} / ${
            combatPlayback.resolution.steps.length
          }`;
          const outcomeLabel = outcomeLabelMap[step.outcome] ?? "Clash";
          const phaseLabel = phaseLabelMap[combatPlayback.phase];
          const renderSide = (side: CombatSide | null, sideClass: string, tokens: typeof leftImpact) => {
            if (!side) {
              return (
                <div className={`ua-combat-side ${sideClass} is-empty`}>
                  <div className="ua-combat-empty">No entry</div>
                </div>
              );
            }
            const isWinner = winnerEntryId === side.entry.id;
            const rollLabel = side.power !== null ? side.power : "--";
            return (
              <div
                className={`ua-combat-side ${sideClass} ${isWinner ? "is-winner" : ""} ${
                  tokens.length ? "has-impact" : ""
                }`}
              >
                <div className="ua-combat-portrait">
                  {side.artUrl ? (
                    <img src={side.artUrl} alt={side.member.name} />
                  ) : (
                    <div className="ua-combat-portrait__placeholder">{side.member.name}</div>
                  )}
                </div>
                <div className="ua-combat-card">
                  <div className="ua-combat-card__title">{side.entry.cardName}</div>
                  <div className="ua-combat-card__meta">
                    {side.member.name} {"->"} {side.targetName}
                  </div>
                  <div className="ua-combat-card__types">{side.entry.types.join(" / ")}</div>
                </div>
                <div className="ua-combat-roll">{rollLabel}</div>
                <div className="ua-combat-impact">
                  {tokens.map((token) => (
                    <div
                      key={token.id}
                      className={`ua-combat-impact__token ua-combat-impact__token--${token.kind}`}
                    >
                      {token.kind === "damage" ? "-" : "+"}
                      {token.amount}
                    </div>
                  ))}
                </div>
              </div>
            );
          };
          return (
            <div
              className={`ua-combat-overlay phase-${combatPlayback.phase}`}
              onClick={stopCombatPlayback}
            >
              <div className="ua-combat-stage">
                <div className="ua-combat-stage__header">
                  <span className="ua-combat-stage__zone">{zoneName} Zone</span>
                  <span className="ua-combat-stage__step">{stepLabel}</span>
                </div>
                <div className="ua-combat-stage__arena">
                  {renderSide(leftSide, "is-left", leftImpact)}
                  <div className="ua-combat-vs">
                    <span>{outcomeLabel}</span>
                  </div>
                  {renderSide(rightSide, "is-right", rightImpact)}
                </div>
                <div className="ua-combat-stage__footer">
                  <span className="ua-combat-stage__phase">{phaseLabel}</span>
                  <span className="ua-combat-stage__hint">Click to skip</span>
                </div>
              </div>
            </div>
          );
        })()
      : null;

  return (
    <>
      {combatOverlay}
      <div className="ua-shell">
      <header className="ua-header">
        <div>
          <p className="ua-kicker">Universal Arena</p>
          <h1>{isMultiplayer ? "Multiplayer Match" : "Local Match"}</h1>
          <p className="ua-subtitle">
            Turn {matchState.turn} • Active: {activeTeam.name}
          </p>
          {isMultiplayer && lobby && (
            <p className="ua-zone-status">
              Lobby {lobby.code} • {isHost ? "Host (P1)" : "Guest (P2)"}
            </p>
          )}
        </div>
          <div className="ua-header__actions">
            {soundControls}
            <label className="ua-toggle">
              <input type="checkbox" checked={skipCombat} onChange={toggleSkipCombat} />
              Skip Combat
            </label>
            <button
              className="ua-button ua-button--ghost"
              disabled={isMultiplayer && !isHost}
              onClick={resetMatch}
            >
              Back to Setup
            </button>
          </div>
      </header>

      {message && <div className="ua-toast">{message}</div>}

      <section className="ua-panel ua-panel--wide ua-zone-banner">
        <div>
          <p className="ua-zone-banner__title">Active Zone: {activeZoneLabel}</p>
          <p className="ua-zone-banner__meta">
            Paused Zones: {pausedZonesLabel} | Resolves right-to-left
          </p>
        </div>
        <button className="ua-button ua-button--ghost ua-zone-banner__rule" title={zoneRuleHint}>
          Why can&apos;t I play here?
        </button>
      </section>

      <section className="ua-panel ua-panel--wide">
        <div className="ua-panel__header">
          <h2>Resolution Rail</h2>
          <span className="ua-pill">Right-to-left</span>
        </div>
        <div className="ua-rail">
          {zoneRail.map((zone) => (
            <div
              key={zone.zone}
              className={`ua-rail__item ${zone.isActive ? "is-active" : ""} ${
                zone.isPaused ? "is-paused" : ""
              }`}
            >
              <div className="ua-rail__label">{zoneLabel(zone.zone)}</div>
              <div className="ua-rail__meta">
                <span>{zone.cards.length} card(s)</span>
                {zone.isActive && <span className="ua-rail__tag">Active</span>}
                {!zone.isActive && zone.isPaused && <span className="ua-rail__tag">Paused</span>}
                {!zone.isActive && !zone.isPaused && zone.cards.length > 0 && (
                  <span className="ua-rail__tag ua-rail__tag--queued">Queued</span>
                )}
              </div>
              {zone.nextPair && <div className="ua-rail__next">{zone.nextPair}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="ua-panel ua-panel--wide">
        <div className="ua-panel__header">
          <h2>Zone Stack</h2>
          <span className="ua-pill">Top resolves first</span>
        </div>
        <div className="ua-stack-grid">
          {zoneStacks.map((zone) => (
            <div
              key={zone.zone}
              className={`ua-stack-zone ${zone.isActive ? "is-active" : ""} ${
                zone.isPaused ? "is-paused" : ""
              }`}
            >
              <div className="ua-stack-zone__header">
                <span className="ua-stack-zone__title">{zoneLabel(zone.zone)}</span>
                <span className="ua-stack-zone__count">{zone.cards.length} card(s)</span>
              </div>
              {zone.clash && (
                <div className={`ua-clash-preview ${zone.isActive ? "is-active" : ""}`}>
                  <span>{zone.clash.right?.cardName}</span>
                  <span className="ua-clash-preview__vs">vs</span>
                  <span>{zone.clash.left?.cardName}</span>
                </div>
              )}
              <div className="ua-stack-list">
                {zone.cards.length === 0 && <p className="ua-empty">No cards queued.</p>}
                {zone.cards.map((entry, index) => {
                  const sourceLabel = formatMemberLabel(matchState, entry.sourceId);
                  const targetLabel = formatMemberLabel(matchState, entry.targetId);
                  const lifecycle = getStackLifecycleTag(entry, zone, index);
                  return (
                    <div
                      key={entry.id}
                      className={`ua-stack-card ${index === 0 ? "is-top" : ""}`}
                      style={{ animationDelay: `${index * 0.03}s` }}
                    >
                      <div className="ua-stack-card__title">
                        <span>{entry.cardName}</span>
                        <span className={`ua-stack-card__tag ua-stack-card__tag--${lifecycle.tone}`}>
                          {lifecycle.label}
                        </span>
                      </div>
                      <div className="ua-stack-card__meta">
                        {sourceLabel} {"->"} {targetLabel}
                      </div>
                      <div className="ua-stack-card__meta">
                        Speed: {entry.speed} | {entry.types.join(" / ")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="ua-match-grid">
        {(["p1", "p2"] as PlayerId[]).map((playerId) => {
          const team = matchState.players[playerId];
          const deckEffect = deckPulse[playerId];
          const deckClass =
            "ua-stat-button ua-pile-button ua-pile-button--deck" +
            (deckEffect === "draw" ? " is-drawing" : "") +
            (deckEffect === "shuffle" ? " is-shuffling" : "");
          return (
            <div
              key={playerId}
              className={`ua-panel ${playerId === matchState.activePlayerId ? "is-active" : ""}`}
            >
              <div className="ua-panel__header">
                <h2>{team.name}</h2>
                <span className="ua-panel__tag">{playerId.toUpperCase()}</span>
              </div>
              <div className="ua-team-meta">
                <div className="ua-stats ua-stats--team">
                  <div>
                    <span>Energy</span>
                    <strong>{team.energy}</strong>
                  </div>
                  <div>
                    <span>Ultimate</span>
                    <strong>{team.ultimate}</strong>
                  </div>
                  <div>
                    <span>Hand</span>
                    <strong>{team.hand.length}</strong>
                  </div>
                  <button
                    type="button"
                    className={deckClass}
                    onClick={() => openPile(playerId, "deck")}
                  >
                    <span>Deck</span>
                    <strong>{team.deck.length}</strong>
                  </button>
                  <button
                    type="button"
                    className="ua-stat-button ua-pile-button ua-pile-button--discard"
                    onClick={() => openPile(playerId, "discard")}
                  >
                    <span>Discard</span>
                    <strong>{team.discard.length}</strong>
                  </button>
                  <button
                    type="button"
                    className="ua-stat-button ua-pile-button ua-pile-button--exhaust"
                    onClick={() => openPile(playerId, "exhausted")}
                  >
                    <span>Exhaust</span>
                    <strong>{team.exhausted.length}</strong>
                  </button>
                </div>
                <p className="ua-pile-hint">
                  Click Deck, Discard, or Exhaust to inspect pile contents.
                </p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="ua-panel ua-panel--wide">
        <div className="ua-panel__header">
          <h2>Formation</h2>
          <span className="ua-pill">Opposed rows</span>
        </div>
        <div className="ua-formation">
          <div className="ua-formation__header">
            <div className="ua-formation__team ua-formation__team--left">
              {matchState.players.p1.name}
            </div>
            <div className="ua-formation__lane"></div>
            <div className="ua-formation__team ua-formation__team--right">
              {matchState.players.p2.name}
            </div>
          </div>
          {formationRows.map((row) => (
            <div key={row.index} className="ua-formation__row">
              <div className="ua-formation__cell is-left">
                {renderCharacterCard(row.left)}
              </div>
              <div className="ua-formation__lane">
                <span className="ua-formation__slot">Line {row.index + 1}</span>
              </div>
              <div className="ua-formation__cell is-right">
                {renderCharacterCard(row.right)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="ua-panel ua-panel--wide">
        <div className="ua-panel__header">
          <h2>Event Log</h2>
          <div className="ua-inline-actions">
              <button
                className="ua-button ua-button--ghost"
                disabled={!canControlPlayer(matchState.activePlayerId)}
                onClick={() =>
                  dispatchAction({ type: "clear_log", playerId: matchState.activePlayerId })
                }
              >
              Clear Log
            </button>
          </div>
        </div>
        <div className="ua-log">
          {logGroups.length === 0 && <p>No log entries yet.</p>}
          {logGroups.map((group, groupIndex) => (
            <div key={`${group.title}-${groupIndex}`} className="ua-log-group">
              <div className="ua-log-group__title">{group.title}</div>
              <div className="ua-log-group__entries">
                {group.entries.map((entry, entryIndex) => (
                  <div key={`${groupIndex}-${entryIndex}`} className="ua-log-entry">
                    <div className="ua-log-entry__header">
                      {entry.kind && (
                        <span className={`ua-log-entry__tag ua-log-entry__tag--${entry.kind}`}>
                          {logKindLabels[entry.kind]}
                        </span>
                      )}
                      <div className="ua-log-entry__summary">{entry.summary}</div>
                    </div>
                    {entry.details && (
                      <div className="ua-log-entry__details">
                        {entry.details.map((detail) => (
                          <span key={detail}>{detail}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="ua-panel ua-panel--wide">
        <div className="ua-panel__header">
          <h2>Actions</h2>
          <div className="ua-inline-actions">
            <button
              className="ua-button"
              disabled={!canControlPlayer(activeTeam.id) || matchState.activePlayerId !== activeTeam.id}
              onClick={() => dispatchAction({ type: "pass", playerId: activeTeam.id })}
            >
              Pass
            </button>
            <button
              className="ua-button"
              disabled={
                !canControlPlayer(matchState.initiativePlayerId) ||
                matchState.activePlayerId !== matchState.initiativePlayerId ||
                matchState.activeZone !== null ||
                matchState.phase !== "combat"
              }
              onClick={() =>
                dispatchAction({ type: "end_turn", playerId: matchState.initiativePlayerId })
              }
            >
              End Turn
            </button>
          </div>
        </div>
        <p className="ua-zone-status">
          Phase: {isMovementRound ? "Movement Round" : "Combat Round"} | Active Zone:{" "}
          {activeZoneLabel} | Paused Zones: {pausedZonesLabel}
        </p>
        {isMovementRound && (
          <div className="ua-movement">
            <p>Spend 1 Energy to swap adjacent allies, or pass.</p>
            <div className="ua-movement__actions">
              {movementPairs.map((pair) => (
                  <button
                    key={`${pair.left.id}-${pair.right.id}`}
                    className="ua-button ua-button--ghost"
                    disabled={
                      !canControlPlayer(activeTeam.id) ||
                      matchState.activePlayerId !== activeTeam.id ||
                      activeTeam.energy < 1
                    }
                  onClick={() =>
                    dispatchAction({
                      type: "move_swap",
                      playerId: activeTeam.id,
                      firstId: pair.left.id,
                      secondId: pair.right.id,
                    })
                  }
                >
                  Swap {pair.left.name} {"<->"} {pair.right.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {pendingWindow && reactionNames.length > 0 && (
          <p className="ua-zone-status">
            Reaction window: {reactionNames.join(" / ")} can play{" "}
            {pendingWindow.type === "counter" ? "Counter" : "Follow-Up or Assist Attack"} now in the{" "}
            {zoneLabel(pendingWindow.zone)} Zone.
          </p>
        )}
        <div className="ua-help-row">
          <span className="ua-help-label">Rules tooltips</span>
          <span className="ua-tooltip" data-tip={cardFlowTip} tabIndex={0}>
            Played vs Used vs Cancelled vs Negated
          </span>
          <span className="ua-tooltip" data-tip={timingTip} tabIndex={0}>
            On Hit vs On Damage vs On HP Damage
          </span>
        </div>
        <>
          <h3 className="ua-hand-title">
            Active Hand <span>({activeTeam.name})</span>
          </h3>
          <div className="ua-card-grid">
            {activeHand.map((entry, index) => {
              const { instance, card, owner } = entry;
              const displayCard = resolveCardForDisplay(card, owner.id);
              const cost = parseCost(displayCard.cost);
              const isVariable = Boolean(cost.variable);
              const xRange = getXRangeFromText(displayCard);
              const isAfterUse =
                pendingWindow?.type === "after_use" &&
                matchState.afterUseWindow &&
                matchState.afterUseWindow.validForAction === matchState.actionId + 1;
              const isFollowUpPlay =
                Boolean(isAfterUse) &&
                matchState.afterUseWindow?.lastUsedCharacterId === owner.id;
              const followUpAdjustment = isFollowUpPlay
                ? getFollowUpCostAdjustment(displayCard)
                : 0;
              const baseAffordable = canAffordWithAdjustments(
                activeTeam,
                owner,
                cost,
                0,
                instance,
                followUpAdjustment
              );
                const canReact = pendingWindow
                  ? pendingWindow.type === "counter"
                    ? canReactCounter(matchState, displayCard, owner.id)
                    : canReactAfterUse(matchState, displayCard, owner.id)
                  : false;
                const canAct = pendingWindow
                  ? canReact
                  : matchState.activePlayerId === activeTeam.id;
                const canControl = canControlPlayer(activeTeam.id);
                const disabled = !canControl || !canAct || !baseAffordable || owner.defeated;
              const adjustment =
                getEnergyCostAdjustment(owner) +
                (instance.costAdjustment ?? 0) +
                followUpAdjustment;
              const isDealt = Boolean(recentlyDealt[instance.id]);
              return (
                <button
                  key={instance.id}
                  className={`ua-card${isDealt ? " ua-card--deal" : ""}`}
                  style={isDealt ? { animationDelay: `${index * 0.035}s` } : undefined}
                  disabled={disabled}
                  onClick={() => handlePlayCard(activeTeam.id, card, owner.id, instance.id)}
                >
                  <div className="ua-card__title">{displayCard.name}</div>
                  <div className="ua-card__meta">
                    <span>Owner: {owner.name}</span>
                  </div>
                  <div className="ua-card__meta">
                    <span>
                      Cost: {displayCard.cost}
                      {adjustment !== 0 &&
                        ` (Adj ${adjustment >= 0 ? "+" : ""}${adjustment})`}
                    </span>
                    <span>Power: {displayCard.power}</span>
                  </div>
                  <div className="ua-card__meta">
                    <span>Speed: {displayCard.speed}</span>
                    <span>Target: {displayCard.target}</span>
                  </div>
                  <div className="ua-card__tags">{displayCard.types.join(" / ")}</div>
                  <div className="ua-card__effect">
                    {displayCard.effect.map((line, index) =>
                      renderEffectLine(line, `${instance.id}-${index}`)
                    )}
                  </div>
                  {isVariable && <span className="ua-card__tag">X Cost</span>}
                  {xRange && <span className="ua-card__tag">Choose X</span>}
                </button>
              );
            })}
            {activeHand.length === 0 && <p>No cards in hand.</p>}
          </div>
          {activeUltimates.length > 0 && (
            <>
              <h3>Ultimates</h3>
              <div className="ua-card-grid">
                {activeUltimates.map((entry) => {
                  const { card, member } = entry;
                  const displayCard = resolveCardForDisplay(card, member.id);
                  const cost = parseCost(displayCard.cost);
                  const isVariable = Boolean(cost.variable);
                  const isAfterUse =
                    pendingWindow?.type === "after_use" &&
                    matchState.afterUseWindow &&
                    matchState.afterUseWindow.validForAction === matchState.actionId + 1;
                  const isFollowUpPlay =
                    Boolean(isAfterUse) &&
                    matchState.afterUseWindow?.lastUsedCharacterId === member.id;
                  const followUpAdjustment = isFollowUpPlay
                    ? getFollowUpCostAdjustment(displayCard)
                    : 0;
                  const baseAffordable = canAffordWithAdjustments(
                    activeTeam,
                    member,
                    cost,
                    0,
                    undefined,
                    followUpAdjustment
                  );
                    const canReact = pendingWindow
                      ? pendingWindow.type === "counter"
                        ? canReactCounter(matchState, displayCard, member.id)
                        : canReactAfterUse(matchState, displayCard, member.id)
                      : false;
                    const canAct = pendingWindow
                      ? canReact
                      : matchState.activePlayerId === activeTeam.id;
                    const canControl = canControlPlayer(activeTeam.id);
                    const disabled = !canControl || !canAct || !baseAffordable || member.defeated;
                  return (
                    <button
                      key={`${member.id}-${card.slot}`}
                      className="ua-card"
                      disabled={disabled}
                      onClick={() => handlePlayCard(activeTeam.id, card, member.id)}
                    >
                      <div className="ua-card__title">{displayCard.name}</div>
                      <div className="ua-card__meta">
                        <span>Owner: {member.name}</span>
                      </div>
                      <div className="ua-card__meta">
                        <span>Cost: {displayCard.cost}</span>
                        <span>Power: {displayCard.power}</span>
                      </div>
                      <div className="ua-card__meta">
                        <span>Speed: {displayCard.speed}</span>
                        <span>Target: {displayCard.target}</span>
                      </div>
                      <div className="ua-card__tags">{displayCard.types.join(" / ")}</div>
                      <div className="ua-card__effect">
                        {displayCard.effect.map((line, index) =>
                          renderEffectLine(line, `${member.id}-${card.slot}-${index}`)
                        )}
                      </div>
                      {isVariable && <span className="ua-card__tag">X Cost</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      </section>

      {reactivePlayers.map((playerId) => {
        const team = matchState.players[playerId];
        const handEntries = buildHandEntries(team);
        const ultimateEntries: UltimateEntry[] = team.characters.flatMap((member) => {
          const character = getCharacter(roster, member.characterId);
          if (!character) return [];
          return character.cards
            .filter((card) => isUltimateCard(card))
            .map((card) => ({ card, member, character }));
        });
        return (
          <section key={`react-${playerId}`} className="ua-panel ua-panel--wide">
            <div className="ua-panel__header">
              <h2>Reaction ({team.name})</h2>
            </div>
            <div className="ua-card-grid">
              {handEntries.map((entry, index) => {
                const { instance, card, owner } = entry;
                const displayCard = resolveCardForDisplay(card, owner.id);
                const cost = parseCost(displayCard.cost);
                const isVariable = Boolean(cost.variable);
                const xRange = getXRangeFromText(displayCard);
                const isAfterUse =
                  pendingWindow?.type === "after_use" &&
                  matchState.afterUseWindow &&
                  matchState.afterUseWindow.validForAction === matchState.actionId + 1;
                const isFollowUpPlay =
                  Boolean(isAfterUse) &&
                  matchState.afterUseWindow?.lastUsedCharacterId === owner.id;
                const followUpAdjustment = isFollowUpPlay
                  ? getFollowUpCostAdjustment(displayCard)
                  : 0;
                const baseAffordable = canAffordWithAdjustments(
                  team,
                  owner,
                  cost,
                  0,
                  instance,
                  followUpAdjustment
                );
                  const canReact = pendingWindow
                    ? pendingWindow.type === "counter"
                      ? canReactCounter(matchState, displayCard, owner.id)
                      : canReactAfterUse(matchState, displayCard, owner.id)
                    : false;
                  const canControl = canControlPlayer(playerId);
                  const disabled = !canControl || !canReact || !baseAffordable || owner.defeated;
                const adjustment =
                  getEnergyCostAdjustment(owner) +
                  (instance.costAdjustment ?? 0) +
                  followUpAdjustment;
                const isDealt = Boolean(recentlyDealt[instance.id]);
                return (
                  <button
                    key={instance.id}
                    className={`ua-card${isDealt ? " ua-card--deal" : ""}`}
                    style={isDealt ? { animationDelay: `${index * 0.035}s` } : undefined}
                    disabled={disabled}
                    onClick={() => handlePlayCard(playerId, card, owner.id, instance.id)}
                  >
                    <div className="ua-card__title">{displayCard.name}</div>
                    <div className="ua-card__meta">
                      <span>Owner: {owner.name}</span>
                    </div>
                    <div className="ua-card__meta">
                      <span>
                        Cost: {displayCard.cost}
                        {adjustment !== 0 &&
                          ` (Adj ${adjustment >= 0 ? "+" : ""}${adjustment})`}
                      </span>
                      <span>Power: {displayCard.power}</span>
                    </div>
                    <div className="ua-card__meta">
                      <span>Speed: {displayCard.speed}</span>
                      <span>Target: {displayCard.target}</span>
                    </div>
                    <div className="ua-card__tags">{displayCard.types.join(" / ")}</div>
                    <div className="ua-card__effect">
                      {displayCard.effect.map((line, index) =>
                        renderEffectLine(line, `${instance.id}-${index}`)
                      )}
                    </div>
                    {isVariable && <span className="ua-card__tag">X Cost</span>}
                    {xRange && <span className="ua-card__tag">Choose X</span>}
                  </button>
                );
              })}
              {handEntries.length === 0 && <p>No cards in hand.</p>}
            </div>
            {ultimateEntries.length > 0 && (
              <>
                <h3>Ultimates</h3>
                <div className="ua-card-grid">
                  {ultimateEntries.map((entry) => {
                    const { card, member } = entry;
                    const displayCard = resolveCardForDisplay(card, member.id);
                    const cost = parseCost(displayCard.cost);
                    const isVariable = Boolean(cost.variable);
                    const isAfterUse =
                      pendingWindow?.type === "after_use" &&
                      matchState.afterUseWindow &&
                      matchState.afterUseWindow.validForAction === matchState.actionId + 1;
                    const isFollowUpPlay =
                      Boolean(isAfterUse) &&
                      matchState.afterUseWindow?.lastUsedCharacterId === member.id;
                    const followUpAdjustment = isFollowUpPlay
                      ? getFollowUpCostAdjustment(displayCard)
                      : 0;
                    const baseAffordable = canAffordWithAdjustments(
                      team,
                      member,
                      cost,
                      0,
                      undefined,
                      followUpAdjustment
                    );
                    const canReact = pendingWindow
                      ? pendingWindow.type === "counter"
                        ? canReactCounter(matchState, displayCard, member.id)
                        : canReactAfterUse(matchState, displayCard, member.id)
                      : false;
                    const canControl = canControlPlayer(playerId);
                    const disabled = !canControl || !canReact || !baseAffordable || member.defeated;
                    return (
                      <button
                        key={`${member.id}-${card.slot}`}
                        className="ua-card"
                        disabled={disabled}
                        onClick={() => handlePlayCard(playerId, card, member.id)}
                      >
                        <div className="ua-card__title">{displayCard.name}</div>
                        <div className="ua-card__meta">
                          <span>Owner: {member.name}</span>
                        </div>
                        <div className="ua-card__meta">
                          <span>Cost: {displayCard.cost}</span>
                          <span>Power: {displayCard.power}</span>
                        </div>
                        <div className="ua-card__meta">
                          <span>Speed: {displayCard.speed}</span>
                          <span>Target: {displayCard.target}</span>
                        </div>
                        <div className="ua-card__tags">{displayCard.types.join(" / ")}</div>
                        <div className="ua-card__effect">
                          {displayCard.effect.map((line, index) =>
                            renderEffectLine(line, `${member.id}-${card.slot}-${index}`)
                          )}
                        </div>
                        {isVariable && <span className="ua-card__tag">X Cost</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        );
      })}

      {pendingPlay && (
        <div className="ua-modal">
          <div className="ua-modal__content">
            <h3>Play {pendingPlay.card.name}</h3>
            <p className="ua-modal__note">
              Auto choices use deterministic defaults. Override only when you want a specific line of play.
            </p>
            {isTransformPreview && (
              <p className="ua-modal__subnote">
                Transforms from {pendingPlay.baseCard.name}.
              </p>
            )}
            {pendingPlay.zones.length > 1 && (
              <div className="ua-modal__zones">
                <p>Choose a zone:</p>
                <div className="ua-modal__zone-buttons">
                  {pendingPlay.zones.map((zone) => (
                    <button
                      key={zone}
                      className={`ua-button ${pendingPlay.zone === zone ? "ua-button--primary" : ""}`}
                      onClick={() => updatePendingPlay({ zone })}
                    >
                      {zoneLabel(zone)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pendingPlay.targets.length > 1 && (
              <div className="ua-modal__zones">
                <p>Choose a target:</p>
                <div className="ua-modal__zone-buttons">
                  {pendingPlay.targets.map((target) => {
                    const preview =
                      pendingTargetPreview?.options.find((option) => option.id === target.id) ??
                      null;
                    return (
                      <button
                        key={target.id}
                        className={`ua-button ${pendingPlay.targetId === target.id ? "ua-button--primary" : ""}`}
                        onClick={() => updatePendingPlay({ targetId: target.id })}
                      >
                        {target.label}
                        {preview?.isTransformed && (
                          <span className="ua-target-tag">Transforms</span>
                        )}
                        {preview?.isRetarget && (
                          <span className="ua-target-tag ua-target-tag--warn">Retargets</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {pendingTargetPreview?.active && (
                  <>
                    {pendingTargetPreview.active.legalTargets.length === 0 && (
                      <p className="ua-modal__warning">
                        No legal targets after transform.
                      </p>
                    )}
                    {pendingTargetPreview.active.legalTargets.length > 0 &&
                      (pendingTargetPreview.active.isRetarget ||
                        pendingTargetPreview.active.isTransformed) && (
                        <p className="ua-modal__warning">
                          Target will resolve as {pendingTargetPreview.autoTargetLabel}.
                        </p>
                      )}
                    {pendingTargetPreview.active.legalTargets.length > 0 &&
                      (pendingTargetPreview.active.isRetarget ||
                        pendingTargetPreview.active.isTransformed) && (
                        <p className="ua-modal__subnote">
                          Legal targets after transform:{" "}
                          {pendingTargetPreview.legalTargetLabels.join(", ")}.
                        </p>
                      )}
                  </>
                )}
              </div>
            )}
            {pendingPlay.choices.length > 0 && (
              <div className="ua-modal__zones">
                <p>Choose an effect:</p>
                <div className="ua-modal__zone-buttons">
                  {pendingPlay.choices.map((choice) => (
                    <button
                      key={choice.index}
                      className={`ua-button ${pendingPlay.choiceIndex === choice.index ? "ua-button--primary" : ""}`}
                      onClick={() => updatePendingPlay({ choiceIndex: choice.index })}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pendingPlay.redirectOptions.length > 1 && (
              <div className="ua-modal__zones">
                <p>Choose a redirect target (defender choice):</p>
                <p className="ua-modal__subnote">Auto uses Cover first, then Redirect targets.</p>
                <div className="ua-modal__zone-buttons">
                  <button
                    className={`ua-button ${!pendingPlay.redirectTargetId ? "ua-button--primary" : ""}`}
                    onClick={() => setRedirectTarget(undefined)}
                  >
                    Auto
                  </button>
                  {pendingPlay.redirectOptions.map((option) => (
                    <button
                      key={option.id}
                      className={`ua-button ${pendingPlay.redirectTargetId === option.id ? "ua-button--primary" : ""}`}
                      onClick={() => setRedirectTarget(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pendingPlay.needsPushDirection && (
              <div className="ua-modal__zones">
                <p>Push direction (opposed target):</p>
                <p className="ua-modal__subnote">
                  Auto chooses a valid direction along the target's team line.
                </p>
                <div className="ua-modal__zone-buttons">
                  <button
                    className={`ua-button ${!pendingPlay.pushDirection ? "ua-button--primary" : ""}`}
                    onClick={() => setPushDirection(undefined)}
                  >
                    Auto
                  </button>
                  <button
                    className={`ua-button ${pendingPlay.pushDirection === "left" ? "ua-button--primary" : ""}`}
                    onClick={() => setPushDirection("left")}
                  >
                    Left
                  </button>
                  <button
                    className={`ua-button ${pendingPlay.pushDirection === "right" ? "ua-button--primary" : ""}`}
                    onClick={() => setPushDirection("right")}
                  >
                    Right
                  </button>
                </div>
              </div>
            )}
            {pendingPlay.scry && pendingPlay.scry.cards.length > 0 && (
              <div className="ua-modal__zones">
                <p>Scry: discard any number, then reorder the rest.</p>
                <p className="ua-modal__subnote">
                  Kept cards are ordered top-first (drawn next).
                </p>
                <div className="ua-scry-list">
                  {pendingPlay.scry.cards.map((instance) => {
                    const cardEntry = getCardByInstance(instance);
                    const owner = getCharacter(roster, instance.characterId);
                    const ownerLabel = owner ? owner.name : instance.characterId;
                    const label = cardEntry?.name ?? instance.cardSlot;
                    const isDiscarded = pendingPlay.scry?.discardIds.includes(instance.id);
                    return (
                      <div key={instance.id} className="ua-scry-item">
                        <div>
                          <div className="ua-scry-name">{label}</div>
                          <div className="ua-scry-meta">{ownerLabel}</div>
                        </div>
                        <button
                          className={`ua-button ${isDiscarded ? "ua-button--primary" : ""}`}
                          onClick={() => toggleScryDiscard(instance.id)}
                        >
                          {isDiscarded ? "Discarding" : "Keep"}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {pendingPlay.scry.orderIds.length > 1 && (
                  <div className="ua-scry-order">
                    <p>Order kept cards (top first):</p>
                    {pendingPlay.scry.orderIds.map((cardId, index) => {
                      const instance = pendingPlay.scry?.cards.find(
                        (entry) => entry.id === cardId
                      );
                      if (!instance) return null;
                      const cardEntry = getCardByInstance(instance);
                      const label = cardEntry?.name ?? instance.cardSlot;
                      return (
                        <div key={cardId} className="ua-scry-order-item">
                          <span>{index + 1}. {label}</span>
                          <div className="ua-scry-order-controls">
                            <button
                              className="ua-button"
                              onClick={() => moveScryOrder(cardId, -1)}
                            >
                              Up
                            </button>
                            <button
                              className="ua-button"
                              onClick={() => moveScryOrder(cardId, 1)}
                            >
                              Down
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {pendingPlay.seek && pendingPlay.seek.cards.length > 0 && (
              <div className="ua-modal__zones">
                <p>
                  Seek ({pendingPlay.seek.criteria}, take up to {pendingPlay.seek.take}):
                </p>
                <p className="ua-modal__subnote">
                  Selected:{" "}
                  {pendingPlay.seek.takeIds ? pendingPlay.seek.takeIds.length : "Auto"} /
                  {pendingPlay.seek.take}
                </p>
                <div className="ua-seek-list">
                  {pendingPlay.seek.cards.map((instance) => {
                    const cardEntry = getCardByInstance(instance);
                    const owner = getCharacter(roster, instance.characterId);
                    const ownerLabel = owner ? owner.name : instance.characterId;
                    const label = cardEntry?.name ?? instance.cardSlot;
                    const matches = cardEntry
                      ? matchesSearchCriteria(cardEntry, pendingPlay.seek!.criteria)
                      : false;
                    const isSelected = pendingPlay.seek?.takeIds?.includes(instance.id) ?? false;
                    return (
                      <div key={instance.id} className="ua-seek-item">
                        <div>
                          <div className="ua-seek-name">{label}</div>
                          <div className="ua-seek-meta">{ownerLabel}</div>
                        </div>
                        <button
                          className={`ua-button ${isSelected ? "ua-button--primary" : ""}`}
                          disabled={!matches}
                          onClick={() => toggleSeekTake(instance.id)}
                        >
                          {matches ? (isSelected ? "Selected" : "Take") : "No match"}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="ua-seek-controls">
                  <button className="ua-button" onClick={setSeekAuto}>
                    Auto
                  </button>
                  <button className="ua-button" onClick={setSeekNone}>
                    Take none
                  </button>
                </div>
              </div>
            )}
            {pendingPlay.search && (
              <div className="ua-modal__zones">
                <p>Search ({pendingPlay.search.criteria}):</p>
                <p className="ua-modal__subnote">Auto picks the first matching card.</p>
                {pendingPlay.search.options.length === 0 ? (
                  <p>No matching cards in the draw pile.</p>
                ) : (
                  <div className="ua-search-list">
                    {pendingPlay.search.options.map((option) => (
                      <button
                        key={option.id}
                        className={`ua-button ${pendingPlay.search?.pickId === option.id ? "ua-button--primary" : ""}`}
                        onClick={() => setSearchPick(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="ua-search-controls">
                  <button className="ua-button" onClick={() => setSearchPick(undefined)}>
                    Auto
                  </button>
                </div>
              </div>
            )}
            {(parseCost(pendingPlay.card.cost).variable || pendingPlay.xRange) && (
              <p>
                {pendingPlay.xRange
                  ? `Choose X between ${pendingPlay.xRange.min} and ${pendingPlay.xRange.max}.`
                  : "Set the X value to spend for this card."}
              </p>
            )}
            <div className="ua-modal__controls">
              {(parseCost(pendingPlay.card.cost).variable || pendingPlay.xRange) && (
                <input
                  type="number"
                  min={pendingPlay.xRange ? pendingPlay.xRange.min : 0}
                  max={pendingPlay.xRange ? pendingPlay.xRange.max : pendingPlay.xValue}
                  value={pendingPlay.xValue}
                  onChange={(event) =>
                    updatePendingPlay({ xValue: Number(event.target.value) || 0 })
                  }
                />
              )}
              <button className="ua-button ua-button--primary" onClick={confirmXPlay}>
                Confirm
              </button>
              <button
                className="ua-button ua-button--ghost"
                onClick={() => {
                  sound.play("click");
                  setPendingPlay(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {inspectPile && inspectPlayer && (
        <div className="ua-modal">
          <div className="ua-modal__content ua-modal__content--wide">
            <h3>{inspectLabel}</h3>
            <p className="ua-pile-note">
              Total cards: {inspectInstances.length}. {inspectNote}
            </p>
            <div className="ua-pile-list">
              {isDeckPile ? (
                <>
                  {inspectSummary.length === 0 && (
                    <p className="ua-empty">No cards in this pile.</p>
                  )}
                  {inspectSummary.map((entry) => (
                    <div key={`${entry.slot}-${entry.name}`} className="ua-pile-item">
                      <div>
                        <div className="ua-pile-name">{entry.name}</div>
                        <div className="ua-pile-meta">{entry.types}</div>
                        <div className="ua-pile-meta">{entry.owner}</div>
                      </div>
                      <div className="ua-pile-count">{entry.count}</div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {orderedInstances.length === 0 && (
                    <p className="ua-empty">No cards in this pile.</p>
                  )}
                  {orderedInstances.map((instance, index) => {
                    const card = getCardByInstance(instance);
                    const owner = getCharacter(roster, instance.characterId);
                    const ownerLabel = owner
                      ? `${owner.name} (${owner.version})`
                      : instance.characterId;
                    const name = card?.name ?? instance.cardSlot;
                    const types = card ? card.types.join(" / ") : "Unknown";
                    const isTop = index === 0;
                    const isBottom = index === orderedInstances.length - 1;
                    const label = isTop ? "Top" : isBottom ? "Bottom" : `#${index + 1}`;
                    return (
                      <div key={instance.id} className="ua-pile-item">
                        <div>
                          <div className="ua-pile-name">{name}</div>
                          <div className="ua-pile-meta">{types}</div>
                          <div className="ua-pile-meta">{ownerLabel}</div>
                        </div>
                        <div className="ua-pile-order">{label}</div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
            <div className="ua-modal__controls">
              <button className="ua-button ua-button--primary" onClick={closePile}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {matchState.winnerId && (
        <div className="ua-toast ua-toast--winner">
          Winner: {matchState.players[matchState.winnerId].name}
        </div>
      )}

      <footer className="ua-footer">
        <p>
          Prototype rules engine: zones, clashes, and priority are live. Structured effects are
          rolling in, with legacy parsing covering unconverted cards.
        </p>
      </footer>
    </div>
    </>
  );
};

export default App;

