import type { Character, Effect } from "@ua/data";
import {
  applyAction,
  createMatchState,
  exportTranscript,
  hashMatchState,
  replayTranscript,
  type Action,
  type MatchCharacterId,
  type MatchState,
  type PlayerId,
  type ZoneName,
} from "./index.js";

const seed = 919191;

const fillerCharacters: Character[] = [
  {
    id: "condition-filler-1",
    name: "Condition Filler One",
    version: "Golden",
    origin: "Test",
    roles: [],
    difficulty: "Low",
    gameplan: "Condition test filler.",
    art: "condition-filler-1.png",
    innates: [],
    cards: [],
  },
  {
    id: "condition-filler-2",
    name: "Condition Filler Two",
    version: "Golden",
    origin: "Test",
    roles: [],
    difficulty: "Low",
    gameplan: "Condition test filler.",
    art: "condition-filler-2.png",
    innates: [],
    cards: [],
  },
];

const targetCharacter: Character = {
  id: "condition-target",
  name: "Condition Target",
  version: "Golden",
  origin: "Test",
  roles: [],
  difficulty: "Low",
  gameplan: "Receives structured conditional effects.",
  art: "condition-target.png",
  innates: [],
  cards: [],
};

const playWindowCharacters: Character[] = [
  {
    id: "condition-trigger",
    name: "Condition Trigger",
    version: "Golden",
    origin: "Test",
    roles: [],
    difficulty: "Low",
    gameplan: "Creates and consumes reaction windows.",
    art: "condition-trigger.png",
    innates: [],
    cards: [
      {
        slot: "setup",
        name: "Setup",
        cost: "0 Energy",
        power: "-",
        types: ["Technique", "Special"],
        target: "Self",
        speed: "Fast",
        effect: ["Innate."],
      },
      {
        slot: "follow-up",
        name: "Conditional Suplex",
        cost: "0 Energy",
        power: "-",
        types: ["Technique", "Special"],
        target: "1 Enemy",
        speed: "Fast",
        effect: ["Innate.", "Follow-Up.", "On Follow-Up: Inflict 1 Stun."],
        effects: [
          {
            timing: "on_use",
            type: "inflict_status",
            status: "Stun",
            amount: { kind: "flat", value: 1 },
            condition: { kind: "play_window", window: "follow_up" },
          },
          {
            timing: "on_use",
            type: "gain_status",
            status: "After Use Context",
            amount: { kind: "flat", value: 1 },
            condition: { kind: "play_window", window: "after_use" },
          },
        ],
      },
    ],
  },
  {
    id: "condition-assistant",
    name: "Condition Assistant",
    version: "Golden",
    origin: "Test",
    roles: [],
    difficulty: "Low",
    gameplan: "Tests Assist Attack reaction context.",
    art: "condition-assistant.png",
    innates: [],
    cards: [
      {
        slot: "assist",
        name: "Conditional Assist",
        cost: "0 Energy",
        power: "-",
        types: ["Technique", "Special"],
        target: "1 Enemy",
        speed: "Fast",
        effect: ["Innate.", "Assist Attack.", "On Assist Attack: Inflict 1 Stun."],
        effects: [
          {
            timing: "on_use",
            type: "inflict_status",
            status: "Stun",
            amount: { kind: "flat", value: 1 },
            condition: { kind: "play_window", window: "assist_attack" },
          },
          {
            timing: "on_use",
            type: "gain_status",
            status: "After Use Context",
            amount: { kind: "flat", value: 1 },
            condition: { kind: "play_window", window: "after_use" },
          },
        ],
      },
    ],
  },
];

const unknownEffect = {
  timing: "on_use",
  type: "gain_status",
  status: "Unknown Condition Applied",
  amount: { kind: "flat", value: 1 },
  condition: { kind: "future_condition" },
} as unknown as Effect;

