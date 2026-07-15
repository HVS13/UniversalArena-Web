export type CostVariable = {
  type: "energy" | "ultimate";
  multiplier: number;
};

export type CostBreakdown = {
  raw: string;
  energy: number;
  ultimate: number;
  variable?: CostVariable;
};

export const parseCost = (text: string): CostBreakdown => {
  const breakdown: CostBreakdown = { raw: text, energy: 0, ultimate: 0 };
  const parts = text.split("+").map((part) => part.trim());

  parts.forEach((part) => {
    const lower = part.toLowerCase();
    const isEnergy = lower.includes("energy");
    const isUltimate = lower.includes("ultimate");
    const numberMatch = part.match(/(\d+)/);
    const xTimesMatch = part.match(/x\s*times\s*(\d+)/i);

    if (xTimesMatch && isUltimate) {
      breakdown.variable = { type: "ultimate", multiplier: Number(xTimesMatch[1]) };
      return;
    }
    if (/x/i.test(part)) {
      if (isEnergy) breakdown.variable = { type: "energy", multiplier: 1 };
      if (isUltimate) breakdown.variable = { type: "ultimate", multiplier: 1 };
      return;
    }
    if (numberMatch) {
      const value = Number(numberMatch[1]);
      if (isEnergy) breakdown.energy += value;
      if (isUltimate) breakdown.ultimate += value;
    }
  });

  return breakdown;
};

export const computeCost = (cost: CostBreakdown, xValue = 0) => {
  const variableCost = cost.variable ? cost.variable.multiplier * xValue : 0;
  return {
    energy: cost.energy + (cost.variable?.type === "energy" ? variableCost : 0),
    ultimate: cost.ultimate + (cost.variable?.type === "ultimate" ? variableCost : 0),
  };
};

export const canAfford = (
  team: { energy: number; ultimate: number },
  cost: CostBreakdown,
  xValue = 0
) => {
  const totals = computeCost(cost, xValue);
  return team.energy >= Math.max(0, totals.energy) && team.ultimate >= Math.max(0, totals.ultimate);
};
