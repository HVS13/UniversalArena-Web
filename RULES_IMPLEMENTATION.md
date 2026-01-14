# Rules Implementation Matrix

Status key: Implemented, Partial, Missing, Not used in data.
Last verified: 2026-01-14.

## Keywords
| Keyword | Status | Notes |
| --- | --- | --- |
| Ethereal | Implemented | Hand-end cleanup exhausts Ethereal cards. |
| Exhaust | Implemented | Exhausted on use; removed from play. |
| Innate | Implemented | Starts in opening hand. |
| Retain | Implemented | Retained at hand cleanup; structured `retain` supported. |
| Prepare X | Implemented | Turn-start cost adjustments apply to hand. |
| Evade | Implemented | Defense vs Attack clash; reuse if 0 damage after Shield. |
| Counter | Implemented | Zero-damage defense opens a one-action counter window targeting the attacker. |
| Reuse | Implemented | Keeps card in zone after clash. |
| Follow-Up | Implemented | After Use window; same-character plays. |
| Assist Attack | Implemented | After Use window; other-character plays. |
| Close | Implemented | Distance-based Power modifier for single-target cards. |
| Far | Implemented | Distance-based Power modifier for single-target cards. |
| Resist X | Implemented | Parsed from text/innates/status rules; higher of flat/percent. |
| Immune (Damage Type) | Implemented | Parsed from text/innates/status rules. |
| Weakness X | Implemented | Parsed from text/innates/status rules. |
| Absorb X | Implemented | Parsed from text/innates/status rules with healing. |
| Cleanse | Implemented | Text parsing reduces/removes negative statuses; unique/neutral skipped. |
| Dispel | Implemented | Text parsing reduces/removes positive statuses; unique/neutral skipped. |
| Purge | Implemented | Text parsing reduces/removes positive/negative statuses; unique/neutral skipped. |
| Push X | Implemented | Moves target along their line via swaps; rooted path blocks movement; optional direction for opposed targets. |
| Pull X | Implemented | Moves target toward source column; rooted path blocks movement. |
| Swap | Implemented | Swaps source/target allies; rooted targets block swaps. |
| Scry X | Implemented | Supports discard/reorder choices via action fields; deterministic fallback. |
| Search | Implemented | Supports chosen card via action field; deterministic fallback. |
| Seek X | Implemented | Supports chosen take list via action field; deterministic fallback. |
| Redirect (Target) | Implemented | Cover + Redirect text update single-target effects; choice via action field, deterministic fallback. |
| Bounce X | Implemented | Random adjacent extra targets resolved in multi-target effects. |

## Status Effects
All 30 global status effects in `docs/data/status-effects.yml` are implemented in core
(on gain, turn start/end, caps, and decay). This includes Bleed/Burn/Poison triggers,
Stagnate on-gain, Stun skip, Thorns, Barrier/Invulnerable, Wound/Wither healing reduction,
and the Strength/Dexterity/Frail/Weak/Fortified/Vulnerable modifiers.

## Rules / Terms / Flow
| Rule / Term | Status | Notes |
| --- | --- | --- |
| Turn Start (Energy reset + draw to hand size) | Implemented | Energy set to 5, draw to size 5. |
| Movement Round | Implemented | Alternating swap/pass phase with 1 Energy adjacency swaps; rooted swaps fail. |
| Combat Round / Active Zone / Priority | Implemented | Zones, interrupts, pass resolution. |
| Draw (reshuffle) | Implemented | Discard reshuffle when draw deck empty. |
| Discard | Implemented | Hand cleanup and discard pile updates. |
| Played / Used | Implemented | Logs + effect timings. |
| Distance (Power adjustments) | Implemented | Single-target Power rolls adjust by distance; Close/Far modify. |
| Cancelled | Implemented | Before Use onward skipped; Always applies. |
| Negated | Implemented | Cards with Negate text negate the opposing clash card; negated cards skip all effects. |
| Cannot Play Cards | Partial | Implemented via `block_play` (combat round only); requires structured effects. |
| Created Card default destination | Implemented | Created cards go to discard unless effect text specifies a destination. |
| Damage resolution order | Implemented | Power mods -> Immune -> % mods -> Shield -> Barrier -> flat HP mods -> HP. |
| AoE / Splash / Bounce | Implemented | Multi-target resolution for AoE + splash adjacency + bounce adjacency rolls. |
| Redirect | Implemented | Single-target redirect applies before use; AoE/random unaffected; choice via action field. |
| Rule Priority | Implemented | Structured effects and restrictions override defaults. |

## Structured Effects
Current structured effect types in data are fully supported in core:
`deal_damage`, `gain_shield`, `heal`, `gain_ultimate`, `gain_status`,
`inflict_status`, `gain_status_per_spent`, `inflict_status_per_spent`,
`set_status`, `reduce_status`, `spend_status`, `deal_damage_per_spent`,
`draw_cards`, `create_card`, `reload_equipped`, `switch_equip`, `choose`,
`grant_keyword`, `retain`.
