import { useMemo, useState } from "react";
import { characters as roster, keywords, statusEffects } from "@ua/data";
import type { Card, Character, Keyword, StatusEffectDefinition } from "@ua/data";
import {
  applyAction,
  createMatchState,
  getLegalTargets,
  parseCost,
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

const getPlayableZones = (
  card: Card,
  state: MatchState,
  member: TeamMember
): ZoneName[] => {
  const effectiveSpeed = getEffectiveSpeed(card.speed, member);
  const legal = getLegalZonesForSpeed(effectiveSpeed);
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
  const window = state.afterUseWindow;
  if (!window || window.validForAction !== state.actionId + 1) return false;
  const teamId = getTeamIdFromMatchCharacterId(sourceId);
  if (!teamId || teamId !== window.lastUsedBy) return false;
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

const getReactivePlayers = (state: MatchState, rosterList: Character[]) => {
  const window = state.afterUseWindow;
  if (!window || window.validForAction !== state.actionId + 1) return [];
  const reactiveId = window.lastUsedBy;
  const team = state.players[reactiveId];
  const handReact = team.hand.some((instance) => {
    const card = getCardByInstance(instance);
    const ownerEntry = getMemberById(state, instance.ownerId);
    if (!card || !ownerEntry) return false;
    return canReactAfterUse(state, card, ownerEntry.member.id);
  });
  const ultimateReact = team.characters.some((member) => {
    if (member.defeated) return false;
    const character = getCharacter(rosterList, member.characterId);
    if (!character) return false;
    return character.cards.some(
      (card) =>
        isUltimateCard(card) && canReactAfterUse(state, card, member.id)
    );
  });
  return handReact || ultimateReact ? [reactiveId] : [];
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

const getStatusMode = (status: StatusEffectDefinition) => {
  if (status.potencyMax !== undefined || status.countMax !== undefined) return "P/C";
  if (status.stackMax !== undefined) return "S";
  if (status.valueMax !== undefined) return "V";
  return "None";
};

const getStatusTurnEnd = (status: StatusEffectDefinition) => {
  const turnEndRules = status.rules
    .filter((rule) => rule.timing.trim().toLowerCase() === "turn end")
    .map((rule) => rule.text.trim())
    .filter(Boolean);
  if (!turnEndRules.length) return "No change";
  return turnEndRules.join(" / ");
};


const App = () => {
  const rosterSorted = useMemo(() => sortRoster(roster), []);
  const keywordMatchers = useMemo(() => buildKeywordMatchers(keywords), [keywords]);
  const statusDetails = useMemo(() => {
    const map = new Map<string, { mode: string; turnEnd: string }>();
    statusEffects.forEach((status) => {
      map.set(normalizeKey(status.name), {
        mode: getStatusMode(status),
        turnEnd: getStatusTurnEnd(status),
      });
    });
    return map;
  }, [statusEffects]);
  const [stage, setStage] = useState<Stage>("setup");
  const [names, setNames] = useState({ p1: "Player 1", p2: "Player 2" });
  const [selection, setSelection] = useState<SelectionState>(defaultSelection);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingPlay, setPendingPlay] = useState<PendingPlay | null>(null);
  const [inspectPile, setInspectPile] = useState<{
    playerId: PlayerId;
    pile: PileType;
  } | null>(null);

  const startMatch = () => {
    try {
      const state = createMatchState(roster, [
        { id: "p1", name: names.p1.trim() || "Player 1", characterIds: selection.p1 },
        { id: "p2", name: names.p2.trim() || "Player 2", characterIds: selection.p2 },
      ]);
      setMatchState(state);
      setStage("match");
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to start match.");
    }
  };

  const resetMatch = () => {
    setMatchState(null);
    setStage("setup");
    setMessage(null);
  };

  const handleAction = (action: Parameters<typeof applyAction>[1]) => {
    if (!matchState) return;
    const result = applyAction(matchState, action, roster);
    setMatchState(result.state);
    setMessage(result.error ?? null);
  };

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

  const updatePendingPlay = (overrides: Partial<PendingPlay>) => {
    setPendingPlay((prev) => {
      if (!prev) return prev;
      const merged = { ...prev, ...overrides };
      return buildPendingMeta(
        {
          playerId: merged.playerId,
          card: merged.card,
          cardInstanceId: merged.cardInstanceId,
          sourceId: merged.sourceId,
          zones: merged.zones,
          zone: merged.zone,
          xValue: merged.xValue,
          xRange: merged.xRange,
          choices: merged.choices,
          choiceIndex: merged.choiceIndex,
          targets: merged.targets,
          targetId: merged.targetId,
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
    if (matchState.phase === "movement") {
      setMessage("Movement Round in progress.");
      return;
    }
    const team = matchState.players[playerId];
    const ownerEntry = getMemberById(matchState, sourceId);
    if (!ownerEntry || ownerEntry.teamId !== playerId) {
      setMessage("Card source not found.");
      return;
    }
    const member = ownerEntry.member;
    const zones = getPlayableZones(card, matchState, member);
    if (!zones.length) {
      setMessage("No legal zones available.");
      return;
    }
    const cardInstance = cardInstanceId
      ? team.hand.find((instance) => instance.id === cardInstanceId)
      : undefined;
    const cost = parseCost(card.cost);
    const xRange = getXRangeFromText(card);
    const isAfterUse =
      matchState.afterUseWindow &&
      matchState.afterUseWindow.validForAction === matchState.actionId + 1;
    const isFollowUpPlay =
      Boolean(isAfterUse) && matchState.afterUseWindow?.lastUsedCharacterId === sourceId;
    const followUpAdjustment = isFollowUpPlay ? getFollowUpCostAdjustment(card) : 0;
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
    const choices = getCardChoices(card);
    let targets = getLegalTargets(card, sourceId, matchState, roster).map((targetId) => ({
      id: targetId,
      label: formatMemberLabel(matchState, targetId),
    }));
    if (!targets.length) {
      setMessage("No legal targets.");
      return;
    }
    const targetText = card.target.toLowerCase();
    if (targetText.includes("all enemies") || targetText.includes("all allies")) {
      targets = [targets[0]];
    }
    const basePending = {
      playerId,
      card,
      cardInstanceId,
      sourceId,
      zones,
      zone: zones[0],
      xValue: xRange ? xRange.max : max,
      xRange,
      choices,
      choiceIndex: 0,
      targets,
      targetId: targets[0].id,
    };
    const pendingWithMeta = buildPendingMeta(basePending, null);
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
      setMessage("Insufficient resources.");
      return;
    }
    if (!cost.variable && xRange && !baseAffordable) {
      setMessage("Insufficient resources.");
      return;
    }
    if (xRange && xRange.max < xRange.min) {
      setMessage("Invalid X range.");
      return;
    }
    if (!needsModal) {
      handleAction({
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
    setPendingPlay(pendingWithMeta);
  };

  const openPile = (playerId: PlayerId, pile: PileType) => {
    setInspectPile({ playerId, pile });
  };

  const closePile = () => {
    setInspectPile(null);
  };

  const confirmXPlay = () => {
    if (!pendingPlay) return;
    handleAction({
      type: "play_card",
      playerId: pendingPlay.playerId,
      cardSlot: pendingPlay.card.slot,
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
          <h1>Local Match Setup</h1>
          <p className="ua-subtitle">
              Pick three characters per team from the current roster and start a hot-seat match.
          </p>
        </div>
        <div className="ua-badge">Prototype Engine</div>
        </header>

        {message && <div className="ua-toast">{message}</div>}

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
                    onChange={(event) =>
                      setNames((prev) => ({ ...prev, [playerId]: event.target.value }))
                    }
                  />
                </label>
                <div className="ua-team-selects">
                  {selected.map((selectionId, index) => (
                    <label key={`${playerId}-${index}`} className="ua-label">
                      Character {index + 1}
                      <select
                        value={selectionId}
                        onChange={(event) =>
                          setSelection((prev) => {
                            const next = [...prev[playerId]];
                            next[index] = event.target.value;
                            return { ...prev, [playerId]: next };
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
          <button className="ua-button ua-button--primary" onClick={startMatch}>
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
  const allReactivePlayers = getReactivePlayers(matchState, roster);
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

  return (
    <div className="ua-shell">
      <header className="ua-header">
        <div>
          <p className="ua-kicker">Universal Arena</p>
          <h1>Local Match</h1>
          <p className="ua-subtitle">
            Turn {matchState.turn} • Active: {activeTeam.name}
          </p>
        </div>
        <div className="ua-header__actions">
          <button className="ua-button ua-button--ghost" onClick={resetMatch}>
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
                    className="ua-stat-button"
                    onClick={() => openPile(playerId, "deck")}
                  >
                    <span>Deck</span>
                    <strong>{team.deck.length}</strong>
                  </button>
                  <button
                    type="button"
                    className="ua-stat-button"
                    onClick={() => openPile(playerId, "discard")}
                  >
                    <span>Discard</span>
                    <strong>{team.discard.length}</strong>
                  </button>
                  <button
                    type="button"
                    className="ua-stat-button"
                    onClick={() => openPile(playerId, "exhausted")}
                  >
                    <span>Exhaust</span>
                    <strong>{team.exhausted.length}</strong>
                  </button>
                </div>
                <p className="ua-pile-hint">
                  Click Deck, Discard, or Exhaust to inspect pile contents.
                </p>
                <div className="ua-team-characters">
                  {team.characters.map((member) => {
                    const character = getCharacter(roster, member.characterId);
                    const statusEntries = formatStatusList(member.statuses);
                    return (
                      <div
                        key={member.id}
                        className={`ua-character-card${member.defeated ? " is-defeated" : ""}`}
                      >
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
                                ? `${status}\nMode: ${info.mode}\nTurn End: ${info.turnEnd}`
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
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="ua-panel ua-panel--wide">
        <div className="ua-panel__header">
          <h2>Event Log</h2>
          <div className="ua-inline-actions">
            <button
              className="ua-button ua-button--ghost"
              onClick={() => handleAction({ type: "clear_log", playerId: matchState.activePlayerId })}
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
              disabled={matchState.activePlayerId !== activeTeam.id}
              onClick={() => handleAction({ type: "pass", playerId: activeTeam.id })}
            >
              Pass
            </button>
            <button
              className="ua-button"
              disabled={
                matchState.activePlayerId !== matchState.initiativePlayerId ||
                matchState.activeZone !== null ||
                matchState.phase !== "combat"
              }
              onClick={() =>
                handleAction({ type: "end_turn", playerId: matchState.initiativePlayerId })
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
                    matchState.activePlayerId !== activeTeam.id || activeTeam.energy < 1
                  }
                  onClick={() =>
                    handleAction({
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
        {reactionNames.length > 0 && (
          <p className="ua-zone-status">
            Reaction window: {reactionNames.join(" / ")} can play Follow-Up or Assist Attack now.
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
            {activeHand.map((entry) => {
              const { instance, card, owner } = entry;
              const cost = parseCost(card.cost);
              const isVariable = Boolean(cost.variable);
              const xRange = getXRangeFromText(card);
              const isAfterUse =
                matchState.afterUseWindow &&
                matchState.afterUseWindow.validForAction === matchState.actionId + 1;
              const isFollowUpPlay =
                Boolean(isAfterUse) &&
                matchState.afterUseWindow?.lastUsedCharacterId === owner.id;
              const followUpAdjustment = isFollowUpPlay ? getFollowUpCostAdjustment(card) : 0;
              const baseAffordable = canAffordWithAdjustments(
                activeTeam,
                owner,
                cost,
                0,
                instance,
                followUpAdjustment
              );
              const canAct =
                matchState.activePlayerId === activeTeam.id ||
                canReactAfterUse(matchState, card, owner.id);
              const disabled = !canAct || !baseAffordable || owner.defeated;
              const adjustment =
                getEnergyCostAdjustment(owner) +
                (instance.costAdjustment ?? 0) +
                followUpAdjustment;
              return (
                <button
                  key={instance.id}
                  className="ua-card"
                  disabled={disabled}
                  onClick={() => handlePlayCard(activeTeam.id, card, owner.id, instance.id)}
                >
                  <div className="ua-card__title">{card.name}</div>
                  <div className="ua-card__meta">
                    <span>Owner: {owner.name}</span>
                  </div>
                  <div className="ua-card__meta">
                    <span>
                      Cost: {card.cost}
                      {adjustment !== 0 &&
                        ` (Adj ${adjustment >= 0 ? "+" : ""}${adjustment})`}
                    </span>
                    <span>Power: {card.power}</span>
                  </div>
                  <div className="ua-card__meta">
                    <span>Speed: {card.speed}</span>
                    <span>Target: {card.target}</span>
                  </div>
                  <div className="ua-card__tags">{card.types.join(" / ")}</div>
                  <div className="ua-card__effect">
                    {card.effect.map((line, index) =>
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
                  const cost = parseCost(card.cost);
                  const isVariable = Boolean(cost.variable);
                  const isAfterUse =
                    matchState.afterUseWindow &&
                    matchState.afterUseWindow.validForAction === matchState.actionId + 1;
                  const isFollowUpPlay =
                    Boolean(isAfterUse) &&
                    matchState.afterUseWindow?.lastUsedCharacterId === member.id;
                  const followUpAdjustment = isFollowUpPlay ? getFollowUpCostAdjustment(card) : 0;
                  const baseAffordable = canAffordWithAdjustments(
                    activeTeam,
                    member,
                    cost,
                    0,
                    undefined,
                    followUpAdjustment
                  );
                  const canAct =
                    matchState.activePlayerId === activeTeam.id ||
                    canReactAfterUse(matchState, card, member.id);
                  const disabled = !canAct || !baseAffordable || member.defeated;
                  return (
                    <button
                      key={`${member.id}-${card.slot}`}
                      className="ua-card"
                      disabled={disabled}
                      onClick={() => handlePlayCard(activeTeam.id, card, member.id)}
                    >
                      <div className="ua-card__title">{card.name}</div>
                      <div className="ua-card__meta">
                        <span>Owner: {member.name}</span>
                      </div>
                      <div className="ua-card__meta">
                        <span>Cost: {card.cost}</span>
                        <span>Power: {card.power}</span>
                      </div>
                      <div className="ua-card__meta">
                        <span>Speed: {card.speed}</span>
                        <span>Target: {card.target}</span>
                      </div>
                      <div className="ua-card__tags">{card.types.join(" / ")}</div>
                      <div className="ua-card__effect">
                        {card.effect.map((line, index) =>
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
              {handEntries.map((entry) => {
                const { instance, card, owner } = entry;
                const cost = parseCost(card.cost);
                const isVariable = Boolean(cost.variable);
                const xRange = getXRangeFromText(card);
                const isAfterUse =
                  matchState.afterUseWindow &&
                  matchState.afterUseWindow.validForAction === matchState.actionId + 1;
                const isFollowUpPlay =
                  Boolean(isAfterUse) &&
                  matchState.afterUseWindow?.lastUsedCharacterId === owner.id;
                const followUpAdjustment = isFollowUpPlay ? getFollowUpCostAdjustment(card) : 0;
                const baseAffordable = canAffordWithAdjustments(
                  team,
                  owner,
                  cost,
                  0,
                  instance,
                  followUpAdjustment
                );
                const canReact = canReactAfterUse(matchState, card, owner.id);
                const disabled = !canReact || !baseAffordable || owner.defeated;
                const adjustment =
                  getEnergyCostAdjustment(owner) +
                  (instance.costAdjustment ?? 0) +
                  followUpAdjustment;
                return (
                  <button
                    key={instance.id}
                    className="ua-card"
                    disabled={disabled}
                    onClick={() => handlePlayCard(playerId, card, owner.id, instance.id)}
                  >
                    <div className="ua-card__title">{card.name}</div>
                    <div className="ua-card__meta">
                      <span>Owner: {owner.name}</span>
                    </div>
                    <div className="ua-card__meta">
                      <span>
                        Cost: {card.cost}
                        {adjustment !== 0 &&
                          ` (Adj ${adjustment >= 0 ? "+" : ""}${adjustment})`}
                      </span>
                      <span>Power: {card.power}</span>
                    </div>
                    <div className="ua-card__meta">
                      <span>Speed: {card.speed}</span>
                      <span>Target: {card.target}</span>
                    </div>
                    <div className="ua-card__tags">{card.types.join(" / ")}</div>
                    <div className="ua-card__effect">
                      {card.effect.map((line, index) =>
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
                    const cost = parseCost(card.cost);
                    const isVariable = Boolean(cost.variable);
                    const isAfterUse =
                      matchState.afterUseWindow &&
                      matchState.afterUseWindow.validForAction === matchState.actionId + 1;
                    const isFollowUpPlay =
                      Boolean(isAfterUse) &&
                      matchState.afterUseWindow?.lastUsedCharacterId === member.id;
                    const followUpAdjustment = isFollowUpPlay ? getFollowUpCostAdjustment(card) : 0;
                    const baseAffordable = canAffordWithAdjustments(
                      team,
                      member,
                      cost,
                      0,
                      undefined,
                      followUpAdjustment
                    );
                    const canReact = canReactAfterUse(matchState, card, member.id);
                    const disabled = !canReact || !baseAffordable || member.defeated;
                    return (
                      <button
                        key={`${member.id}-${card.slot}`}
                        className="ua-card"
                        disabled={disabled}
                        onClick={() => handlePlayCard(playerId, card, member.id)}
                      >
                        <div className="ua-card__title">{card.name}</div>
                        <div className="ua-card__meta">
                          <span>Owner: {member.name}</span>
                        </div>
                        <div className="ua-card__meta">
                          <span>Cost: {card.cost}</span>
                          <span>Power: {card.power}</span>
                        </div>
                        <div className="ua-card__meta">
                          <span>Speed: {card.speed}</span>
                          <span>Target: {card.target}</span>
                        </div>
                        <div className="ua-card__tags">{card.types.join(" / ")}</div>
                        <div className="ua-card__effect">
                          {card.effect.map((line, index) =>
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
                  {pendingPlay.targets.map((target) => (
                    <button
                      key={target.id}
                      className={`ua-button ${pendingPlay.targetId === target.id ? "ua-button--primary" : ""}`}
                      onClick={() => updatePendingPlay({ targetId: target.id })}
                    >
                      {target.label}
                    </button>
                  ))}
                </div>
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
              <button className="ua-button ua-button--ghost" onClick={() => setPendingPlay(null)}>
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
  );
};

export default App;

