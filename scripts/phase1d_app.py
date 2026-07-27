from phase1d_patch_lib import replace_once, root

path = root / "apps/client/src/App.tsx"
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  getLegalTargets,
  hashMatchState,
  parseCost,
''',
    '''  getLegalTargets,
  hashMatchState,
  hashPlayerStateView,
  parseCost,
''',
    "App import player view hash",
)
text = replace_once(
    text,
    '''          protocolVersion: 1,
          requestId: `${clientIdRef.current}:${actionRequestSequenceRef.current}`,
          baseActionId: currentState.actionId,
          baseStateHash: hashMatchState(currentState),
''',
    '''          protocolVersion: relayProtocolVersion,
          requestId: `${clientIdRef.current}:${actionRequestSequenceRef.current}`,
          baseActionId: currentState.actionId,
          baseStateHash: hashPlayerStateView(currentState, localSeat ?? "p2"),
''',
    "guest action request view hash",
)
text = replace_once(
    text,
    '''        if (data.protocolVersion !== 1) return;''',
    '''        if (data.protocolVersion !== relayProtocolVersion) return;''',
    "host action request protocol",
)
text = replace_once(
    text,
    '''          data.baseActionId !== matchStateRef.current.actionId ||
          data.baseStateHash !== hashMatchState(matchStateRef.current)
''',
    '''          data.baseActionId !== matchStateRef.current.actionId ||
          data.baseStateHash !== hashPlayerStateView(matchStateRef.current, "p2")
''',
    "host action request view hash",
)
anchor = '''  const buildHandEntries = (team: Team): HandEntry[] =>
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
      .filter((entry): entry is HandEntry => Boolean(entry));'''
replacement = '''  const canViewPrivateTeam = (playerId: PlayerId) =>
    !isMultiplayer || localSeat === playerId;
  const buildHandEntries = (team: Team): HandEntry[] => {
    if (!canViewPrivateTeam(team.id)) return [];
    return team.hand
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
  };'''
text = replace_once(text, anchor, replacement, "private hand builder")
text = replace_once(
    text,
    '''            {activeHand.length === 0 && <p>No cards in hand.</p>}''',
    '''            {activeHand.length === 0 && (
              <p>
                {canViewPrivateTeam(activeTeam.id)
                  ? "No cards in hand."
                  : "Opponent hand is hidden."}
              </p>
            )}''',
    "active hand hidden message",
)
text = replace_once(
    text,
    '''              {handEntries.length === 0 && <p>No cards in hand.</p>}''',
    '''              {handEntries.length === 0 && (
                <p>
                  {canViewPrivateTeam(playerId)
                    ? "No cards in hand."
                    : "Opponent hand is hidden."}
                </p>
              )}''',
    "reaction hand hidden message",
)
path.write_text(text, encoding="utf-8")