const compareCharacter: Character = {
  id: "condition-compare",
  name: "Condition Compare",
  version: "Golden",
  origin: "Test",
  roles: [],
  difficulty: "Low",
  gameplan: "Tests scalar comparison conditions.",
  art: "condition-compare.png",
  innates: [],
  cards: [
    {
      slot: "barrage",
      name: "Conditional Barrage",
      cost: "0 Energy",
      power: "1-1",
      types: ["Technique", "Attack", "Physical", "Multihit"],
      target: "1 Enemy",
      speed: "Normal",
      effect: [
        "Innate.",
        "Choose X (2-3).",
        "Deal Power damage X + 2 times.",
        "On Hit: If X is 3, Inflict 1 Barrage Mark.",
      ],
      effects: [
        {
          timing: "on_use",
          type: "deal_damage",
          amount: { kind: "power" },
          hits: { kind: "x_plus", value: 2 },
        },
        {
          timing: "on_hit",
          type: "inflict_status",
          status: "Barrage Mark",
          amount: { kind: "flat", value: 1 },
          condition: {
            kind: "compare",
            left: { kind: "x" },
            operator: "eq",
            right: 3,
          },
        },
      ],
    },
    {
      slot: "unknown",
      name: "Unknown Condition",
      cost: "0 Energy",
      power: "-",
      types: ["Technique", "Special"],
      target: "Self",
      speed: "Normal",
      effect: ["Innate."],
      effects: [unknownEffect],
    },
  ],
};

const applyOrThrow = (state: MatchState, action: Action, characters: Character[]) => {
  const result = applyAction(state, action, characters);
  if (result.error) throw new Error(result.error);
  return result.state;
};

const completeMovement = (state: MatchState, characters: Character[]) => {
  let next = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);
  next = applyOrThrow(next, { type: "pass", playerId: "p2" }, characters);
  return next;
};

const findInstance = (
  state: MatchState,
  playerId: PlayerId,
  characterId: string,
  cardSlot: string
) => {
  const team = state.players[playerId];
  const inHand = team.hand.find(
    (card) => card.characterId === characterId && card.cardSlot === cardSlot
  );
  if (inHand) return inHand.id;
  const deckIndex = team.deck.findIndex(
    (card) => card.characterId === characterId && card.cardSlot === cardSlot
  );
  if (deckIndex < 0) throw new Error(`Missing ${characterId}/${cardSlot}.`);
  const [moved] = team.deck.splice(deckIndex, 1);
  if (!moved) throw new Error(`Could not move ${characterId}/${cardSlot}.`);
  team.hand.push(moved);
  return moved.id;
};

const play = (
  state: MatchState,
  characters: Character[],
  playerId: PlayerId,
  characterId: string,
  cardSlot: string,
  zone: ZoneName,
  targetId: MatchCharacterId,
  xValue?: number
) =>
  applyOrThrow(
    state,
    {
      type: "play_card",
      playerId,
      cardInstanceId: findInstance(state, playerId, characterId, cardSlot),
      zone,
      targetId,
      xValue,
    },
    characters
  );

const resolveSingleCard = (state: MatchState, characters: Character[]) => {
  let next = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);
  next = applyOrThrow(next, { type: "pass", playerId: "p1" }, characters);
  return next;
};

const statusValue = (state: MatchState, characterId: MatchCharacterId, status: string) => {
  const member = [...state.players.p1.characters, ...state.players.p2.characters].find(
    (candidate) => candidate.id === characterId
  );
  const value = member?.statuses[status];
  if (!value) return 0;
  return Math.max(value.potency, value.count, value.stack, value.value);
};

const assertReplay = (state: MatchState, characters: Character[]) => {
  const transcript = exportTranscript(state);
  if (!transcript) throw new Error("Missing transcript.");
  const replay = replayTranscript(characters, transcript);
  if (replay.error || !replay.state) throw new Error(replay.error ?? "Missing replay state.");
  if (hashMatchState(replay.state) !== hashMatchState(state)) {
    throw new Error("Conditional-effect replay hash mismatch.");
  }
};

const createPlayWindowState = () => {
  const characters = [...playWindowCharacters, targetCharacter, ...fillerCharacters];
  const players = [
    {
      id: "p1" as const,
      name: "Window Team",
      characterIds: ["condition-trigger", "condition-assistant", "condition-filler-1"],
    },
    {
      id: "p2" as const,
      name: "Target Team",
      characterIds: ["condition-target", "condition-filler-1", "condition-filler-2"],
    },
  ];
  return {
    characters,
    state: completeMovement(
      createMatchState(characters, players, { seed, enableTranscript: true }),
      characters
    ),
  };
};

