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
  tier?: "Core" | "Advanced";
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

export type StatusValueStat = "potency" | "count" | "stack" | "value";

export type EffectTarget = "self" | "target" | "opponent";

export type EffectCondition =
  | { kind: "self_has_status"; status: string; min?: number }
  | { kind: "self_missing_status"; status: string }
  | { kind: "target_has_status"; status: string; min?: number }
  | { kind: "target_missing_status"; status: string };

export type EffectScalar =
  | number
  | { kind: "x" }
  | { kind: "x_plus"; value: number }
  | { kind: "x_minus"; value: number }
  | { kind: "x_times"; value: number };

export type EffectAmount =
  | { kind: "flat"; value: number }
  | { kind: "power" }
  | { kind: "power_div"; divisor: EffectScalar }
  | { kind: "x" }
  | { kind: "x_plus"; value: number }
  | { kind: "x_minus"; value: number }
  | { kind: "x_times"; value: number };

export type CardTransform = {
  condition: EffectCondition;
  cardSlot: string;
};

type EffectBase = {
  timing: EffectTiming;
  condition?: EffectCondition;
};

export type EffectOption = {
  label?: string;
  effects: Effect[];
};

export type UseRestrictionStatus = {
  name: string;
  min?: number;
};

export type UseRestriction = {
  kind: "require" | "forbid";
  subject: "self" | "target";
  mode: "any" | "all";
  statuses: UseRestrictionStatus[];
  raw?: string;
};

export type Effect =
  | (EffectBase & { type: "deal_damage"; amount: EffectAmount; hits?: EffectScalar })
  | (EffectBase & { type: "gain_shield"; amount: EffectAmount })
  | (EffectBase & { type: "heal"; amount: EffectAmount })
  | (EffectBase & { type: "gain_ultimate"; amount: EffectAmount })
  | (EffectBase & {
      type: "gain_status";
      status: string;
      amount: EffectAmount;
      stat?: StatusValueStat;
    })
  | (EffectBase & {
      type: "inflict_status";
      status: string;
      amount: EffectAmount;
      stat?: StatusValueStat;
    })
  | (EffectBase & {
      type: "gain_status_per_spent";
      status: string;
      resource: string;
      amount: EffectAmount;
      stat?: StatusValueStat;
    })
  | (EffectBase & {
      type: "inflict_status_per_spent";
      status: string;
      resource: string;
      amount: EffectAmount;
      stat?: StatusValueStat;
    })
  | (EffectBase & {
      type: "set_status";
      status: string;
      amount: EffectAmount;
      stat?: StatusValueStat;
      target?: EffectTarget;
    })
  | (EffectBase & {
      type: "reduce_status";
      status: string;
      amount: EffectAmount;
      stat?: StatusValueStat;
      target?: EffectTarget;
      minValue?: number;
      maxAmount?: number;
    })
  | (EffectBase & {
      type: "spend_status";
      status: string;
      amount: EffectAmount;
      allowPartial?: boolean;
      gateAll?: boolean;
      gateDamage?: boolean;
    })
  | (EffectBase & { type: "deal_damage_per_spent"; status: string; amount: EffectAmount })
  | (EffectBase & { type: "draw_cards"; amount: EffectAmount; target?: EffectTarget })
  | (EffectBase & {
      type: "create_card";
      cardName: string;
      count: EffectAmount;
      target?: EffectTarget;
    })
  | (EffectBase & {
      type: "block_play";
      target?: EffectTarget;
      duration: "combat_round";
    })
  | (EffectBase & { type: "reload_equipped" })
  | (EffectBase & { type: "switch_equip"; status: string })
  | (EffectBase & { type: "choose"; options: EffectOption[] })
  | (EffectBase & { type: "grant_keyword"; keyword: string; resource?: string; minSpent?: number })
  | (EffectBase & { type: "retain" });

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
  restrictions?: UseRestriction[];
  transforms?: CardTransform[];
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
