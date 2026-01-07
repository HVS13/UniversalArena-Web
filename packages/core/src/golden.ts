import type { Character } from "@ua/data";
import {
  applyAction,
  createMatchState,
  exportTranscript,
  replayTranscript,
  type Action,
  type MatchState,
  type PlayerId,
  type ZoneName,
} from "./index.js";

type GoldenResult = {
  label: string;
  ok: boolean;
  details?: string;
};

const goldenSeed = 424242;

const fillerIds = ["filler-1", "filler-2"] as const;

const fillerCharacters: Character[] = [
  {
    id: "filler-1",
    name: "Filler One",
    version: "Golden",
    origin: "Test",
    roles: [],
    difficulty: "Low",
    gameplan: "Filler roster slot.",
    art: "filler-1.png",
    innates: [],
    cards: [],
  },
  {
    id: "filler-2",
    name: "Filler Two",
    version: "Golden",
    origin: "Test",
    roles: [],
    difficulty: "Low",
    gameplan: "Filler roster slot.",
    art: "filler-2.png",
    innates: [],
    cards: [],
  },
];

const withFillers = (list: Character[]) => {
  const ids = new Set(list.map((entry) => entry.id));
  return [...list, ...fillerCharacters.filter((entry) => !ids.has(entry.id))];
};

const withFillersIds = (primaryId: string) => [primaryId, ...fillerIds];

const getPrimary = (state: MatchState, playerId: PlayerId) =>
  state.players[playerId].characters[0];

const goldenPlayers = [
  { id: "p1" as const, name: "Alpha", characterIds: withFillersIds("golden-a") },
  { id: "p2" as const, name: "Bravo", characterIds: withFillersIds("golden-b") },
];

const goldenCharacters = (): Character[] => [
  {
    id: "golden-a",
    name: "Golden Alpha",
    version: "Golden",
    origin: "Test",
    roles: [],
    difficulty: "Low",
    gameplan: "Golden test character.",
    art: "golden-alpha.png",
    innates: [],
    cards: [
      {
        slot: "1",
        name: "Slow Strike",
        cost: "1 Energy",
        power: "10-10",
        types: ["Basic", "Attack", "Physical"],
        target: "1 Enemy",
        speed: "Slow",
        effect: ["Innate.", "Deal Power damage."],
        effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
      },
      {
        slot: "2",
        name: "Normal Strike",
        cost: "1 Energy",
        power: "10-10",
        types: ["Basic", "Attack", "Physical"],
        target: "1 Enemy",
        speed: "Normal",
        effect: ["Innate.", "Deal Power damage."],
        effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
      },
      {
        slot: "3",
        name: "Fast Guard",
        cost: "1 Energy",
        power: "10-10",
        types: ["Basic", "Defense", "Physical"],
        target: "Self",
        speed: "Fast",
        effect: ["Innate.", "Gain Power Shield."],
        effects: [{ timing: "on_use", type: "gain_shield", amount: { kind: "power" } }],
      },
      {
        slot: "4",
        name: "Tie Strike",
        cost: "1 Energy",
        power: "10-10",
        types: ["Technique", "Attack", "Physical"],
        target: "1 Enemy",
        speed: "Normal",
        effect: ["Innate.", "Always: Gain 1 Always Buff.", "Gain 1 OnUse Buff."],
        effects: [
          {
            timing: "always",
            type: "gain_status",
            status: "Always Buff",
            amount: { kind: "flat", value: 1 },
          },
          {
            timing: "on_use",
            type: "gain_status",
            status: "OnUse Buff",
            amount: { kind: "flat", value: 1 },
          },
        ],
      },
    ],
  },
  {
    id: "golden-b",
    name: "Golden Bravo",
    version: "Golden",
    origin: "Test",
    roles: [],
    difficulty: "Low",
    gameplan: "Golden test character.",
    art: "golden-bravo.png",
    innates: [],
    cards: [
      {
        slot: "1",
        name: "Slow Strike",
        cost: "1 Energy",
        power: "10-10",
        types: ["Basic", "Attack", "Physical"],
        target: "1 Enemy",
        speed: "Slow",
        effect: ["Innate.", "Deal Power damage."],
        effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
      },
      {
        slot: "2",
        name: "Normal Strike",
        cost: "1 Energy",
        power: "10-10",
        types: ["Basic", "Attack", "Physical"],
        target: "1 Enemy",
        speed: "Normal",
        effect: ["Innate.", "Deal Power damage."],
        effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
      },
      {
        slot: "3",
        name: "Fast Guard",
        cost: "1 Energy",
        power: "10-10",
        types: ["Basic", "Defense", "Physical"],
        target: "Self",
        speed: "Fast",
        effect: ["Innate.", "Gain Power Shield."],
        effects: [{ timing: "on_use", type: "gain_shield", amount: { kind: "power" } }],
      },
      {
        slot: "4",
        name: "Tie Strike",
        cost: "1 Energy",
        power: "10-10",
        types: ["Technique", "Attack", "Physical"],
        target: "1 Enemy",
        speed: "Normal",
        effect: ["Innate.", "Always: Gain 1 Always Buff.", "Gain 1 OnUse Buff."],
        effects: [
          {
            timing: "always",
            type: "gain_status",
            status: "Always Buff",
            amount: { kind: "flat", value: 1 },
          },
          {
            timing: "on_use",
            type: "gain_status",
            status: "OnUse Buff",
            amount: { kind: "flat", value: 1 },
          },
        ],
      },
    ],
  },
];

const createSeededState = (
  characters: Character[],
  players: { id: PlayerId; name: string; characterIds: string[] }[]
) =>
  createMatchState(withFillers(characters), players, {
    seed: goldenSeed,
    enableTranscript: true,
  });

const applyOrThrow = (
  state: MatchState,
  action: Action,
  characters: Character[]
) => {
  const result = applyAction(state, action, characters);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.state;
};

const ensureCardInHand = (
  state: MatchState,
  playerId: PlayerId,
  cardSlot: string
) => {
  const player = state.players[playerId];
  const inHand = player.hand.find((card) => card.cardSlot === cardSlot);
  if (inHand) return inHand.id;
  const deckIndex = player.deck.findIndex((card) => card.cardSlot === cardSlot);
  if (deckIndex === -1) return null;
  const [moved] = player.deck.splice(deckIndex, 1);
  if (!moved) return null;
  player.hand.push(moved);
  return moved.id;
};

const valueStatus = (value: number) => ({
  potency: 0,
  count: 0,
  stack: 0,
  value,
});

const potencyStatus = (potency: number, count: number) => ({
  potency,
  count,
  stack: 0,
  value: 0,
});

const stackStatus = (stack: number) => ({
  potency: 0,
  count: 0,
  stack,
  value: 0,
});

