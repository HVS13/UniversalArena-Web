from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


core_path = Path("packages/core/src/index.ts")
core = core_path.read_text(encoding="utf-8")

scalar_anchor = '''const resolveEffectScalar = (value: EffectScalar, xValue: number) => {
  if (typeof value === "number") return value;
  switch (value.kind) {
    case "x":
      return xValue;
    case "x_plus":
      return xValue + value.value;
    case "x_minus":
      return Math.max(xValue - value.value, 0);
    case "x_times":
      return xValue * value.value;
    default:
      return 0;
  }
};
'''
scalar_with_guard = scalar_anchor + '''
const resolveConditionScalar = (value: unknown, xValue: number) => {
  if (!Number.isFinite(xValue)) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const scalar = value as { kind?: unknown; value?: unknown };
  if (scalar.kind === "x") return xValue;
  if (
    scalar.kind !== "x_plus" &&
    scalar.kind !== "x_minus" &&
    scalar.kind !== "x_times"
  ) {
    return null;
  }
  if (typeof scalar.value !== "number" || !Number.isFinite(scalar.value)) return null;
  if (scalar.kind === "x_plus") return xValue + scalar.value;
  if (scalar.kind === "x_minus") return Math.max(xValue - scalar.value, 0);
  return xValue * scalar.value;
};
'''
core = replace_once(core, scalar_anchor, scalar_with_guard, "condition scalar guard")

condition_pattern = re.compile(
    r'''const isConditionMet = \(\n.*?\n\};\n\nconst isStatusRequirementMet =''',
    re.DOTALL,
)
condition_replacement = '''const hasValidStatusConditionFields = (condition: {
  status?: unknown;
  min?: unknown;
  max?: unknown;
}) =>
  typeof condition.status === "string" &&
  Boolean(condition.status.trim()) &&
  (condition.min === undefined ||
    (typeof condition.min === "number" && Number.isFinite(condition.min))) &&
  (condition.max === undefined ||
    (typeof condition.max === "number" && Number.isFinite(condition.max)));

const isConditionMet = (
  condition: EffectCondition | undefined,
  snapshot: StatusSnapshot,
  sourceId: MatchCharacterId,
  targetId: MatchCharacterId,
  sourceCharacter: Character | null,
  targetCharacter: Character | null,
  context?: EffectConditionContext
) => {
  if (condition === undefined) return true;
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return false;
  switch (condition.kind) {
    case "self_has_status": {
      if (!hasValidStatusConditionFields(condition)) return false;
      const status = getSnapshotStatusState(snapshot, sourceId, condition.status);
      const definition = getStatusDefinition(condition.status, sourceCharacter);
      return isStatusWithinBounds(status, definition, condition.min, condition.max);
    }
    case "self_missing_status": {
      if (!hasValidStatusConditionFields(condition)) return false;
      const status = getSnapshotStatusState(snapshot, sourceId, condition.status);
      const definition = getStatusDefinition(condition.status, sourceCharacter);
      return !isStatusActive(status, definition);
    }
    case "target_has_status": {
      if (!hasValidStatusConditionFields(condition)) return false;
      const status = getSnapshotStatusState(snapshot, targetId, condition.status);
      const definition = getStatusDefinition(condition.status, targetCharacter);
      return isStatusWithinBounds(status, definition, condition.min, condition.max);
    }
    case "target_missing_status": {
      if (!hasValidStatusConditionFields(condition)) return false;
      const status = getSnapshotStatusState(snapshot, targetId, condition.status);
      const definition = getStatusDefinition(condition.status, targetCharacter);
      return !isStatusActive(status, definition);
    }
    case "play_window":
      if (
        condition.window !== "after_use" &&
        condition.window !== "follow_up" &&
        condition.window !== "assist_attack"
      ) {
        return false;
      }
      return context?.playWindows.includes(condition.window) ?? false;
    case "compare": {
      if (!context) return false;
      const left = resolveConditionScalar(condition.left, context.xValue);
      const right = resolveConditionScalar(condition.right, context.xValue);
      if (left === null || right === null) return false;
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
core, count = condition_pattern.subn(condition_replacement, core, count=1)
if count != 1:
    raise RuntimeError(f"condition evaluator replacement: expected one match, found {count}")
core_path.write_text(core, encoding="utf-8")


test_path = Path("packages/core/src/effect-conditions.golden.ts")
test = test_path.read_text(encoding="utf-8")
unknown_anchor = '''const unknownEffect = {
  timing: "on_use",
  type: "gain_status",
  status: "Unknown Condition Applied",
  amount: { kind: "flat", value: 1 },
  condition: { kind: "future_condition" },
} as unknown as Effect;
'''
unknown_with_malformed = unknown_anchor + '''
const malformedCompareEffect = {
  timing: "on_use",
  type: "gain_status",
  status: "Malformed Compare Applied",
  amount: { kind: "flat", value: 1 },
  condition: {
    kind: "compare",
    left: { kind: "future_scalar" },
    operator: "eq",
    right: 0,
  },
} as unknown as Effect;

const malformedStatusEffect = {
  timing: "on_use",
  type: "gain_status",
  status: "Malformed Status Applied",
  amount: { kind: "flat", value: 1 },
  condition: { kind: "self_has_status" },
} as unknown as Effect;
'''
test = replace_once(test, unknown_anchor, unknown_with_malformed, "malformed condition fixtures")
test = replace_once(
    test,
    '''      effects: [unknownEffect],''',
    '''      effects: [unknownEffect, malformedCompareEffect, malformedStatusEffect],''',
    "malformed condition card effects",
)
test = replace_once(
    test,
    '''    if (statusValue(state, sourceId, "Unknown Condition Applied") !== 0) {
      throw new Error("An unknown condition kind was treated as satisfied.");
    }''',
    '''    if (statusValue(state, sourceId, "Unknown Condition Applied") !== 0) {
      throw new Error("An unknown condition kind was treated as satisfied.");
    }
    if (statusValue(state, sourceId, "Malformed Compare Applied") !== 0) {
      throw new Error("A malformed comparison condition was treated as satisfied.");
    }
    if (statusValue(state, sourceId, "Malformed Status Applied") !== 0) {
      throw new Error("A malformed status condition was treated as satisfied.");
    }''',
    "malformed condition assertions",
)
test_path.write_text(test, encoding="utf-8")

print("Hardened structured condition runtime validation.")
