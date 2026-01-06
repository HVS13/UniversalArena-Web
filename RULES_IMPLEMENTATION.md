# Rules Implementation Matrix

Status key: Implemented, Partial, Missing, Not used in data.

## Keywords
| Keyword | Status | Notes |
| --- | --- | --- |
| Ethereal | Implemented | Hand-end cleanup exhausts Ethereal cards. |
| Exhaust | Implemented | Exhausted on use; removed from play. |
| Innate | Implemented | Starts in opening hand. |
| Retain | Implemented | Retained at hand cleanup; structured `retain` supported. |
| Prepare X | Implemented | Turn-start cost adjustments apply to hand. |
| Evade | Implemented | Defense vs Attack clash; reuse if 0 damage after Shield. |
| Counter | Missing | No rule support for Counter follow-up plays. |
| Reuse | Implemented | Keeps card in zone after clash. |
| Follow-Up | Implemented | After Use window; same-character plays. |
| Assist Attack | Implemented | After Use window; other-character plays. |
| Resist X | Implemented | Parsed from text/innates/status rules; higher of flat/percent. |
| Immune (Damage Type) | Implemented | Parsed from text/innates/status rules. |
| Weakness X | Implemented | Parsed from text/innates/status rules. |
| Absorb X | Implemented | Parsed from text/innates/status rules with healing. |
| Cleanse | Missing | No structured or text parsing for Cleanse/Dispel/Purge. |
| Dispel | Missing | See Cleanse. |
| Purge | Missing | See Cleanse. |
| Push X | Missing | Move/swap helpers exist but no effect wiring. |
| Pull X | Missing | See Push. |
| Swap | Missing | See Push. |
| Scry X | Missing | No deck inspection/reorder logic. |
| Search | Missing | No deck search/shuffle logic. |
| Seek X | Missing | No seek/filter logic. |
| Redirect (Target) | Missing | Only Cover has hardcoded redirect. |
| Bounce X | Missing | No adjacency-based extra targeting. |

## Status Effects
All 30 global status effects in `docs/data/status-effects.yml` are implemented in core
(on gain, turn start/end, caps, and decay). This includes Bleed/Burn/Poison triggers,
Stagnate on-gain, Stun skip, Thorns, Barrier/Invulnerable, Wound/Wither healing reduction,
and the Strength/Dexterity/Frail/Weak/Fortified/Vulnerable modifiers.

## Rules / Terms / Flow
| Rule / Term | Status | Notes |
| --- | --- | --- |
| Turn Start (Energy reset + draw to hand size) | Implemented | Energy set to 5, draw to size 5. |
| Movement Round | Missing | No phase/actions for movement swaps. |
| Combat Round / Active Zone / Priority | Implemented | Zones, interrupts, pass resolution. |
| Draw (reshuffle) | Implemented | Discard reshuffle when draw deck empty. |
| Discard | Implemented | Hand cleanup and discard pile updates. |
| Played / Used | Implemented | Logs + effect timings. |
| Cancelled | Implemented | Before Use onward skipped; Always applies. |
| Negated | Missing | No negation mechanic in core. |
| Cannot Play Cards | Partial | Implemented via `block_play` (combat round only); requires structured effects. |
| Created Card default destination | Missing | Core always creates to hand; default-to-discard not modeled. |
| Damage resolution order | Implemented | Power mods -> Immune -> % mods -> Shield -> Barrier -> flat HP mods -> HP. |
| AoE / Splash / Bounce | Missing | No multi-target targeting logic; only single-target resolution. |
| Redirect | Missing | Only Cover redirect exists; keyword not supported. |
| Rule Priority | Implemented | Structured effects and restrictions override defaults. |

## Structured Effects
Current structured effect types in data are fully supported in core:
`deal_damage`, `gain_shield`, `heal`, `gain_ultimate`, `gain_status`,
`inflict_status`, `gain_status_per_spent`, `inflict_status_per_spent`,
`set_status`, `reduce_status`, `spend_status`, `deal_damage_per_spent`,
`draw_cards`, `create_card`, `reload_equipped`, `switch_equip`, `choose`,
`grant_keyword`, `retain`.
