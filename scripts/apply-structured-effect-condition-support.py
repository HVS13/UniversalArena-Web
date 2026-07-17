from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


# Data contract types.
types_path = Path("packages/data/src/types.ts")
types = types_path.read_text(encoding="utf-8")
old_condition_block = '''export type EffectCondition =
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
'''
new_condition_block = '''export type EffectPlayWindow = "assist_attack" | "follow_up" | "after_use";

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
'''
types = replace_once(types, old_condition_block, new_condition_block, "effect condition type block")
types = replace_once(
    types,
    '''export type CardTransform = {
  condition: EffectCondition;
  cardSlot: string;
};''',
    '''export type CardTransform = {
  condition: StatusEffectCondition;
  cardSlot: string;
};''',
    "transform condition type",
)
types = replace_once(
    types,
    'export type UseRestrictionWindow = "assist_attack" | "follow_up" | "after_use";',
    'export type UseRestrictionWindow = EffectPlayWindow;',
    "window type alias",
)
write(str(types_path), types)

# Public data type exports.
data_index_path = Path("packages/data/src/index.ts")
data_index = data_index_path.read_text(encoding="utf-8")
data_index = replace_once(
    data_index,
    '''  Effect,
  EffectAmount,
  EffectCondition,
  EffectScalar,
  EffectTarget,''',
    '''  Effect,
  EffectAmount,
  EffectComparisonOperator,
  EffectCondition,
  EffectPlayWindow,
  EffectScalar,
  EffectTarget,''',
    "data condition exports",
)
data_index = replace_once(
    data_index,
    '''  StatusEffect,
  StatusEffectDefinition,
  StatusRule,''',
    '''  StatusEffect,
  StatusEffectCondition,
  StatusEffectDefinition,
  StatusRule,''',
    "status condition export",
)
write(str(data_index_path), data_index)

# Prepare the package for the coordinated schema-2 data sync while retaining schema-1 compatibility.
manifest_path = Path("packages/data/validate-manifest.mjs")
manifest = manifest_path.read_text(encoding="utf-8")
manifest = replace_once(
    manifest,
    'const errors = [];\n\nif (manifest.schemaVersion !== 1) errors.push(`Unsupported schemaVersion ${manifest.schemaVersion}.`);',
    'const errors = [];\nconst supportedSchemaVersions = new Set([1, 2]);\n\nif (!supportedSchemaVersions.has(manifest.schemaVersion)) {\n  errors.push(`Unsupported schemaVersion ${manifest.schemaVersion}.`);\n}',
    "manifest schema support",
)
write(str(manifest_path), manifest)

# Core runtime support.
core_path = Path("packages/core/src/index.ts")
core = core_path.read_text(encoding="utf-8")
core = replace_once(
    core,
    '''  EffectAmount,
  EffectCondition,
  EffectScalar,''',
    '''  EffectAmount,
  EffectCondition,
  EffectPlayWindow,
  EffectScalar,''',
    "core condition import",
)
core = replace_once(
    core,
    '''  targetText?: string;
  xValue: number;
  choiceIndex?: number;''',
    '''  targetText?: string;
  xValue: number;
  playWindows?: EffectPlayWindow[];
  choiceIndex?: number;''',
    "stack entry play windows",
)

