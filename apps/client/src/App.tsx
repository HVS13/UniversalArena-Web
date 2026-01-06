import { useMemo, useState } from "react";
import { characters as roster, keywords, statusEffects } from "@ua/data";
import type { Card, Character, Keyword, StatusEffectDefinition } from "@ua/data";
import {
  applyAction,
  createMatchState,
  parseCost,
  type MatchState,
  type PlayerId,
  type ZoneName,
} from "@ua/core";

type Stage = "setup" | "match";

type SelectionState = {
  p1: string;
  p2: string;
};

const defaultSelection = (): SelectionState => {
  const [first, second] = roster;
  return {
    p1: first?.id ?? "",
    p2: second?.id ?? first?.id ?? "",
  };
};

const sortRoster = (list: Character[]) =>
  [...list].sort((a, b) => `${a.name} ${a.version}`.localeCompare(`${b.name} ${b.version}`));

const getCharacter = (list: Character[], id: string) => list.find((entry) => entry.id === id);

type CardInstance = MatchState["players"][PlayerId]["hand"][number];

type PileType = "deck" | "discard" | "exhausted";

type PileSummary = {
  name: string;
  slot: string;
  count: number;
  types: string;
};

const getCardBySlot = (character: Character | undefined, slot: string) => {
  if (!character) return undefined;
  const card = character.cards.find((entry) => entry.slot === slot);
  if (card) return card;
  return character.createdCards?.find((entry) => entry.slot === slot);
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

const summarizePile = (
  instances: CardInstance[],
  character: Character | undefined
): PileSummary[] => {
  const map = new Map<string, PileSummary>();
  instances.forEach((instance) => {
    const card = getCardBySlot(character, instance.cardSlot);
    const name = card?.name ?? instance.cardSlot;
    const types = card ? card.types.join(" / ") : "Unknown";
    const key = `${instance.cardSlot}-${name}`;
    const entry = map.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      map.set(key, { name, slot: instance.cardSlot, count: 1, types });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const isUltimateCard = (card: Card) =>
  card.types.some((type) => type.toLowerCase() === "ultimate");

const isStatusActive = (state?: MatchState["players"][PlayerId]["statuses"][string]) => {
  if (!state) return false;
  if (state.potency > 0) return state.count > 0;
  if (state.stack > 0) return true;
  return state.value > 0;
};

const getStatusStat = (
  player: MatchState["players"][PlayerId],
  status: string,
  stat: "potency" | "count" | "stack" | "value"
) => {
  const state = player.statuses[status];
  if (!isStatusActive(state)) return 0;
  return state[stat];
};

const getEnergyCostAdjustment = (player: MatchState["players"][PlayerId]) => {
  const focus = getStatusStat(player, "Focus", "potency");
  const strain = getStatusStat(player, "Strain", "potency");
  const bloodFocus = getStatusStat(player, "Blood Focus", "value");
  return strain - focus - bloodFocus;
};

const getAdjustedEnergyCost = (
  player: MatchState["players"][PlayerId],
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
    getEnergyCostAdjustment(player) +
    (cardInstance?.costAdjustment ?? 0) +
    followUpAdjustment;
  return Math.max(0, base);
};

const canAffordWithAdjustments = (
  player: MatchState["players"][PlayerId],
  cost: ReturnType<typeof parseCost>,
  xValue: number,
  cardInstance?: CardInstance,
  followUpAdjustment = 0
) => {
  const energyCost = getAdjustedEnergyCost(
    player,
    cost,
    xValue,
    cardInstance,
    followUpAdjustment
  );
  const variableUltimate =
    cost.variable?.type === "ultimate" ? cost.variable.multiplier * xValue : 0;
  const ultimateCost = cost.ultimate + variableUltimate;
  return player.energy >= energyCost && player.ultimate >= ultimateCost;
};

const getMaxX = (
  player: MatchState["players"][PlayerId],
  cost: ReturnType<typeof parseCost>,
  cardInstance?: CardInstance,
  followUpAdjustment = 0
) => {
  if (!cost.variable) return 0;
  const available =
    cost.variable.type === "energy"
      ? player.energy -
        Math.max(
          0,
          cost.energy +
            getEnergyCostAdjustment(player) +
            (cardInstance?.costAdjustment ?? 0) +
            followUpAdjustment
        )
      : player.ultimate - cost.ultimate;
  if (available <= 0) return 0;
  return Math.floor(available / cost.variable.multiplier);
};

const formatRoles = (roles: string[]) =>
  roles.map((role) => role.replace("role-", "")).join(", ");

const formatStatusValue = (state: MatchState["players"][PlayerId]["statuses"][string]) => {
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

const formatStatusList = (statuses: MatchState["players"][PlayerId]["statuses"]) =>
  Object.entries(statuses)
    .map(([status, state]) => {
      const value = formatStatusValue(state);
      return value ? [status, value] : null;
    })
    .filter((entry): entry is [string, string] => entry !== null);

const zoneRank: Record<ZoneName, number> = { slow: 0, normal: 1, fast: 2 };

const zoneLabel = (zone: ZoneName) => zone.charAt(0).toUpperCase() + zone.slice(1);

const getLegalZonesForSpeed = (speed: string): ZoneName[] => {
  const normalized = speed.trim().toLowerCase();
  if (normalized.includes("fast")) return ["fast", "normal", "slow"];
  if (normalized.includes("normal")) return ["normal", "slow"];
  return ["slow"];
};

const getSpeedShift = (player: MatchState["players"][PlayerId]) => {
  const haste = Math.min(2, getStatusStat(player, "Haste", "potency"));
  const slow = Math.min(2, getStatusStat(player, "Slow", "potency"));
  return Math.max(-2, Math.min(2, haste - slow));
};

const getEffectiveSpeed = (
  speed: string,
  player: MatchState["players"][PlayerId]
) => {
  const shift = getSpeedShift(player);
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
  playerId: PlayerId
): ZoneName[] => {
  const player = state.players[playerId];
  const effectiveSpeed = getEffectiveSpeed(card.speed, player);
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

const canReactAfterUse = (state: MatchState, playerId: PlayerId, card: Card) => {
  const window = state.afterUseWindow;
  if (!window || window.validForAction !== state.actionId + 1) return false;
  const flags = getCardKeywords(card);
  const timeStop = state.players[playerId].statuses["The World: Time Stop"];
  const timeStopFollowUp =
    isStatusActive(timeStop) && card.types.some((type) => type.toLowerCase() === "attack");
  if (playerId === window.lastUsedBy) return flags.followUp || timeStopFollowUp;
  return flags.assistAttack;
};

const getReactivePlayers = (state: MatchState, rosterList: Character[]) => {
  const window = state.afterUseWindow;
  if (!window || window.validForAction !== state.actionId + 1) return [];
  return (["p1", "p2"] as PlayerId[]).filter((playerId) => {
    const player = state.players[playerId];
    const character = getCharacter(rosterList, player.characterId);
    if (!character) return false;
    const handCards = player.hand
      .map((instance) => getCardBySlot(character, instance.cardSlot))
      .filter((card): card is Card => Boolean(card));
    return handCards.some((card) => canReactAfterUse(state, playerId, card));
  });
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

type LogEntry = {
  summary: string;
  details?: string[];
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
  const playMatch = line.match(/^(.+?) plays (.+?) in the (.+?) Zone\.$/);
  if (playMatch) {
    const [, player, cardName, zoneName] = playMatch;
    return { summary: `${player} plays ${cardName}`, details: [`Zone: ${zoneName}`] };
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
  const [pendingPlay, setPendingPlay] = useState<{
    playerId: PlayerId;
    card: Card;
    cardInstanceId?: string;
    zones: ZoneName[];
    zone: ZoneName;
    xValue: number;
    xRange?: { min: number; max: number } | null;
    choices: { index: number; label: string }[];
    choiceIndex: number;
  } | null>(null);
  const [inspectPile, setInspectPile] = useState<{
    playerId: PlayerId;
    pile: PileType;
  } | null>(null);

  const startMatch = () => {
    const state = createMatchState(roster, [
      { id: "p1", name: names.p1.trim() || "Player 1", characterId: selection.p1 },
      { id: "p2", name: names.p2.trim() || "Player 2", characterId: selection.p2 },
    ]);
    setMatchState(state);
    setStage("match");
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

  const handlePlayCard = (playerId: PlayerId, card: Card, cardInstanceId?: string) => {
    if (!matchState) return;
    const zones = getPlayableZones(card, matchState, playerId);
    if (!zones.length) {
      setMessage("No legal zones available.");
      return;
    }
    const player = matchState.players[playerId];
    const cardInstance = cardInstanceId
      ? player.hand.find((instance) => instance.id === cardInstanceId)
      : undefined;
    const cost = parseCost(card.cost);
    const xRange = getXRangeFromText(card);
    const isAfterUse =
      matchState.afterUseWindow &&
      matchState.afterUseWindow.validForAction === matchState.actionId + 1;
    const isFollowUpPlay =
      Boolean(isAfterUse) && matchState.afterUseWindow?.lastUsedBy === playerId;
    const followUpAdjustment = isFollowUpPlay ? getFollowUpCostAdjustment(card) : 0;
    const max = cost.variable ? getMaxX(player, cost, cardInstance, followUpAdjustment) : 0;
    const baseAffordable = canAffordWithAdjustments(
      player,
      cost,
      0,
      cardInstance,
      followUpAdjustment
    );
    const choices = getCardChoices(card);
    const needsModal =
      zones.length > 1 || cost.variable || choices.length > 0 || Boolean(xRange);
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
        zone: zones[0],
      });
      return;
    }
    setPendingPlay({
      playerId,
      card,
      cardInstanceId,
      zones,
      zone: zones[0],
      xValue: xRange ? xRange.max : max,
      xRange,
      choices,
      choiceIndex: 0,
    });
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
      zone: pendingPlay.zone,
      xValue: pendingPlay.xValue,
      choiceIndex: pendingPlay.choices.length ? pendingPlay.choiceIndex : undefined,
    });
    setPendingPlay(null);
  };

  if (stage === "setup") {
    return (
      <div className="ua-shell">
        <header className="ua-header">
          <div>
            <p className="ua-kicker">Universal Arena</p>
            <h1>Local Match Setup</h1>
            <p className="ua-subtitle">
              Pick any two characters from the current roster and start a hot-seat match.
            </p>
          </div>
          <div className="ua-badge">Prototype Engine</div>
        </header>

        <section className="ua-setup-grid">
          {(["p1", "p2"] as PlayerId[]).map((playerId) => {
            const selected = selection[playerId];
            const character = getCharacter(roster, selected);
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
                <label className="ua-label">
                  Character
                  <select
                    value={selection[playerId]}
                    onChange={(event) =>
                      setSelection((prev) => ({ ...prev, [playerId]: event.target.value }))
                    }
                  >
                    {rosterSorted.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name} ({entry.version})
                      </option>
                    ))}
                  </select>
                </label>
                {character && (
                  <div className="ua-character-preview">
                    <div className="ua-character-preview__meta">
                      <p className="ua-character-title">
                        {character.name} <span>({character.version})</span>
                      </p>
                      <p className="ua-character-origin">{character.origin}</p>
                      <p className="ua-character-roles">{formatRoles(character.roles)}</p>
                      <p className="ua-character-difficulty">
                        Difficulty: {character.difficulty}
                      </p>
                    </div>
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

  const activePlayer = matchState.players[matchState.activePlayerId];
  const activeCharacter = getCharacter(roster, activePlayer.characterId);
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
  const activeHand = activeCharacter
    ? activePlayer.hand
        .map((instance) => ({
          instance,
          card: getCardBySlot(activeCharacter, instance.cardSlot),
        }))
        .filter((entry): entry is { instance: CardInstance; card: Card } => Boolean(entry.card))
    : [];
  const activeUltimates = activeCharacter
    ? activeCharacter.cards.filter((card) => isUltimateCard(card))
    : [];
  const inspectPlayer = inspectPile ? matchState.players[inspectPile.playerId] : null;
  const inspectCharacter = inspectPlayer
    ? getCharacter(roster, inspectPlayer.characterId)
    : undefined;
  const inspectInstances =
    inspectPlayer && inspectPile ? getPileInstances(inspectPlayer, inspectPile.pile) : [];
  const isDeckPile = inspectPile?.pile === "deck";
  const orderedInstances = !isDeckPile ? [...inspectInstances].reverse() : [];
  const inspectSummary = isDeckPile
    ? summarizePile(inspectInstances, inspectCharacter)
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
            Turn {matchState.turn} • Active: {activePlayer.name}
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
                  const source = matchState.players[entry.playedBy];
                  const target = matchState.players[entry.targetId];
                  return (
                    <div
                      key={entry.id}
                      className={`ua-stack-card ${index === 0 ? "is-top" : ""}`}
                      style={{ animationDelay: `${index * 0.03}s` }}
                    >
                      <div className="ua-stack-card__title">
                        <span>{entry.cardName}</span>
                        {index === 0 && <span className="ua-stack-card__tag">Top</span>}
                      </div>
                      <div className="ua-stack-card__meta">
                        {source.name} → {target.name}
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
          const player = matchState.players[playerId];
          const character = getCharacter(roster, player.characterId);
          const statusEntries = formatStatusList(player.statuses);
          return (
            <div key={playerId} className={`ua-panel ${playerId === matchState.activePlayerId ? "is-active" : ""}`}>
              <div className="ua-panel__header">
                <h2>{player.name}</h2>
                <span className="ua-panel__tag">{playerId.toUpperCase()}</span>
              </div>
              <div className="ua-player-meta">
                <p className="ua-player-character">
                  {character?.name} <span>({character?.version})</span>
                </p>
                <div className="ua-stats">
                  <div>
                    <span>HP</span>
                    <strong>{player.hp}</strong>
                  </div>
                  <div>
                    <span>Shield</span>
                    <strong>{player.shield}</strong>
                  </div>
                  <div>
                    <span>Energy</span>
                    <strong>{player.energy}</strong>
                  </div>
                  <div>
                    <span>Ultimate</span>
                    <strong>{player.ultimate}</strong>
                  </div>
                  <div>
                    <span>Hand</span>
                    <strong>{player.hand.length}</strong>
                  </div>
                  <button
                    type="button"
                    className="ua-stat-button"
                    onClick={() => openPile(playerId, "deck")}
                  >
                    <span>Deck</span>
                    <strong>{player.deck.length}</strong>
                  </button>
                  <button
                    type="button"
                    className="ua-stat-button"
                    onClick={() => openPile(playerId, "discard")}
                  >
                    <span>Discard</span>
                    <strong>{player.discard.length}</strong>
                  </button>
                  <button
                    type="button"
                    className="ua-stat-button"
                    onClick={() => openPile(playerId, "exhausted")}
                  >
                    <span>Exhaust</span>
                    <strong>{player.exhausted.length}</strong>
                  </button>
                </div>
                <p className="ua-pile-hint">
                  Click Deck, Discard, or Exhaust to inspect pile contents.
                </p>
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
                    <div className="ua-log-entry__summary">{entry.summary}</div>
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
              disabled={matchState.activePlayerId !== activePlayer.id}
              onClick={() => handleAction({ type: "pass", playerId: activePlayer.id })}
            >
              Pass
            </button>
            <button
              className="ua-button"
              disabled={
                matchState.activePlayerId !== matchState.initiativePlayerId ||
                matchState.activeZone !== null
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
          Active Zone: {activeZoneLabel} | Paused Zones: {pausedZonesLabel}
        </p>
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
        {activeCharacter ? (
          <>
            <h3 className="ua-hand-title">
              Active Hand <span>({activePlayer.name})</span>
            </h3>
            <div className="ua-card-grid">
              {activeHand.map(({ instance, card }) => {
                const cost = parseCost(card.cost);
                const isVariable = Boolean(cost.variable);
                const xRange = getXRangeFromText(card);
                const baseAffordable = canAffordWithAdjustments(
                  activePlayer,
                  cost,
                  0,
                  instance
                );
                const canAct =
                  matchState.activePlayerId === activePlayer.id ||
                  canReactAfterUse(matchState, activePlayer.id, card);
                const disabled = !canAct || !baseAffordable;
                const adjustment =
                  getEnergyCostAdjustment(activePlayer) + (instance.costAdjustment ?? 0);
                return (
                  <button
                    key={instance.id}
                    className="ua-card"
                    disabled={disabled}
                    onClick={() => handlePlayCard(activePlayer.id, card, instance.id)}
                  >
                    <div className="ua-card__title">{card.name}</div>
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
                  {activeUltimates.map((card) => {
                    const cost = parseCost(card.cost);
                    const isVariable = Boolean(cost.variable);
                    const baseAffordable = canAffordWithAdjustments(activePlayer, cost, 0);
                    const canAct =
                      matchState.activePlayerId === activePlayer.id ||
                      canReactAfterUse(matchState, activePlayer.id, card);
                    const disabled = !canAct || !baseAffordable;
                    return (
                      <button
                        key={card.slot}
                        className="ua-card"
                        disabled={disabled}
                        onClick={() => handlePlayCard(activePlayer.id, card)}
                      >
                        <div className="ua-card__title">{card.name}</div>
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
                            renderEffectLine(line, `${card.slot}-${index}`)
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
        ) : (
          <p>No character selected.</p>
        )}
      </section>

      {reactivePlayers.map((playerId) => {
        const player = matchState.players[playerId];
        const character = getCharacter(roster, player.characterId);
        if (!character) return null;
        return (
          <section key={`react-${playerId}`} className="ua-panel ua-panel--wide">
            <div className="ua-panel__header">
              <h2>Reaction ({player.name})</h2>
            </div>
            <div className="ua-card-grid">
              {player.hand.map((instance) => {
                const card = getCardBySlot(character, instance.cardSlot);
                if (!card) return null;
                const cost = parseCost(card.cost);
                const isVariable = Boolean(cost.variable);
                const xRange = getXRangeFromText(card);
                const isAfterUse =
                  matchState.afterUseWindow &&
                  matchState.afterUseWindow.validForAction === matchState.actionId + 1;
                const isFollowUpPlay =
                  Boolean(isAfterUse) && matchState.afterUseWindow?.lastUsedBy === playerId;
                const followUpAdjustment = isFollowUpPlay ? getFollowUpCostAdjustment(card) : 0;
                const baseAffordable = canAffordWithAdjustments(
                  player,
                  cost,
                  0,
                  instance,
                  followUpAdjustment
                );
                const canReact = canReactAfterUse(matchState, playerId, card);
                const disabled = !canReact || !baseAffordable;
                const adjustment =
                  getEnergyCostAdjustment(player) +
                  (instance.costAdjustment ?? 0) +
                  followUpAdjustment;
                return (
                  <button
                    key={instance.id}
                    className="ua-card"
                    disabled={disabled}
                    onClick={() => handlePlayCard(playerId, card, instance.id)}
                  >
                    <div className="ua-card__title">{card.name}</div>
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
              {player.hand.length === 0 && <p>No cards in hand.</p>}
            </div>
          </section>
        );
      })}

      {pendingPlay && (
        <div className="ua-modal">
          <div className="ua-modal__content">
            <h3>Play {pendingPlay.card.name}</h3>
            {pendingPlay.zones.length > 1 && (
              <div className="ua-modal__zones">
                <p>Choose a zone:</p>
                <div className="ua-modal__zone-buttons">
                  {pendingPlay.zones.map((zone) => (
                    <button
                      key={zone}
                      className={`ua-button ${pendingPlay.zone === zone ? "ua-button--primary" : ""}`}
                      onClick={() =>
                        setPendingPlay((prev) =>
                          prev ? { ...prev, zone } : prev
                        )
                      }
                    >
                      {zoneLabel(zone)}
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
                      onClick={() =>
                        setPendingPlay((prev) =>
                          prev ? { ...prev, choiceIndex: choice.index } : prev
                        )
                      }
                    >
                      {choice.label}
                    </button>
                  ))}
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
                    setPendingPlay((prev) =>
                      prev ? { ...prev, xValue: Number(event.target.value) || 0 } : prev
                    )
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
                    const card = getCardBySlot(inspectCharacter, instance.cardSlot);
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
