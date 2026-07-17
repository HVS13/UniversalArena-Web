export type DataManifest = {
  schemaVersion: number;
  sourceRepository: string;
  sourceCommit: string;
  generatedAt: string;
  contentHash: `sha256:${string}`;
  rosterCount: number;
};

export type Innate = {
  id: string;
  name: string;
  text: string;
  setup?: InnateEffect[];
  mitigations?: InnateMitigation[];
  triggers?: InnateTrigger[];
};

export type InnateScope = "always" | "once_per_turn" | "once_per_game";

export type InnateTarget = "self" | "event_target" | "event_source";

export type InnateEffect =
  | { type: "gain_status"; status: string; amount: number; stat?: StatusValueStat; target?: InnateTarget; recordMax?: boolean }
  | { type: "reduce_status"; status: string; amount: number | "event_amount"; stat?: StatusValueStat; target?: InnateTarget }
  | { type: "set_status"; status: string; amount: number; stat?: StatusValueStat; target?: InnateTarget }
  | { type: "remove_status"; status: string; target?: InnateTarget }
  | { type: "heal"; amount: number; target?: InnateTarget }
  | { type: "draw_cards"; amount: number; target?: InnateTarget };

export type InnateEventType =
  | "status_changed"
  | "status_inflicted"
  | "status_threshold_crossed"
  | "hp_damage_taken"
  | "hp_threshold_crossed"
  | "would_be_defeated";

export type InnateTriggerFilters = {
  subject?: "self" | "any";
  source?: "self" | "enemy" | "any";
  status?: string;
  direction?: "upward" | "downward";
  threshold?: number;
  cardType?: string;
  hpDamageOnly?: boolean;
  originalOnly?: boolean;
};

export type InnateDecision = {
  type: "optional_defeat_replacement";
  spendStatus: string;
  spendAmount: number;
  setHp: number;
};

export type InnateTrigger = {
  id: string;
  event: InnateEventType;
  scope: InnateScope;
  filters?: InnateTriggerFilters;
  effects?: InnateEffect[];
  decision?: InnateDecision;
  useEventAmount?: boolean;
  additional?: boolean;
};

export type InnateDamagePredicate = {
  mode: "any" | "all";
  types?: string[];
  tags?: string[];
};

export type InnateMitigation = {
  kind: "resist" | "immune" | "weakness" | "absorb";
  amount?: number;
  amountMode?: "flat" | "percent";
  include?: InnateDamagePredicate;
  exclude?: InnateDamagePredicate;
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

export type EffectPlayWindow = "assist_attack" | "follow_up" | "after_use";

export type EffectComparisonOperator = "eq" | "ne" | "lt" | "lte" | "gt" | "gte";

export type EffectScalar =
  | number
  | { kind: "x" }
  | { kind: "x_plus"; value: number }
  | { kind: "x_minus"; value: number }
  | { kind: "x_times"; value: number };

export type StatusEffectCondition =
  | { kind: "self_has_status"; status: string; min?: number; max?: number }
  | { kind: "self_missing_status"; status: string; min?: number; max?: number }
  | { kind: "target_has_status"; status: string; min?: number; max?: number }
  | { kind: "target_missing_status"; status: string; min?: number; max?: number };

export type EffectCondition =
  | StatusEffectCondition
  | { kind: "play_window"; window: EffectPlayWindow }
  | {
      kind: "compare";
      left: EffectScalar;
      operator: EffectComparisonOperator;
      right: EffectScalar;
    };

export type EffectAmount =
  | { kind: "flat"; value: number }
  | { kind: "power" }
  | { kind: "power_div"; divisor: EffectScalar }
  | { kind: "x" }
  | { kind: "x_plus"; value: number }
  | { kind: "x_minus"; value: number }
  | { kind: "x_times"; value: number };

export type CardTransform = {
  condition: StatusEffectCondition;
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

export type UseRestrictionWindow = EffectPlayWindow;

export type UseRestriction =
  | {
      kind: "require" | "forbid";
      subject: "self" | "target";
      mode: "any" | "all";
      statuses: UseRestrictionStatus[];
      raw?: string;
    }
  | {
      kind: "require_window" | "forbid_window";
      window: UseRestrictionWindow;
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
