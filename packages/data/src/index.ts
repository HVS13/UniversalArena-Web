import charactersRaw from "./characters.json";
import keywordsRaw from "./keywords.json";
import statusEffectsRaw from "./status-effects.json";
import termsRaw from "./terms.json";
import cardTypesRaw from "./card-types.json";
import rolesRaw from "./roles.json";
import type {
  CardType,
  Character,
  Keyword,
  Role,
  StatusEffectDefinition,
  Term,
} from "./types";

export type {
  Card,
  CardType,
  CardTransform,
  Character,
  Effect,
  EffectAmount,
  EffectCondition,
  EffectTiming,
  Innate,
  Keyword,
  Role,
  StatusEffect,
  StatusEffectDefinition,
  StatusRule,
  StatusValueStat,
  Term,
} from "./types";

export const characters = (charactersRaw as { characters: Character[] }).characters;
export const keywords = (keywordsRaw as { keywords: Keyword[] }).keywords;
export const statusEffects = (statusEffectsRaw as {
  statusEffects: StatusEffectDefinition[];
}).statusEffects;
export const terms = (termsRaw as { terms: Term[] }).terms;
export const cardTypes = (cardTypesRaw as { cardTypes: CardType[] }).cardTypes;
export const roles = (rolesRaw as { roles: Role[] }).roles;
