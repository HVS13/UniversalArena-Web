import type { Character, Effect } from "@ua/data";

export type CardTextCoverageIssue = {
  characterId: string;
  cardSlot: string;
  cardName: string;
  line: string;
  reason: string;
};

const flattenEffects = (effects: Effect[] | undefined): Effect[] => {
  if (!effects) return [];
  return effects.flatMap((effect) =>
    effect.type === "choose"
      ? [effect, ...effect.options.flatMap((option) => flattenEffects(option.effects))]
      : [effect]
  );
};

const hasAnyType = (effects: Effect[], types: Effect["type"][]) =>
  effects.some((effect) => types.includes(effect.type));

const presentationContracts = [
  /^(?:(?:Evade|Counter|Reuse|Follow-Up|Assist Attack|Close|Far|Retain|Innate|Exhaust|Ethereal)\.?\s*)+$/i,
  /^Choose (1|X\s*\(\d+\s*-\s*\d+\))[:.]?$/i,
  /^On Follow-Up:\s*[+-]\d+\s+Energy Cost\.?$/i,
  /^Always:\s*This card's Multihit Count starts at \d+\.?$/i,
  /^Set X to this card's remaining Multihit Count/i,
  /^Distance\s*>\s*\d+:/i,
];

const getMissingStructuredContracts = (line: string, effects: Effect[]) => {
  const required: string[] = [];
  const missing: string[] = [];
  const requireAny = (pattern: RegExp, types: Effect["type"][], label: string) => {
    if (!pattern.test(line)) return;
    required.push(label);
    if (!hasAnyType(effects, types)) missing.push(label);
  };

  requireAny(/\bDeal\b.*\bdamage\b/i, ["deal_damage", "deal_damage_per_spent"], "damage");
  requireAny(/\bGain\b.*\bShield\b/i, ["gain_shield"], "shield gain");
  requireAny(/\bHeal\b/i, ["heal"], "healing");
  requireAny(/\bGain\b.*\bUltimate Meter\b/i, ["gain_ultimate"], "Ultimate gain");
  requireAny(/\bCreate\b/i, ["create_card"], "card creation");
  requireAny(/\bReload\b/i, ["reload_equipped", "choose"], "reload");
  requireAny(/\bSwitch to Equip:/i, ["switch_equip", "choose"], "equipment switch");
  requireAny(/cannot play cards/i, ["block_play"], "play lock");
  requireAny(/\bSet\b.*\b(Value|Count)\b/i, ["set_status"], "status set");
  requireAny(/\bReduce\b.*\b(Value|Count)\b/i, ["reduce_status"], "status reduction");
  requireAny(/\bReduce by\b.*\bUltimate Meter spent\b/i, ["reduce_status"], "scaled status reduction");
  requireAny(/\bSpend\b/i, ["spend_status"], "status spend");
  requireAny(/\bInflict\b/i, ["inflict_status", "inflict_status_per_spent", "choose"], "status infliction");

  const gainStatusLine = /\bGain\b/i.test(line) &&
    !/\bGain\b.*\b(Shield|Ultimate Meter)\b/i.test(line) &&
    !/This card gains (Evade|Counter|Reuse)/i.test(line);
  if (
    gainStatusLine
  ) {
    required.push("status gain");
    if (!hasAnyType(effects, ["gain_status", "gain_status_per_spent", "choose"])) {
      missing.push("status gain");
    }
  }

  return { missing, recognized: required.length > 0 };
};

export const auditCardTextCoverage = (characters: Character[]): CardTextCoverageIssue[] => {
  const issues: CardTextCoverageIssue[] = [];
  characters.forEach((character) => {
    [...character.cards, ...(character.createdCards ?? [])].forEach((card) => {
      const effects = flattenEffects(card.effects);
      card.effect.forEach((line) => {
        const normalized = line.trim();
        if (!normalized) return;
        if (presentationContracts.some((pattern) => pattern.test(normalized))) return;
        if (/\bbecomes\b/i.test(normalized) && card.transforms?.length) return;
        if (/\bplayed\b/i.test(normalized) && card.restrictions?.length) return;

        const { missing, recognized } = getMissingStructuredContracts(normalized, effects);
        if (recognized && !missing.length) return;
        issues.push({
          characterId: character.id,
          cardSlot: card.slot,
          cardName: card.name,
          line: normalized,
          reason: recognized
            ? `Missing structured ${missing.join(", ")} contract.`
            : "No supported structured or text-parser contract recognizes this line.",
        });
      });
    });
  });
  return issues;
};
