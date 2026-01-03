import type { Character } from "@ua/data";
import { applyAction, createMatchState } from "./index.js";

type HarnessResult = {
  label: string;
  ok: boolean;
  details?: string;
};

const testCharacters = (): Character[] => [
  {
    id: "test-attacker",
    name: "Test Attacker",
    version: "Harness",
    origin: "Test",
    roles: [],
    difficulty: "Low",
    gameplan: "Test harness character.",
    art: "test-attacker.png",
    innates: [],
    cards: [
      {
        slot: "1",
        name: "Strike",
        cost: "1 Energy",
        power: "10-10",
        types: ["Basic", "Attack", "Physical", "Melee", "Blunt"],
        target: "1 Enemy",
        speed: "Normal",
        effect: ["Deal Power damage.", "On Hit: Inflict 1 Weak."],
        effects: [
          { timing: "on_use", type: "deal_damage", amount: { kind: "power" } },
          {
            timing: "on_hit",
            type: "inflict_status",
            status: "Weak",
            amount: { kind: "flat", value: 1 },
          },
        ],
      },
      {
        slot: "2",
        name: "Fire Strike",
        cost: "1 Energy",
        power: "10-10",
        types: ["Basic", "Attack", "Fire"],
        target: "1 Enemy",
        speed: "Normal",
        effect: ["Deal Power damage."],
        effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
      },
      {
        slot: "3",
        name: "Follow Strike",
        cost: "1 Energy",
        power: "10-10",
        types: ["Technique", "Attack", "Physical"],
        target: "1 Enemy",
        speed: "Normal",
        effect: ["Follow-Up.", "Deal Power damage."],
        effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
      },
      {
        slot: "4",
        name: "Assist Strike",
        cost: "1 Energy",
        power: "10-10",
        types: ["Technique", "Attack", "Physical"],
        target: "1 Enemy",
        speed: "Normal",
        effect: ["Assist Attack.", "Deal Power damage."],
        effects: [{ timing: "on_use", type: "deal_damage", amount: { kind: "power" } }],
      },
    ],
  },
  {
    id: "test-defender",
    name: "Test Defender",
    version: "Harness",
    origin: "Test",
    roles: [],
    difficulty: "Low",
    gameplan: "Test harness character.",
    art: "test-defender.png",
    innates: [{ name: "Mitigation", text: "Resist 5 (Physical). Immune (Fire)." }],
    cards: [
      {
        slot: "1",
        name: "Defend",
        cost: "1 Energy",
        power: "10-10",
        types: ["Basic", "Defense", "Physical"],
        target: "1 Ally",
        speed: "Normal",
        effect: ["Gain Power Shield.", "Evade."],
        effects: [{ timing: "on_use", type: "gain_shield", amount: { kind: "power" } }],
      },
    ],
  },
];

const applyOrThrow = (
  state: ReturnType<typeof createMatchState>,
  action: Parameters<typeof applyAction>[1],
  characters: Character[]
) => {
  const result = applyAction(state, action, characters);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.state;
};

const getCardInstanceId = (
  state: ReturnType<typeof createMatchState>,
  playerId: "p1" | "p2",
  cardSlot: string
) => state.players[playerId].hand.find((card) => card.cardSlot === cardSlot)?.id;

const playFromHand = (
  state: ReturnType<typeof createMatchState>,
  playerId: "p1" | "p2",
  cardSlot: string,
  zone: "fast" | "normal" | "slow"
) => {
  const cardInstanceId = getCardInstanceId(state, playerId, cardSlot);
  if (!cardInstanceId) {
    throw new Error(`Missing card instance for ${playerId} slot ${cardSlot}.`);
  }
  return { type: "play_card" as const, playerId, cardInstanceId, zone };
};

const runEvadeTest = (characters: Character[]): HarnessResult => {
  let state = createMatchState(characters, [
    { id: "p1", name: "Attacker", characterId: "test-attacker" },
    { id: "p2", name: "Defender", characterId: "test-defender" },
  ]);

  state = applyOrThrow(state, playFromHand(state, "p1", "1", "normal"), characters);
  state = applyOrThrow(state, playFromHand(state, "p2", "1", "normal"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);

  const weak = state.players.p2.statuses["Weak"];
  if (weak && (weak.potency > 0 || weak.count > 0 || weak.stack > 0 || weak.value > 0)) {
    return { label: "Evade prevents On Hit effects", ok: false, details: "Weak applied." };
  }
  return { label: "Evade prevents On Hit effects", ok: true };
};

const runFollowUpTest = (characters: Character[]): HarnessResult => {
  let state = createMatchState(characters, [
    { id: "p1", name: "Attacker", characterId: "test-attacker" },
    { id: "p2", name: "Defender", characterId: "test-defender" },
  ]);
  state.initiativePlayerId = "p2";
  state.activePlayerId = "p1";

  state = applyOrThrow(state, playFromHand(state, "p1", "1", "normal"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);

  const followUpAction = playFromHand(state, "p1", "3", "normal");
  const result = applyAction(state, followUpAction, characters);
  if (result.error) {
    return { label: "Follow-Up can be played out of turn", ok: false, details: result.error };
  }
  return { label: "Follow-Up can be played out of turn", ok: true };
};

const runMitigationTest = (characters: Character[]): HarnessResult[] => {
  let state = createMatchState(characters, [
    { id: "p1", name: "Attacker", characterId: "test-attacker" },
    { id: "p2", name: "Defender", characterId: "test-defender" },
  ]);

  state = applyOrThrow(state, playFromHand(state, "p1", "1", "normal"), characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p2" }, characters);
  state = applyOrThrow(state, { type: "pass", playerId: "p1" }, characters);

  const resistOk = state.players.p2.hp === 95;

  let fireState = createMatchState(characters, [
    { id: "p1", name: "Attacker", characterId: "test-attacker" },
    { id: "p2", name: "Defender", characterId: "test-defender" },
  ]);
  fireState = applyOrThrow(fireState, playFromHand(fireState, "p1", "2", "normal"), characters);
  fireState = applyOrThrow(fireState, { type: "pass", playerId: "p2" }, characters);
  fireState = applyOrThrow(fireState, { type: "pass", playerId: "p1" }, characters);

  const immuneOk = fireState.players.p2.hp === 100;

  return [
    { label: "Resist reduces damage after shield", ok: resistOk, details: `HP=${state.players.p2.hp}` },
    { label: "Immune negates matching damage", ok: immuneOk, details: `HP=${fireState.players.p2.hp}` },
  ];
};

export const runHarness = () => {
  const results: HarnessResult[] = [];
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const characters = testCharacters();
    results.push(runEvadeTest(characters));
    results.push(runFollowUpTest(characters));
    results.push(...runMitigationTest(characters));
  } finally {
    Math.random = originalRandom;
  }

  return results;
};

if (process.argv[1]?.includes("harness")) {
  const results = runHarness();
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