const playFromHand = (
  state: MatchState,
  playerId: PlayerId,
  cardSlot: string,
  zone: ZoneName
) => {
  const cardInstanceId = ensureCardInHand(state, playerId, cardSlot);
  if (!cardInstanceId) {
    throw new Error(`Missing card instance for ${playerId} slot ${cardSlot}.`);
  }
  return { type: "play_card" as const, playerId, cardInstanceId, zone };
};

const snapshotStatuses = (state: MatchState, playerId: PlayerId, names: string[]) => {
  const primary = getPrimary(state, playerId);
  return Object.fromEntries(
    names.map((name) => {
      const entry = primary?.statuses[name];
      return [
        name,
        entry
          ? {
              potency: entry.potency,
              count: entry.count,
              stack: entry.stack,
              value: entry.value,
            }
          : { potency: 0, count: 0, stack: 0, value: 0 },
      ];
    })
  );
};

const countCardSlots = (player: MatchState["players"][PlayerId]) => {
  const counts: Record<string, number> = {};
  [...player.hand, ...player.deck, ...player.discard, ...player.exhausted].forEach((card) => {
    counts[card.cardSlot] = (counts[card.cardSlot] ?? 0) + 1;
  });
  return counts;
};

const sanitizeAction = (action: Action) => {
  if (action.type === "play_card") {
    return {
      type: "play_card",
      playerId: action.playerId,
      zone: action.zone,
      hasCardInstance: Boolean(action.cardInstanceId),
    };
  }
  return {
    type: action.type,
    playerId: action.playerId,
  };
};

const snapshotTranscript = (state: MatchState) => {
  const transcript = exportTranscript(state);
  if (!transcript) {
    throw new Error("Transcript missing.");
  }
  return {
    version: transcript.version,
    seed: transcript.seed,
    players: transcript.players,
    actions: transcript.actions.map((entry) => ({
      action: sanitizeAction(entry.action),
      ...(entry.error ? { error: entry.error } : {}),
    })),
  };
};

const runReplaySnapshot = (characters: Character[], state: MatchState) => {
  const transcript = exportTranscript(state);
  if (!transcript) {
    throw new Error("Transcript missing.");
  }
  const replay = replayTranscript(withFillers(characters), transcript);
  if (replay.error) {
    throw new Error(replay.error);
  }
  return replay.state;
};

