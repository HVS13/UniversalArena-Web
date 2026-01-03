export type Innate = {
  name: string;
  text: string;
};

export type StatusEffect = {
  name: string;
  lines: string[];
};

export type Keyword = {
  id: string;
  name: string;
  category: string;
  description: string;
};

export type Role = {
  id: string;
  name: string;
  description: string;
};

export type CardType = {
  id: string;
  name: string;
  category: string;
  description: string;
};

export type Term = {
  id: string;
  name: string;
  section: string;
  definition: string;
};

export type StatusRule = {
  timing: string;
  text: string;
};

export type StatusEffectDefinition = {
  id: string;
  name: string;
  type: string;
  potencyMax?: number;
  countMax?: number;
  stackMax?: number;
  valueMax?: number;
  rules: StatusRule[];
};

export type EffectTiming =
  | "on_play"
  | "before_clash"
  | "after_clash"
  | "before_use"
  | "on_use"
  | "on_hit"
  | "after_use"
  | "always";

export type EffectAmount =
  | { kind: "flat"; value: number }
  | { kind: "power" }
  | { kind: "power_div"; divisor: number };

export type Effect =
  | { timing: EffectTiming; type: "deal_damage"; amount: EffectAmount }
  | { timing: EffectTiming; type: "gain_shield"; amount: EffectAmount }
  | { timing: EffectTiming; type: "heal"; amount: EffectAmount }
  | { timing: EffectTiming; type: "gain_ultimate"; amount: EffectAmount }
  | { timing: EffectTiming; type: "gain_status"; status: string; amount: EffectAmount }
  | { timing: EffectTiming; type: "inflict_status"; status: string; amount: EffectAmount };

export type Card = {
  slot: string;
  name: string;
  cost: string;
  power: string;
  types: string[];
  target: string;
  speed: string;
  effect: string[];
  effects?: Effect[];
};

export type Character = {
  id: string;
  name: string;
  version: string;
  origin: string;
  roles: string[];
  difficulty: string;
  gameplan: string;
  art: string;
  innates: Innate[];
  statusEffects?: StatusEffect[];
  cards: Card[];
  createdCards?: Card[];
};