old_condition_function = re.compile(
    r'''const isConditionMet = \(\n.*?\n\};\n\nconst isStatusRequirementMet =''',
    re.DOTALL,
)
new_condition_function = '''type EffectConditionContext = {
  xValue: number;
  playWindows: readonly EffectPlayWindow[];
};

const getEffectConditionContext = (entry: StackEntry): EffectConditionContext => ({
  xValue: entry.xValue,
  playWindows: entry.playWindows ?? [],
});

const isStatusWithinBounds = (
  status: StatusState,
  definition: StatusDefinition,
  min = 1,
  max = Number.POSITIVE_INFINITY
) => {
  if (!isStatusActive(status, definition)) return false;
  const value = getStatusPrimaryValue(status, definition);
  return value >= min && value <= max;
};

const isConditionMet = (
  condition: EffectCondition | undefined,
  snapshot: StatusSnapshot,
  sourceId: MatchCharacterId,
  targetId: MatchCharacterId,
  sourceCharacter: Character | null,
  targetCharacter: Character | null,
  context?: EffectConditionContext
) => {
  if (!condition) return true;
  switch (condition.kind) {
    case "self_has_status": {
      const status = getSnapshotStatusState(snapshot, sourceId, condition.status);
      const definition = getStatusDefinition(condition.status, sourceCharacter);
      return isStatusWithinBounds(status, definition, condition.min, condition.max);
    }
    case "self_missing_status": {
      const status = getSnapshotStatusState(snapshot, sourceId, condition.status);
      const definition = getStatusDefinition(condition.status, sourceCharacter);
      return !isStatusActive(status, definition);
    }
    case "target_has_status": {
      const status = getSnapshotStatusState(snapshot, targetId, condition.status);
      const definition = getStatusDefinition(condition.status, targetCharacter);
      return isStatusWithinBounds(status, definition, condition.min, condition.max);
    }
    case "target_missing_status": {
      const status = getSnapshotStatusState(snapshot, targetId, condition.status);
      const definition = getStatusDefinition(condition.status, targetCharacter);
      return !isStatusActive(status, definition);
    }
    case "play_window":
      return context?.playWindows.includes(condition.window) ?? false;
    case "compare": {
      if (!context) return false;
      const left = resolveEffectScalar(condition.left, context.xValue);
      const right = resolveEffectScalar(condition.right, context.xValue);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      switch (condition.operator) {
        case "eq":
          return left === right;
        case "ne":
          return left !== right;
        case "lt":
          return left < right;
        case "lte":
          return left <= right;
        case "gt":
          return left > right;
        case "gte":
          return left >= right;
        default:
          return false;
      }
    }
    default:
      return false;
  }
};

const isStatusRequirementMet ='''
core, count = old_condition_function.subn(new_condition_function, core, count=1)
if count != 1:
    raise RuntimeError(f"condition evaluator: expected exactly one match, found {count}")

# Every effect-condition evaluation receives the card's captured play context and X value.
standard_call = re.compile(
    r'''!isConditionMet\(\n(?P<i>\s*)effect\.condition,\n(?P=i)snapshot,\n(?P=i)entry\.sourceId,\n(?P=i)entry\.targetId,\n(?P=i)sourceCharacter,\n(?P=i)targetCharacter\n(?P<c>\s*)\)'''
)

def add_standard_context(match: re.Match[str]) -> str:
    i = match.group("i")
    c = match.group("c")
    return (
        "!isConditionMet(\n"
        f"{i}effect.condition,\n"
        f"{i}snapshot,\n"
        f"{i}entry.sourceId,\n"
        f"{i}entry.targetId,\n"
        f"{i}sourceCharacter,\n"
        f"{i}targetCharacter,\n"
        f"{i}getEffectConditionContext(entry)\n"
        f"{c})"
    )

core, count = standard_call.subn(add_standard_context, core)
if count != 4:
    raise RuntimeError(f"standard effect condition calls: expected 4 matches, found {count}")

target_call = re.compile(
    r'''!isConditionMet\(\n(?P<i>\s*)effect\.condition,\n(?P=i)snapshot,\n(?P=i)entry\.sourceId,\n(?P=i)targetId,\n(?P=i)sourceCharacter,\n(?P=i)targetDefinition\n(?P<c>\s*)\)'''
)

def add_target_context(match: re.Match[str]) -> str:
    i = match.group("i")
    c = match.group("c")
    return (
        "!isConditionMet(\n"
        f"{i}effect.condition,\n"
        f"{i}snapshot,\n"
        f"{i}entry.sourceId,\n"
        f"{i}targetId,\n"
        f"{i}sourceCharacter,\n"
        f"{i}targetDefinition,\n"
        f"{i}getEffectConditionContext(entry)\n"
        f"{c})"
    )

core, count = target_call.subn(add_target_context, core)
if count != 1:
    raise RuntimeError(f"target effect condition calls: expected 1 match, found {count}")