const assertSnapshot = (label: string, actual: unknown, expected: unknown) => {
  const actualJson = JSON.stringify(actual, null, 2);
  const expectedJson = JSON.stringify(expected, null, 2);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} mismatch.\nExpected:\n${expectedJson}\nActual:\n${actualJson}`);
  }
};

const runInterruptChainTest = (): GoldenResult => {
  const characters = withFillers(goldenCharacters());
  let state = createMatchState(characters, goldenPlayers, {
    seed: goldenSeed,
    enableTranscript: true,
  });

  state = applyOrThrow(state, playFromHand(state, "p1", "1", "slow"), characters);
  state = applyOrThrow(state, playFromHand(state, "p2", "2", "normal"), characters);
  state = applyOrThrow(state, playFromHand(state, "p1", "3", "fast"), characters);

  const snapshot = {
    activeZone: state.activeZone,
    pausedZones: [...state.pausedZones],
    transcript: snapshotTranscript(state),
  };
  const expected = {
    activeZone: "fast",
    pausedZones: ["slow", "normal"],
    transcript: {
      version: 2,
      seed: goldenSeed,
      players: goldenPlayers,
      actions: [
        { action: { type: "play_card", playerId: "p1", zone: "slow", hasCardInstance: true } },
        { action: { type: "play_card", playerId: "p2", zone: "normal", hasCardInstance: true } },
        { action: { type: "play_card", playerId: "p1", zone: "fast", hasCardInstance: true } },
      ],
    },
  };

  const replayState = runReplaySnapshot(characters, state);
  const replaySnapshot = {
    activeZone: replayState.activeZone,
    pausedZones: [...replayState.pausedZones],
  };
  const expectedReplay = {
    activeZone: "fast",
    pausedZones: ["slow", "normal"],
  };

  try {
    assertSnapshot("Interrupt chain snapshot", snapshot, expected);
    assertSnapshot("Interrupt chain replay", replaySnapshot, expectedReplay);
    return { label: "Fast interrupt chain is deterministic", ok: true };
  } catch (error) {
    return { label: "Fast interrupt chain is deterministic", ok: false, details: String(error) };
  }
};

const runCancelledAlwaysTest = (): GoldenResult => {
  const characters = goldenCharacters();
  let state = createSeededState(characters, goldenPlayers);

  state = applyOrThrow(state, playFromHand(state, "p1", "4", "normal"), characters);
  state = applyOrThrow(state, playFromHand(state, "p2", "4", "normal"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);

  const snapshot = {
    activeZone: state.activeZone,
    cancelledLog: state.log.some((line) => line.includes("clash and are both cancelled")),
    p1Statuses: snapshotStatuses(state, "p1", ["Always Buff", "OnUse Buff"]),
    p2Statuses: snapshotStatuses(state, "p2", ["Always Buff", "OnUse Buff"]),
    transcript: snapshotTranscript(state),
  };

  const expected = {
    activeZone: null,
    cancelledLog: true,
    p1Statuses: {
      "Always Buff": { potency: 0, count: 0, stack: 0, value: 1 },
      "OnUse Buff": { potency: 0, count: 0, stack: 0, value: 0 },
    },
    p2Statuses: {
      "Always Buff": { potency: 0, count: 0, stack: 0, value: 1 },
      "OnUse Buff": { potency: 0, count: 0, stack: 0, value: 0 },
    },
    transcript: {
      version: 2,
      seed: goldenSeed,
      players: goldenPlayers,
      actions: [
        { action: { type: "play_card", playerId: "p1", zone: "normal", hasCardInstance: true } },
        { action: { type: "play_card", playerId: "p2", zone: "normal", hasCardInstance: true } },
        { action: { type: "pass", playerId: "p1" } },
        { action: { type: "pass", playerId: "p2" } },
      ],
    },
  };

  const replayState = runReplaySnapshot(characters, state);
  const replaySnapshot = {
    activeZone: replayState.activeZone,
    cancelledLog: replayState.log.some((line) => line.includes("clash and are both cancelled")),
    p1Statuses: snapshotStatuses(replayState, "p1", ["Always Buff", "OnUse Buff"]),
    p2Statuses: snapshotStatuses(replayState, "p2", ["Always Buff", "OnUse Buff"]),
  };
  const expectedReplay = {
    activeZone: null,
    cancelledLog: true,
    p1Statuses: expected.p1Statuses,
    p2Statuses: expected.p2Statuses,
  };

  try {
    assertSnapshot("Cancelled vs Always snapshot", snapshot, expected);
    assertSnapshot("Cancelled vs Always replay", replaySnapshot, expectedReplay);
    return { label: "Cancelled vs Always applies only always effects", ok: true };
  } catch (error) {
    return {
      label: "Cancelled vs Always applies only always effects",
      ok: false,
      details: String(error),
    };
  }
};

const runCannotPlayTest = (): GoldenResult => {
  const players = [
    { id: "p1" as const, name: "Target", characterIds: withFillersIds("locker-b") },
    { id: "p2" as const, name: "Locker", characterIds: withFillersIds("locker-a") },
  ];
  const characters: Character[] = [
    {
      id: "locker-a",
      name: "Lock Alpha",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Cannot play cards coverage.",
      art: "lock-alpha.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Time Lock",
          cost: "0 Energy",
          power: "-",
          types: ["Technique", "Special"],
          target: "Self",
          speed: "Fast",
          effect: ["Innate.", "Enemies cannot play cards this Combat Round."],
          effects: [
            {
              timing: "on_use",
              type: "block_play",
              target: "opponent",
              duration: "combat_round",
            },
          ],
        },
        {
          slot: "2",
          name: "Normal Strike",
          cost: "0 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Innate.", "Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
        },
      ],
    },
    {
      id: "locker-b",
      name: "Lock Bravo",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Cannot play cards coverage.",
      art: "lock-bravo.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Normal Strike",
          cost: "0 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Innate.", "Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
        },
        {
          slot: "2",
          name: "Backup Strike",
          cost: "0 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Innate.", "Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
        },
      ],
    },
  ];

  let state = createSeededState(characters, players);
  state = applyOrThrow(state, playFromHand(state, "p1", "1", "normal"), characters);
  state = applyOrThrow(state, playFromHand(state, "p2", "1", "fast"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);

  const blockedAttempt = applyAction(
    state,
    playFromHand(state, "p1", "2", "normal"),
    characters
  );

  const snapshot = {
    error: blockedAttempt.error ?? null,
    activeZone: blockedAttempt.state.activeZone,
    p1Locks: blockedAttempt.state.playLocks.p1.length,
  };
  const expected = {
    error: "Cannot play cards this combat round.",
    activeZone: "normal",
    p1Locks: 1,
  };

  try {
    assertSnapshot("Cannot play snapshot", snapshot, expected);
    return { label: "Cannot play cards blocks plays during combat", ok: true };
  } catch (error) {
    return { label: "Cannot play cards blocks plays during combat", ok: false, details: String(error) };
  }
};

const runTimingWindowsTest = (): GoldenResult => {
  const players = [
    { id: "p1" as const, name: "Timer", characterIds: withFillersIds("timing-a") },
    { id: "p2" as const, name: "Guard", characterIds: withFillersIds("timing-b") },
  ];
  const characters: Character[] = [
    {
      id: "timing-a",
      name: "Timing Alpha",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Timing window coverage.",
      art: "timing-alpha.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Timing Strike",
          cost: "1 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: [
            "Innate.",
            "On Play: Gain 1 Windup.",
            "Before Use: Gain 1 Before Buff.",
            "Gain 1 Use Buff.",
            "On Hit: Gain 1 Hit Buff.",
            "After Use: Gain 1 After Buff.",
          ],
          effects: [
            {
              timing: "on_play",
              type: "gain_status",
              status: "Windup",
              amount: { kind: "flat", value: 1 },
            },
            {
              timing: "before_use",
              type: "gain_status",
              status: "Before Buff",
              amount: { kind: "flat", value: 1 },
            },
            {
              timing: "on_use",
              type: "gain_status",
              status: "Use Buff",
              amount: { kind: "flat", value: 1 },
            },
            {
              timing: "on_hit",
              type: "gain_status",
              status: "Hit Buff",
              amount: { kind: "flat", value: 1 },
            },
            {
              timing: "after_use",
              type: "gain_status",
              status: "After Buff",
              amount: { kind: "flat", value: 1 },
            },
          ],
        },
      ],
    },
    {
      id: "timing-b",
      name: "Timing Bravo",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Timing window coverage.",
      art: "timing-bravo.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Evade Guard",
          cost: "1 Energy",
          power: "10-10",
          types: ["Basic", "Defense", "Physical"],
          target: "Self",
          speed: "Normal",
          effect: ["Innate.", "Gain Power Shield.", "Evade."],
          effects: [{ timing: "on_use", type: "gain_shield", amount: { kind: "power" } }],
        },
      ],
    },
  ];

  let state = createSeededState(characters, players);

  state = applyOrThrow(state, playFromHand(state, "p1", "1", "normal"), characters);
  const afterPlay = snapshotStatuses(state, "p1", [
    "Windup",
    "Before Buff",
    "Use Buff",
    "Hit Buff",
    "After Buff",
  ]);

  state = applyOrThrow(state, playFromHand(state, "p2", "1", "normal"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);

  const afterResolve = snapshotStatuses(state, "p1", [
    "Windup",
    "Before Buff",
    "Use Buff",
    "Hit Buff",
    "After Buff",
  ]);

  const snapshot = {
    activeZone: state.activeZone,
    afterPlay,
    afterResolve,
    transcript: snapshotTranscript(state),
  };
  const expected = {
    activeZone: null,
    afterPlay: {
      Windup: valueStatus(1),
      "Before Buff": valueStatus(0),
      "Use Buff": valueStatus(0),
      "Hit Buff": valueStatus(0),
      "After Buff": valueStatus(0),
    },
    afterResolve: {
      Windup: valueStatus(1),
      "Before Buff": valueStatus(1),
      "Use Buff": valueStatus(1),
      "Hit Buff": valueStatus(0),
      "After Buff": valueStatus(1),
    },
    transcript: {
      version: 2,
      seed: goldenSeed,
      players,
      actions: [
        { action: { type: "play_card", playerId: "p1", zone: "normal", hasCardInstance: true } },
        { action: { type: "play_card", playerId: "p2", zone: "normal", hasCardInstance: true } },
        { action: { type: "pass", playerId: "p1" } },
        { action: { type: "pass", playerId: "p2" } },
      ],
    },
  };

  const replayState = runReplaySnapshot(characters, state);
  const replaySnapshot = {
    activeZone: replayState.activeZone,
    p1Statuses: snapshotStatuses(replayState, "p1", [
      "Windup",
      "Before Buff",
      "Use Buff",
      "Hit Buff",
      "After Buff",
    ]),
  };
  const expectedReplay = {
    activeZone: null,
    p1Statuses: expected.afterResolve,
  };

  try {
    assertSnapshot("Timing window snapshot", snapshot, expected);
    assertSnapshot("Timing window replay", replaySnapshot, expectedReplay);
    return { label: "Timing windows apply at the expected phases", ok: true };
  } catch (error) {
    return {
      label: "Timing windows apply at the expected phases",
      ok: false,
      details: String(error),
    };
  }
};

const runStatusExpiryTest = (): GoldenResult => {
  const players = [
    { id: "p1" as const, name: "Burner", characterIds: withFillersIds("expiry-a") },
    { id: "p2" as const, name: "Target", characterIds: withFillersIds("expiry-b") },
  ];
  const characters: Character[] = [
    {
      id: "expiry-a",
      name: "Expiry Alpha",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Status expiry coverage.",
      art: "expiry-alpha.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Burn Strike",
          cost: "1 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Fire"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Innate.", "On Use: Inflict 2 Burn."],
          effects: [
            {
              timing: "on_use",
              type: "inflict_status",
              status: "Burn",
              amount: { kind: "flat", value: 2 },
            },
          ],
        },
      ],
    },
    {
      id: "expiry-b",
      name: "Expiry Bravo",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Status expiry coverage.",
      art: "expiry-bravo.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Idle",
          cost: "0 Energy",
          power: "-",
          types: ["Basic", "Special"],
          target: "Self",
          speed: "Fast",
          effect: ["Innate."],
        },
      ],
    },
  ];

  let state = createSeededState(characters, players);

  state = applyOrThrow(state, playFromHand(state, "p1", "1", "normal"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);

  const afterResolve = {
    p2Hp: getPrimary(state, "p2").hp,
    burn: snapshotStatuses(state, "p2", ["Burn"]),
  };

  state = applyOrThrow(state, { type: "end_turn", playerId: "p1" }, characters);

  const afterEnd = {
    turn: state.turn,
    p2Hp: getPrimary(state, "p2").hp,
    burn: snapshotStatuses(state, "p2", ["Burn"]),
  };

  const snapshot = {
    afterResolve,
    afterEnd,
    transcript: snapshotTranscript(state),
  };
  const expected = {
    afterResolve: {
      p2Hp: 100,
      burn: {
        Burn: potencyStatus(2, 1),
      },
    },
    afterEnd: {
      turn: 2,
      p2Hp: 98,
      burn: {
        Burn: potencyStatus(0, 0),
      },
    },
    transcript: {
      version: 2,
      seed: goldenSeed,
      players,
      actions: [
        { action: { type: "play_card", playerId: "p1", zone: "normal", hasCardInstance: true } },
        { action: { type: "pass", playerId: "p2" } },
        { action: { type: "pass", playerId: "p1" } },
        { action: { type: "end_turn", playerId: "p1" } },
      ],
    },
  };

  const replayState = runReplaySnapshot(characters, state);
  const replaySnapshot = {
    p2Hp: getPrimary(replayState, "p2").hp,
    burn: snapshotStatuses(replayState, "p2", ["Burn"]),
  };
  const expectedReplay = {
    p2Hp: 98,
    burn: {
      Burn: potencyStatus(0, 0),
    },
  };

  try {
    assertSnapshot("Status expiry snapshot", snapshot, expected);
    assertSnapshot("Status expiry replay", replaySnapshot, expectedReplay);
    return { label: "Status expiry applies turn-end damage and decay", ok: true };
  } catch (error) {
    return {
      label: "Status expiry applies turn-end damage and decay",
      ok: false,
      details: String(error),
    };
  }
};

const runCostSpeedModifierTest = (): GoldenResult => {
  const players = [
    { id: "p1" as const, name: "Modifier", characterIds: withFillersIds("mod-a") },
    { id: "p2" as const, name: "Observer", characterIds: withFillersIds("mod-b") },
  ];
  const characters: Character[] = [
    {
      id: "mod-a",
      name: "Modifier Alpha",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Cost and speed modifiers.",
      art: "modifier-alpha.png",
      innates: [
        { name: "Haste Start", text: "Starts with 1 Haste." },
        { name: "Strain Start", text: "Starts with 1 Strain." },
      ],
      cards: [
        {
          slot: "1",
          name: "Normal Strike",
          cost: "1 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Innate.", "Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
        },
      ],
    },
    {
      id: "mod-b",
      name: "Modifier Bravo",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Cost and speed modifiers.",
      art: "modifier-bravo.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Idle",
          cost: "0 Energy",
          power: "-",
          types: ["Basic", "Special"],
          target: "Self",
          speed: "Fast",
          effect: ["Innate."],
        },
      ],
    },
  ];

  let state = createSeededState(characters, players);
  state = applyOrThrow(state, playFromHand(state, "p1", "1", "fast"), characters);

  const snapshot = {
    activeZone: state.activeZone,
    p1Energy: state.players.p1.energy,
    p1Ultimate: state.players.p1.ultimate,
    p1Statuses: snapshotStatuses(state, "p1", ["Haste", "Strain"]),
    transcript: snapshotTranscript(state),
  };
  const expected = {
    activeZone: "fast",
    p1Energy: 3,
    p1Ultimate: 2,
    p1Statuses: {
      Haste: potencyStatus(1, 1),
      Strain: potencyStatus(1, 1),
    },
    transcript: {
      version: 2,
      seed: goldenSeed,
      players,
      actions: [
        { action: { type: "play_card", playerId: "p1", zone: "fast", hasCardInstance: true } },
      ],
    },
  };

  const replayState = runReplaySnapshot(characters, state);
  const replaySnapshot = {
    activeZone: replayState.activeZone,
    p1Energy: replayState.players.p1.energy,
    p1Ultimate: replayState.players.p1.ultimate,
  };
  const expectedReplay = {
    activeZone: "fast",
    p1Energy: 3,
    p1Ultimate: 2,
  };

  try {
    assertSnapshot("Cost and speed snapshot", snapshot, expected);
    assertSnapshot("Cost and speed replay", replaySnapshot, expectedReplay);
    return { label: "Cost and speed modifiers apply to play legality and spend", ok: true };
  } catch (error) {
    return {
      label: "Cost and speed modifiers apply to play legality and spend",
      ok: false,
      details: String(error),
    };
  }
};

const runMitigationStackingTest = (): GoldenResult => {
  const players = [
    { id: "p1" as const, name: "Attacker", characterIds: withFillersIds("mitigate-a") },
    { id: "p2" as const, name: "Defender", characterIds: withFillersIds("mitigate-b") },
  ];
  const characters: Character[] = [
    {
      id: "mitigate-a",
      name: "Mitigation Alpha",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Mitigation stacking coverage.",
      art: "mitigation-alpha.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Strike",
          cost: "1 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Innate.", "Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
        },
      ],
    },
    {
      id: "mitigate-b",
      name: "Mitigation Bravo",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Mitigation stacking coverage.",
      art: "mitigation-bravo.png",
      innates: [
        {
          name: "Mitigation Mix",
          text: "Resist 3 (Physical). Absorb 2 (Physical). Weakness 1 (Physical).",
        },
      ],
      cards: [
        {
          slot: "1",
          name: "Idle",
          cost: "0 Energy",
          power: "-",
          types: ["Basic", "Special"],
          target: "Self",
          speed: "Fast",
          effect: ["Innate."],
        },
      ],
    },
  ];

  let state = createSeededState(characters, players);
  state = applyOrThrow(state, playFromHand(state, "p1", "1", "normal"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);

  const snapshot = {
    activeZone: state.activeZone,
    p2Hp: getPrimary(state, "p2").hp,
    transcript: snapshotTranscript(state),
  };
  const expected = {
    activeZone: null,
    p2Hp: 96,
    transcript: {
      version: 2,
      seed: goldenSeed,
      players,
      actions: [
        { action: { type: "play_card", playerId: "p1", zone: "normal", hasCardInstance: true } },
        { action: { type: "pass", playerId: "p2" } },
        { action: { type: "pass", playerId: "p1" } },
      ],
    },
  };

  const replayState = runReplaySnapshot(characters, state);
  const replaySnapshot = {
    activeZone: replayState.activeZone,
    p2Hp: getPrimary(replayState, "p2").hp,
  };
  const expectedReplay = {
    activeZone: null,
    p2Hp: 96,
  };

  try {
    assertSnapshot("Mitigation stacking snapshot", snapshot, expected);
    assertSnapshot("Mitigation stacking replay", replaySnapshot, expectedReplay);
    return { label: "Mitigation stacking resolves in a deterministic order", ok: true };
  } catch (error) {
    return {
      label: "Mitigation stacking resolves in a deterministic order",
      ok: false,
      details: String(error),
    };
  }
};

const runSpendFlowTest = (): GoldenResult => {
  const players = [
    { id: "p1" as const, name: "Spender", characterIds: withFillersIds("spend-a") },
    { id: "p2" as const, name: "Receiver", characterIds: withFillersIds("spend-b") },
  ];
  const characters: Character[] = [
    {
      id: "spend-a",
      name: "Spend Alpha",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Spend and hand flow coverage.",
      art: "spend-alpha.png",
      innates: [{ name: "Ammo", text: "Starts with 2 Test Ammo." }],
      cards: [
        {
          slot: "1",
          name: "Ammo Shot",
          cost: "1 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Innate.", "Spend 1 Test Ammo.", "Deal 5 damage per Test Ammo spent."],
          effects: [
            {
              timing: "on_use",
              type: "spend_status",
              status: "Test Ammo",
              amount: { kind: "flat", value: 1 },
              gateDamage: true,
            },
            {
              timing: "on_use",
              type: "deal_damage_per_spent",
              status: "Test Ammo",
              amount: { kind: "flat", value: 5 },
            },
          ],
        },
      ],
    },
    {
      id: "spend-b",
      name: "Spend Bravo",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Spend and hand flow coverage.",
      art: "spend-bravo.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Idle",
          cost: "0 Energy",
          power: "-",
          types: ["Basic", "Special"],
          target: "Self",
          speed: "Fast",
          effect: ["Innate."],
        },
      ],
    },
  ];

  let state = createSeededState(characters, players);
  const cardInstanceId = ensureCardInHand(state, "p1", "1");
  if (!cardInstanceId) {
    return { label: "Spend and hand flow stays consistent", ok: false, details: "Card missing." };
  }
  const handBefore = state.players.p1.hand.length;
  const discardBefore = state.players.p1.discard.length;

  state = applyOrThrow(
    state,
    { type: "play_card", playerId: "p1", cardInstanceId, zone: "normal" },
    characters
  );
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);

  const snapshot = {
    activeZone: state.activeZone,
    p2Hp: getPrimary(state, "p2").hp,
    p1Hand: state.players.p1.hand.length,
    p1Discard: state.players.p1.discard.length,
    p1Ammo: snapshotStatuses(state, "p1", ["Test Ammo"]),
    transcript: snapshotTranscript(state),
  };
  const expected = {
    activeZone: null,
    p2Hp: 95,
    p1Hand: handBefore - 1,
    p1Discard: discardBefore + 1,
    p1Ammo: {
      "Test Ammo": valueStatus(1),
    },
    transcript: {
      version: 2,
      seed: goldenSeed,
      players,
      actions: [
        { action: { type: "play_card", playerId: "p1", zone: "normal", hasCardInstance: true } },
        { action: { type: "pass", playerId: "p2" } },
        { action: { type: "pass", playerId: "p1" } },
      ],
    },
  };

  const replayState = runReplaySnapshot(characters, state);
  const replaySnapshot = {
    p2Hp: getPrimary(replayState, "p2").hp,
    p1Hand: replayState.players.p1.hand.length,
    p1Discard: replayState.players.p1.discard.length,
    p1Ammo: snapshotStatuses(replayState, "p1", ["Test Ammo"]),
  };
  const expectedReplay = {
    p2Hp: 95,
    p1Hand: handBefore - 1,
    p1Discard: discardBefore + 1,
    p1Ammo: {
      "Test Ammo": valueStatus(1),
    },
  };

  try {
    assertSnapshot("Spend flow snapshot", snapshot, expected);
    assertSnapshot("Spend flow replay", replaySnapshot, expectedReplay);
    return { label: "Spend and hand flow stays consistent", ok: true };
  } catch (error) {
    return {
      label: "Spend and hand flow stays consistent",
      ok: false,
      details: String(error),
    };
  }
};

const runHealingReductionTest = (): GoldenResult => {
  const players = [
    { id: "p1" as const, name: "Healer", characterIds: withFillersIds("heal-a") },
    { id: "p2" as const, name: "Watcher", characterIds: withFillersIds("heal-b") },
  ];
  const characters: Character[] = [
    {
      id: "heal-a",
      name: "Healing Alpha",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Healing reduction coverage.",
      art: "heal-alpha.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Setup",
          cost: "0 Energy",
          power: "-",
          types: ["Basic", "Special"],
          target: "Self",
          speed: "Normal",
          effect: [
            "Innate.",
            "Gain 10 Regen.",
            "Gain 10 Renewal.",
            "Inflict 3 Wound.",
            "Inflict 20 Wither.",
          ],
          effects: [
            {
              timing: "on_use",
              type: "gain_status",
              status: "Regen",
              amount: { kind: "flat", value: 10 },
            },
            {
              timing: "on_use",
              type: "gain_status",
              status: "Renewal",
              amount: { kind: "flat", value: 10 },
            },
            {
              timing: "on_use",
              type: "inflict_status",
              status: "Wound",
              amount: { kind: "flat", value: 3 },
            },
            {
              timing: "on_use",
              type: "inflict_status",
              status: "Wither",
              amount: { kind: "flat", value: 20 },
            },
          ],
        },
        {
          slot: "2",
          name: "Self Strike",
          cost: "0 Energy",
          power: "50-50",
          types: ["Technique", "Attack", "Physical"],
          target: "Self",
          speed: "Normal",
          effect: ["Innate.", "Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
        },
        {
          slot: "3",
          name: "Mend",
          cost: "0 Energy",
          power: "-",
          types: ["Basic", "Special"],
          target: "Self",
          speed: "Normal",
          effect: ["Innate.", "Heal 20 HP."],
          effects: [{ timing: "on_use", type: "heal", amount: { kind: "flat", value: 20 } }],
        },
      ],
    },
    {
      id: "heal-b",
      name: "Healing Bravo",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Healing reduction coverage.",
      art: "heal-bravo.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Idle",
          cost: "0 Energy",
          power: "-",
          types: ["Basic", "Special"],
          target: "Self",
          speed: "Fast",
          effect: ["Innate."],
        },
      ],
    },
  ];

  let state = createSeededState(characters, players);

  state = applyOrThrow(state, playFromHand(state, "p1", "1", "normal"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);
  state = applyOrThrow(state, playFromHand(state, "p1", "2", "normal"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);
  state = applyOrThrow(state, playFromHand(state, "p1", "3", "normal"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);

  const afterResolve = {
    p1Hp: getPrimary(state, "p1").hp,
    p1Statuses: snapshotStatuses(state, "p1", ["Wound", "Wither", "Regen", "Renewal"]),
  };

  state = applyOrThrow(state, { type: "end_turn", playerId: "p1" }, characters);

  const afterEnd = {
    turn: state.turn,
    p1Hp: getPrimary(state, "p1").hp,
    p1Statuses: snapshotStatuses(state, "p1", ["Wound", "Wither", "Regen", "Renewal"]),
  };

  const snapshot = {
    afterResolve,
    afterEnd,
    transcript: snapshotTranscript(state),
  };
  const expected = {
    afterResolve: {
      p1Hp: 63,
      p1Statuses: {
        Wound: stackStatus(3),
        Wither: stackStatus(20),
        Regen: potencyStatus(10, 1),
        Renewal: potencyStatus(10, 1),
      },
    },
    afterEnd: {
      turn: 2,
      p1Hp: 73,
      p1Statuses: {
        Wound: stackStatus(2),
        Wither: stackStatus(19),
        Regen: potencyStatus(0, 0),
        Renewal: potencyStatus(0, 0),
      },
    },
    transcript: {
      version: 2,
      seed: goldenSeed,
      players,
      actions: [
        { action: { type: "play_card", playerId: "p1", zone: "normal", hasCardInstance: true } },
        { action: { type: "pass", playerId: "p2" } },
        { action: { type: "pass", playerId: "p1" } },
        { action: { type: "play_card", playerId: "p1", zone: "normal", hasCardInstance: true } },
        { action: { type: "pass", playerId: "p2" } },
        { action: { type: "pass", playerId: "p1" } },
        { action: { type: "play_card", playerId: "p1", zone: "normal", hasCardInstance: true } },
        { action: { type: "pass", playerId: "p2" } },
        { action: { type: "pass", playerId: "p1" } },
        { action: { type: "end_turn", playerId: "p1" } },
      ],
    },
  };

  const replayState = runReplaySnapshot(characters, state);
  const replaySnapshot = {
    p1Hp: getPrimary(replayState, "p1").hp,
    p1Statuses: snapshotStatuses(replayState, "p1", ["Wound", "Wither", "Regen", "Renewal"]),
  };
  const expectedReplay = {
    p1Hp: 73,
    p1Statuses: expected.afterEnd.p1Statuses,
  };

  try {
    assertSnapshot("Healing reduction snapshot", snapshot, expected);
    assertSnapshot("Healing reduction replay", replaySnapshot, expectedReplay);
    return { label: "Healing reduction applies to heals and Regen/Renewal", ok: true };
  } catch (error) {
    return {
      label: "Healing reduction applies to heals and Regen/Renewal",
      ok: false,
      details: String(error),
    };
  }
};

const runThornsOnHitTest = (): GoldenResult => {
  const players = [
    { id: "p1" as const, name: "Striker", characterIds: withFillersIds("thorn-a") },
    { id: "p2" as const, name: "Bristle", characterIds: withFillersIds("thorn-b") },
  ];
  const characters: Character[] = [
    {
      id: "thorn-a",
      name: "Thorns Alpha",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Thorns on-hit coverage.",
      art: "thorn-alpha.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Strike",
          cost: "1 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Slow",
          effect: ["Innate.", "Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
        },
      ],
    },
    {
      id: "thorn-b",
      name: "Thorns Bravo",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Thorns on-hit coverage.",
      art: "thorn-bravo.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Bristle",
          cost: "0 Energy",
          power: "-",
          types: ["Basic", "Special"],
          target: "Self",
          speed: "Fast",
          effect: ["Innate.", "Gain 3 Thorns."],
          effects: [
            {
              timing: "on_use",
              type: "gain_status",
              status: "Thorns",
              amount: { kind: "flat", value: 3 },
            },
          ],
        },
      ],
    },
  ];

  let state = createSeededState(characters, players);

  state = applyOrThrow(state, playFromHand(state, "p1", "1", "slow"), characters);
  state = applyOrThrow(state, playFromHand(state, "p2", "1", "fast"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);

  const snapshot = {
    p1Hp: getPrimary(state, "p1").hp,
    p2Hp: getPrimary(state, "p2").hp,
    p2Thorns: snapshotStatuses(state, "p2", ["Thorns"]),
    transcript: snapshotTranscript(state),
  };
  const expected = {
    p1Hp: 97,
    p2Hp: 90,
    p2Thorns: {
      Thorns: potencyStatus(3, 1),
    },
    transcript: {
      version: 2,
      seed: goldenSeed,
      players,
      actions: [
        { action: { type: "play_card", playerId: "p1", zone: "slow", hasCardInstance: true } },
        { action: { type: "play_card", playerId: "p2", zone: "fast", hasCardInstance: true } },
        { action: { type: "pass", playerId: "p1" } },
        { action: { type: "pass", playerId: "p2" } },
        { action: { type: "pass", playerId: "p1" } },
        { action: { type: "pass", playerId: "p2" } },
        { action: { type: "pass", playerId: "p1" } },
      ],
    },
  };

  const replayState = runReplaySnapshot(characters, state);
  const replaySnapshot = {
    p1Hp: getPrimary(replayState, "p1").hp,
    p2Hp: getPrimary(replayState, "p2").hp,
  };
  const expectedReplay = {
    p1Hp: 97,
    p2Hp: 90,
  };

  try {
    assertSnapshot("Thorns on-hit snapshot", snapshot, expected);
    assertSnapshot("Thorns on-hit replay", replaySnapshot, expectedReplay);
    return { label: "Thorns deals damage on hit", ok: true };
  } catch (error) {
    return { label: "Thorns deals damage on hit", ok: false, details: String(error) };
  }
};

const runTurnEndDecayTest = (): GoldenResult => {
  const players = [
    { id: "p1" as const, name: "Decay", characterIds: withFillersIds("decay-a") },
    { id: "p2" as const, name: "Witness", characterIds: withFillersIds("decay-b") },
  ];
  const characters: Character[] = [
    {
      id: "decay-a",
      name: "Decay Alpha",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Turn End decay coverage.",
      art: "decay-alpha.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Setup",
          cost: "0 Energy",
          power: "-",
          types: ["Basic", "Special"],
          target: "Self",
          speed: "Normal",
          effect: [
            "Innate.",
            "Gain 3 Barrier.",
            "Gain 2 Invulnerable.",
            "Gain 2 Thorns Potency.",
            "Gain 2 Thorns Count.",
            "Inflict 2 Disarm.",
            "Inflict 2 Root.",
            "Inflict 2 Seal.",
            "Inflict 2 Silence.",
            "Inflict 2 Stagger.",
            "Gain 2 Taunt.",
            "Inflict 2 Wound.",
            "Inflict 2 Wither.",
            "Gain 1 Cover.",
            "Inflict 1 Stun.",
          ],
          effects: [
            {
              timing: "on_use",
              type: "gain_status",
              status: "Barrier",
              amount: { kind: "flat", value: 3 },
            },
            {
              timing: "on_use",
              type: "gain_status",
              status: "Invulnerable",
              amount: { kind: "flat", value: 2 },
            },
            {
              timing: "on_use",
              type: "gain_status",
              status: "Thorns",
              stat: "potency",
              amount: { kind: "flat", value: 2 },
            },
            {
              timing: "on_use",
              type: "gain_status",
              status: "Thorns",
              stat: "count",
              amount: { kind: "flat", value: 2 },
            },
            {
              timing: "on_use",
              type: "inflict_status",
              status: "Disarm",
              amount: { kind: "flat", value: 2 },
            },
            {
              timing: "on_use",
              type: "inflict_status",
              status: "Root",
              amount: { kind: "flat", value: 2 },
            },
            {
              timing: "on_use",
              type: "inflict_status",
              status: "Seal",
              amount: { kind: "flat", value: 2 },
            },
            {
              timing: "on_use",
              type: "inflict_status",
              status: "Silence",
              amount: { kind: "flat", value: 2 },
            },
            {
              timing: "on_use",
              type: "inflict_status",
              status: "Stagger",
              amount: { kind: "flat", value: 2 },
            },
            {
              timing: "on_use",
              type: "gain_status",
              status: "Taunt",
              amount: { kind: "flat", value: 2 },
            },
            {
              timing: "on_use",
              type: "inflict_status",
              status: "Wound",
              amount: { kind: "flat", value: 2 },
            },
            {
              timing: "on_use",
              type: "inflict_status",
              status: "Wither",
              amount: { kind: "flat", value: 2 },
            },
            {
              timing: "on_use",
              type: "gain_status",
              status: "Cover",
              amount: { kind: "flat", value: 1 },
            },
            {
              timing: "on_use",
              type: "inflict_status",
              status: "Stun",
              amount: { kind: "flat", value: 1 },
            },
          ],
        },
      ],
    },
    {
      id: "decay-b",
      name: "Decay Bravo",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Turn End decay coverage.",
      art: "decay-bravo.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Idle",
          cost: "0 Energy",
          power: "-",
          types: ["Basic", "Special"],
          target: "Self",
          speed: "Fast",
          effect: ["Innate."],
        },
      ],
    },
  ];

  let state = createSeededState(characters, players);
  state = applyOrThrow(state, playFromHand(state, "p1", "1", "normal"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);
  state = applyOrThrow(state, { type: "end_turn", playerId: "p1" }, characters);

  const snapshot = {
    turn: state.turn,
    p1Statuses: snapshotStatuses(state, "p1", [
      "Barrier",
      "Invulnerable",
      "Thorns",
      "Disarm",
      "Root",
      "Seal",
      "Silence",
      "Stagger",
      "Taunt",
      "Wound",
      "Wither",
      "Cover",
      "Stun",
    ]),
    transcript: snapshotTranscript(state),
  };
  const expected = {
    turn: 2,
    p1Statuses: {
      Barrier: valueStatus(2),
      Invulnerable: valueStatus(1),
      Thorns: potencyStatus(2, 1),
      Disarm: stackStatus(1),
      Root: stackStatus(1),
      Seal: stackStatus(1),
      Silence: stackStatus(1),
      Stagger: stackStatus(1),
      Taunt: stackStatus(1),
      Wound: stackStatus(1),
      Wither: stackStatus(1),
      Cover: valueStatus(0),
      Stun: stackStatus(0),
    },
    transcript: {
      version: 2,
      seed: goldenSeed,
      players,
      actions: [
        { action: { type: "play_card", playerId: "p1", zone: "normal", hasCardInstance: true } },
        { action: { type: "pass", playerId: "p2" } },
        { action: { type: "pass", playerId: "p1" } },
        { action: { type: "end_turn", playerId: "p1" } },
      ],
    },
  };

  const replayState = runReplaySnapshot(characters, state);
  const replaySnapshot = {
    turn: replayState.turn,
    p1Statuses: snapshotStatuses(replayState, "p1", [
      "Barrier",
      "Invulnerable",
      "Thorns",
      "Disarm",
      "Root",
      "Seal",
      "Silence",
      "Stagger",
      "Taunt",
      "Wound",
      "Wither",
      "Cover",
      "Stun",
    ]),
  };
  const expectedReplay = {
    turn: 2,
    p1Statuses: expected.p1Statuses,
  };

  try {
    assertSnapshot("Turn End decay snapshot", snapshot, expected);
    assertSnapshot("Turn End decay replay", replaySnapshot, expectedReplay);
    return { label: "Turn End decay applies to newly added statuses", ok: true };
  } catch (error) {
    return {
      label: "Turn End decay applies to newly added statuses",
      ok: false,
      details: String(error),
    };
  }
};

const runDeckReshuffleTest = (): GoldenResult => {
  const players = [
    { id: "p1" as const, name: "Alpha", characterIds: withFillersIds("shuffle-a") },
    { id: "p2" as const, name: "Bravo", characterIds: withFillersIds("shuffle-b") },
  ];
  const characters: Character[] = [
    {
      id: "shuffle-a",
      name: "Shuffle Alpha",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Deck reshuffle coverage.",
      art: "shuffle-alpha.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Short Strike",
          cost: "0 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
        },
        {
          slot: "2",
          name: "Short Guard",
          cost: "0 Energy",
          power: "10-10",
          types: ["Basic", "Defense", "Physical"],
          target: "Self",
          speed: "Normal",
          effect: ["Gain Power Shield."],
          effects: [{ timing: "on_use", type: "gain_shield", amount: { kind: "power" } }],
        },
      ],
    },
    {
      id: "shuffle-b",
      name: "Shuffle Bravo",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Deck reshuffle coverage.",
      art: "shuffle-bravo.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Short Strike",
          cost: "0 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
        },
        {
          slot: "2",
          name: "Short Guard",
          cost: "0 Energy",
          power: "10-10",
          types: ["Basic", "Defense", "Physical"],
          target: "Self",
          speed: "Normal",
          effect: ["Gain Power Shield."],
          effects: [{ timing: "on_use", type: "gain_shield", amount: { kind: "power" } }],
        },
      ],
    },
  ];

  let state = createSeededState(characters, players);
  state = applyOrThrow(state, { type: "end_turn", playerId: "p1" }, characters);

  const shuffleLogs = state.log.filter((entry) =>
    entry.includes("shuffles their discard into the draw pile.")
  );
  const snapshot = {
    turn: state.turn,
    p1Hand: state.players.p1.hand.length,
    p1Deck: state.players.p1.deck.length,
    p1Discard: state.players.p1.discard.length,
    shuffleLogs,
  };
  const expected = {
    turn: 2,
    p1Hand: 2,
    p1Deck: 0,
    p1Discard: 0,
    shuffleLogs: [
      "Bravo shuffles their discard into the draw pile.",
      "Alpha shuffles their discard into the draw pile.",
    ],
  };

  const replayState = runReplaySnapshot(characters, state);
  const replayShuffleLogs = replayState.log.filter((entry) =>
    entry.includes("shuffles their discard into the draw pile.")
  );
  const replaySnapshot = {
    p1Hand: replayState.players.p1.hand.length,
    p1Deck: replayState.players.p1.deck.length,
    p1Discard: replayState.players.p1.discard.length,
    shuffleLogs: replayShuffleLogs,
  };
  const expectedReplay = {
    p1Hand: expected.p1Hand,
    p1Deck: expected.p1Deck,
    p1Discard: expected.p1Discard,
    shuffleLogs: expected.shuffleLogs,
  };

  try {
    assertSnapshot("Deck reshuffle snapshot", snapshot, expected);
    assertSnapshot("Deck reshuffle replay", replaySnapshot, expectedReplay);
    return { label: "Draw reshuffles discard when deck is empty", ok: true };
  } catch (error) {
    return {
      label: "Draw reshuffles discard when deck is empty",
      ok: false,
      details: String(error),
    };
  }
};

const runTransformTargetExclusionTest = (): GoldenResult => {
  const players = [
    { id: "p1" as const, name: "Transformer", characterIds: withFillersIds("transform-a") },
    { id: "p2" as const, name: "Mirror", characterIds: withFillersIds("transform-b") },
  ];
  const characters: Character[] = [
    {
      id: "transform-a",
      name: "Transform Alpha",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Transform target exclusion coverage.",
      art: "transform-alpha.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Base Strike",
          cost: "0 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Innate.", "Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
          transforms: [
            {
              condition: { kind: "self_has_status", status: "Test Transform" },
              cardSlot: "2",
            },
          ],
        },
        {
          slot: "2",
          name: "Alt Strike",
          cost: "0 Energy",
          power: "20-20",
          types: ["Technique", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Innate.", "Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
        },
        {
          slot: "3",
          name: "Defend",
          cost: "0 Energy",
          power: "10-10",
          types: ["Basic", "Defense", "Physical"],
          target: "Self",
          speed: "Normal",
          effect: ["Innate.", "Gain Power Shield."],
          effects: [{ timing: "on_use", type: "gain_shield", amount: { kind: "power" } }],
        },
      ],
    },
    {
      id: "transform-b",
      name: "Transform Bravo",
      version: "Golden",
      origin: "Test",
      roles: [],
      difficulty: "Low",
      gameplan: "Transform target exclusion coverage.",
      art: "transform-bravo.png",
      innates: [],
      cards: [
        {
          slot: "1",
          name: "Base Strike",
          cost: "0 Energy",
          power: "10-10",
          types: ["Basic", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Innate.", "Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
          transforms: [
            {
              condition: { kind: "self_has_status", status: "Test Transform" },
              cardSlot: "2",
            },
          ],
        },
        {
          slot: "2",
          name: "Alt Strike",
          cost: "0 Energy",
          power: "20-20",
          types: ["Technique", "Attack", "Physical"],
          target: "1 Enemy",
          speed: "Normal",
          effect: ["Innate.", "Deal Power damage."],
          effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
        },
        {
          slot: "3",
          name: "Defend",
          cost: "0 Energy",
          power: "10-10",
          types: ["Basic", "Defense", "Physical"],
          target: "Self",
          speed: "Normal",
          effect: ["Innate.", "Gain Power Shield."],
          effects: [{ timing: "on_use", type: "gain_shield", amount: { kind: "power" } }],
        },
      ],
    },
  ];

  const state = createSeededState(characters, players);
  const snapshot = {
    p1Slots: countCardSlots(state.players.p1),
    p2Slots: countCardSlots(state.players.p2),
    transcript: snapshotTranscript(state),
  };
  const expected = {
    p1Slots: { "1": 1, "3": 1 },
    p2Slots: { "1": 1, "3": 1 },
    transcript: {
      version: 2,
      seed: goldenSeed,
      players,
      actions: [],
    },
  };

  const replayState = runReplaySnapshot(characters, state);
  const replaySnapshot = {
    p1Slots: countCardSlots(replayState.players.p1),
    p2Slots: countCardSlots(replayState.players.p2),
  };
  const expectedReplay = {
    p1Slots: expected.p1Slots,
    p2Slots: expected.p2Slots,
  };

  try {
    assertSnapshot("Transform target exclusion snapshot", snapshot, expected);
    assertSnapshot("Transform target exclusion replay", replaySnapshot, expectedReplay);
    return { label: "Transform target cards are excluded from deck and hand", ok: true };
  } catch (error) {
    return {
      label: "Transform target cards are excluded from deck and hand",
      ok: false,
      details: String(error),
    };
  }
};

export const runGoldenTests = () => [
  runInterruptChainTest(),
  runCancelledAlwaysTest(),
  runCannotPlayTest(),
  runTimingWindowsTest(),
  runStatusExpiryTest(),
  runCostSpeedModifierTest(),
  runMitigationStackingTest(),
  runSpendFlowTest(),
  runHealingReductionTest(),
  runThornsOnHitTest(),
  runTurnEndDecayTest(),
  runDeckReshuffleTest(),
  runTransformTargetExclusionTest(),
];

if (process.argv[1]?.includes("golden")) {
  const results = runGoldenTests();
  const failed = results.filter((result) => !result.ok);
  results.forEach((result) => {
    const status = result.ok ? "PASS" : "FAIL";
    const details = result.details ? ` - ${result.details}` : "";
    console.log(`${status}: ${result.label}${details}`);
  });
  if (failed.length) {
    process.exitCode = 1;
  }
}