const runPlayWindowTests = () => {
  {
    const { characters, state: initial } = createPlayWindowState();
    const targetId = initial.players.p2.characters[0].id;
    let state = play(
      initial,
      characters,
      "p1",
      "condition-trigger",
      "follow-up",
      "fast",
      targetId
    );
    state = resolveSingleCard(state, characters);
    if (statusValue(state, targetId, "Stun") !== 0) {
      throw new Error("A normally played Follow-Up card applied its Follow-Up-only effect.");
    }
    if (statusValue(state, state.players.p1.characters[0].id, "After Use Context") !== 0) {
      throw new Error("A normal play was incorrectly marked as after-use context.");
    }
  }

  {
    const { characters, state: initial } = createPlayWindowState();
    const sourceId = initial.players.p1.characters[0].id;
    const targetId = initial.players.p2.characters[0].id;
    let state = play(initial, characters, "p1", "condition-trigger", "setup", "fast", sourceId);
    state = resolveSingleCard(state, characters);
    if (!state.pendingResolution) throw new Error("Follow-Up reaction window did not open.");
    state = play(
      state,
      characters,
      "p1",
      "condition-trigger",
      "follow-up",
      "fast",
      targetId
    );
    if (statusValue(state, targetId, "Stun") !== 1) {
      throw new Error("Follow-Up play did not apply its Follow-Up-only effect.");
    }
    if (statusValue(state, sourceId, "After Use Context") !== 1) {
      throw new Error("Follow-Up play did not retain generic after-use context.");
    }
    assertReplay(state, characters);
  }

  {
    const { characters, state: initial } = createPlayWindowState();
    const triggerId = initial.players.p1.characters[0].id;
    const assistantId = initial.players.p1.characters[1].id;
    const targetId = initial.players.p2.characters[0].id;
    let state = play(initial, characters, "p1", "condition-trigger", "setup", "fast", triggerId);
    state = resolveSingleCard(state, characters);
    if (!state.pendingResolution) throw new Error("Assist Attack reaction window did not open.");
    state = play(
      state,
      characters,
      "p1",
      "condition-assistant",
      "assist",
      "fast",
      targetId
    );
    if (statusValue(state, targetId, "Stun") !== 1) {
      throw new Error("Assist Attack play did not apply its Assist-only effect.");
    }
    if (statusValue(state, assistantId, "After Use Context") !== 1) {
      throw new Error("Assist Attack play did not retain generic after-use context.");
    }
  }
};

const createCompareState = () => {
  const characters = [compareCharacter, targetCharacter, ...fillerCharacters];
  const players = [
    {
      id: "p1" as const,
      name: "Compare Team",
      characterIds: ["condition-compare", "condition-filler-1", "condition-filler-2"],
    },
    {
      id: "p2" as const,
      name: "Target Team",
      characterIds: ["condition-target", "condition-filler-1", "condition-filler-2"],
    },
  ];
  return {
    characters,
    state: completeMovement(
      createMatchState(characters, players, { seed, enableTranscript: true }),
      characters
    ),
  };
};

const runCompareAndFailClosedTests = () => {
  {
    const { characters, state: initial } = createCompareState();
    const targetId = initial.players.p2.characters[0].id;
    let state = play(
      initial,
      characters,
      "p1",
      "condition-compare",
      "barrage",
      "normal",
      targetId,
      2
    );
    state = resolveSingleCard(state, characters);
    if (statusValue(state, targetId, "Barrage Mark") !== 0) {
      throw new Error("X = 2 incorrectly satisfied X == 3.");
    }
  }

  {
    const { characters, state: initial } = createCompareState();
    const targetId = initial.players.p2.characters[0].id;
    let state = play(
      initial,
      characters,
      "p1",
      "condition-compare",
      "barrage",
      "normal",
      targetId,
      3
    );
    state = resolveSingleCard(state, characters);
    if (statusValue(state, targetId, "Barrage Mark") !== 5) {
      throw new Error(
        `X = 3 expected five On-Hit applications, received ${statusValue(
          state,
          targetId,
          "Barrage Mark"
        )}.`
      );
    }
    assertReplay(state, characters);
  }

  {
    const { characters, state: initial } = createCompareState();
    const sourceId = initial.players.p1.characters[0].id;
    let state = play(
      initial,
      characters,
      "p1",
      "condition-compare",
      "unknown",
      "normal",
      sourceId
    );
    state = resolveSingleCard(state, characters);
    if (statusValue(state, sourceId, "Unknown Condition Applied") !== 0) {
      throw new Error("An unknown condition kind was treated as satisfied.");
    }
  }
};

try {
  runPlayWindowTests();
  runCompareAndFailClosedTests();
  console.log("PASS: Structured play-window and scalar conditions execute and fail closed");
} catch (error) {
  console.error(`FAIL: Structured effect conditions - ${String(error)}`);
  process.exitCode = 1;
}