# Avoid executing a legacy X-condition parser when the same rule is structured.
structured_type_anchor = '''const hasStructuredEffectType = (
  effects: Effect[] | undefined,
  timing: Effect["timing"],
  choiceIndex: number | undefined,
  type: Effect["type"]
) => {
  let found = false;
  forEachStructuredEffect(effects, timing, choiceIndex, (effect) => {
    if (effect.type === type) {
      found = true;
    }
  });
  return found;
};
'''
structured_kind_helper = structured_type_anchor + '''
const hasStructuredConditionKind = (
  effects: Effect[] | undefined,
  timing: Effect["timing"],
  choiceIndex: number | undefined,
  kind: EffectCondition["kind"]
) => {
  let found = false;
  forEachStructuredEffect(effects, timing, choiceIndex, (effect) => {
    if (effect.condition?.kind === kind) {
      found = true;
    }
  });
  return found;
};
'''
core = replace_once(core, structured_type_anchor, structured_kind_helper, "structured condition helper")
core = replace_once(
    core,
    '''  const hasCreateEffect = hasStructuredEffectType(
    entry.effects,
    timing,
    entry.choiceIndex,
    "create_card"
  );
  const targets = areaTargets.length ? areaTargets : [entry.targetId];''',
    '''  const hasCreateEffect = hasStructuredEffectType(
    entry.effects,
    timing,
    entry.choiceIndex,
    "create_card"
  );
  const hasStructuredCompareCondition = hasStructuredConditionKind(
    entry.effects,
    timing,
    entry.choiceIndex,
    "compare"
  );
  const targets = areaTargets.length ? areaTargets : [entry.targetId];''',
    "structured compare detection",
)
core = replace_once(
    core,
    '''    const xConditionalMatch = normalized.match(
      /If X is (\\d+),\\s*inflict\\s+(\\d+)\\s+([^.,]+)/i
    );''',
    '''    const xConditionalMatch = hasStructuredCompareCondition
      ? null
      : normalized.match(/If X is (\\d+),\\s*inflict\\s+(\\d+)\\s+([^.,]+)/i);''',
    "legacy compare suppression",
)

# Capture the reaction context before the pending window is consumed.
core = replace_once(
    core,
    '''    const isFollowUpPlay =
      Boolean(isAfterUse) && next.afterUseWindow?.lastUsedCharacterId === sourceMember.id;
    const followUpAdjustment = isFollowUpPlay
      ? getFollowUpCostAdjustment(resolvedCard.effect)
      : 0;''',
    '''    const isFollowUpPlay =
      Boolean(isAfterUse) && next.afterUseWindow?.lastUsedCharacterId === sourceMember.id;
    const playWindows: EffectPlayWindow[] = [];
    if (isAfterUse) playWindows.push("after_use");
    if (isFollowUpPlay) {
      playWindows.push("follow_up");
    } else if (isAfterUse) {
      playWindows.push("assist_attack");
    }
    const followUpAdjustment = isFollowUpPlay
      ? getFollowUpCostAdjustment(resolvedCard.effect)
      : 0;''',
    "reaction context capture",
)
entry_context_pattern = re.compile(
    r'''(?P<i>\s*)targetText: resolvedCard\.target,\n(?P=i)xValue,\n(?P=i)choiceIndex: action\.choiceIndex,'''
)

def add_entry_context(match: re.Match[str]) -> str:
    i = match.group("i")
    return (
        f"{i}targetText: resolvedCard.target,\n"
        f"{i}xValue,\n"
        f"{i}playWindows: playWindows.length ? playWindows : undefined,\n"
        f"{i}choiceIndex: action.choiceIndex,"
    )

core, count = entry_context_pattern.subn(add_entry_context, core)
if count != 2:
    raise RuntimeError(f"stack entry contexts: expected 2 matches, found {count}")

# Guard the expected evaluator call topology: definition + five effect calls + transform call.
if core.count("isConditionMet(") != 7:
    raise RuntimeError(f"unexpected isConditionMet call count: {core.count('isConditionMet(')}")
if core.count("getEffectConditionContext(entry)") != 6:
    # One definition plus five call sites.
    raise RuntimeError(
        f"unexpected effect context count: {core.count('getEffectConditionContext(entry)')}"
    )
write(str(core_path), core)

# Golden manifest compatibility now permits current schema 1 and coordinated schema 2.
golden_path = Path("packages/core/src/golden.ts")
golden = golden_path.read_text(encoding="utf-8")
golden = replace_once(
    golden,
    'if (dataManifest.schemaVersion !== 1) throw new Error(`Unsupported schema version ${dataManifest.schemaVersion}.`);',
    'if (![1, 2].includes(dataManifest.schemaVersion)) throw new Error(`Unsupported schema version ${dataManifest.schemaVersion}.`);',
    "golden schema support",
)
write(str(golden_path), golden)

# Run focused condition integration coverage after the existing golden suite.
core_package_path = Path("packages/core/package.json")
core_package = core_package_path.read_text(encoding="utf-8")
core_package = replace_once(
    core_package,
    '"golden": "tsx src/golden.ts"',
    '"golden": "tsx src/golden.ts && tsx src/effect-conditions.golden.ts"',
    "condition golden script",
)
write(str(core_package_path), core_package)

print("Applied structured effect-condition consumer support.")
