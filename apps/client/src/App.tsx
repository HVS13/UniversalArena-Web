import { useMemo, useState } from "react";
import { characters as roster } from "@ua/data";
import type { Card, Character } from "@ua/data";
import {
  applyAction,
  canAfford,
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

const getMaxX = (player: MatchState["players"][PlayerId], cost: ReturnType<typeof parseCost>) => {
  if (!cost.variable) return 0;
  const available =
    cost.variable.type === "energy" ? player.energy - cost.energy : player.ultimate - cost.ultimate;
  if (available <= 0) return 0;
  return Math.floor(available / cost.variable.multiplier);
};

const formatRoles = (roles: string[]) =>
  roles.map((role) => role.replace("role-", "")).join(", ");

const formatStatusList = (statuses: Record<string, number>) =>
  Object.entries(statuses).filter(([, value]) => value > 0);

const zoneRank: Record<ZoneName, number> = { slow: 0, normal: 1, fast: 2 };

const zoneLabel = (zone: ZoneName) => zone.charAt(0).toUpperCase() + zone.slice(1);

const getLegalZonesForSpeed = (speed: string): ZoneName[] => {
  const normalized = speed.trim().toLowerCase();
  if (normalized.includes("fast")) return ["fast", "normal", "slow"];
  if (normalized.includes("normal")) return ["normal", "slow"];
  return ["slow"];
};

const getPlayableZones = (card: Card, state: MatchState): ZoneName[] => {
  const legal = getLegalZonesForSpeed(card.speed);
  if (!state.activeZone) return legal;
  return legal.filter(
    (zone) => zone === state.activeZone || zoneRank[zone] > zoneRank[state.activeZone!]
  );
};


const App = () => {
  const rosterSorted = useMemo(() => sortRoster(roster), []);
  const [stage, setStage] = useState<Stage>("setup");
  const [names, setNames] = useState({ p1: "Player 1", p2: "Player 2" });
  const [selection, setSelection] = useState<SelectionState>(defaultSelection);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingPlay, setPendingPlay] = useState<{
    playerId: PlayerId;
    card: Card;
    zones: ZoneName[];
    zone: ZoneName;
    xValue: number;
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

  const handlePlayCard = (playerId: PlayerId, card: Card) => {
    if (!matchState) return;
    const zones = getPlayableZones(card, matchState);
    if (!zones.length) {
      setMessage("No legal zones available.");
      return;
    }
    const cost = parseCost(card.cost);
    const player = matchState.players[playerId];
    const max = cost.variable ? getMaxX(player, cost) : 0;
    if (cost.variable && max <= 0 && !canAfford(player, cost, 0)) {
      setMessage("Insufficient resources.");
      return;
    }
    if (zones.length === 1 && !cost.variable) {
      handleAction({ type: "play_card", playerId, cardSlot: card.slot, zone: zones[0] });
      return;
    }
    setPendingPlay({ playerId, card, zones, zone: zones[0], xValue: max });
  };

  const confirmXPlay = () => {
    if (!pendingPlay) return;
    handleAction({
      type: "play_card",
      playerId: pendingPlay.playerId,
      cardSlot: pendingPlay.card.slot,
      zone: pendingPlay.zone,
      xValue: pendingPlay.xValue,
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
                </div>
                {statusEntries.length > 0 && (
                  <div className="ua-statuses">
                    {statusEntries.map(([status, value]) => (
                      <span key={status} className="ua-pill">
                        {status}: {value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="ua-panel ua-panel--wide">
        <div className="ua-panel__header">
          <h2>Combat Log</h2>
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
          {matchState.log.length === 0 && <p>No log entries yet.</p>}
          {matchState.log.map((entry, index) => (
            <div key={`${entry}-${index}`} className="ua-log-entry">
              {entry}
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
        {activeCharacter ? (
          <div className="ua-card-grid">
            {activeCharacter.cards.map((card) => {
              const cost = parseCost(card.cost);
              const isVariable = Boolean(cost.variable);
              const baseAffordable = canAfford(activePlayer, cost, 0);
              const maxX = isVariable ? getMaxX(activePlayer, cost) : 0;
              const disabled = matchState.activePlayerId !== activePlayer.id || (!baseAffordable && maxX === 0);
              return (
                <button
                  key={`${card.slot}-${card.name}`}
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
                  <div className="ua-card__tags">{card.types.join(" • ")}</div>
                  <div className="ua-card__effect">
                    {card.effect.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  {isVariable && <span className="ua-card__tag">X Cost</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p>No character selected.</p>
        )}
      </section>

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
            {parseCost(pendingPlay.card.cost).variable && (
              <p>Set the X value to spend for this card.</p>
            )}
            <div className="ua-modal__controls">
              {parseCost(pendingPlay.card.cost).variable && (
                <input
                  type="number"
                  min={0}
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
