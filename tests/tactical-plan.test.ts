import { describe, expect, it } from "vitest";
import { createTacticalPlan } from "../src/core/tactical-plan";
import type { TacticalPlanInput } from "../src/core/types";

function baseInput(overrides: Partial<TacticalPlanInput> = {}): TacticalPlanInput {
  return {
    gameTimeSeconds: 600,
    objectiveStates: [],
    enemyThreat: null,
    enemyThreats: [],
    alliedPower: 10,
    enemyPower: 10,
    alliedDeaths: [],
    enemyDeaths: [],
    cooldowns: [],
    ...overrides,
  };
}

describe("tactical plan", () => {
  it("returns a conservative fallback when context is weak", () => {
    const plan = createTacticalPlan(baseInput());

    expect(plan.intent).toBe("farm_safe");
    expect(plan.priority).toBe("low");
    expect(plan.confidence).toBe("unknown");
    expect(plan.summary).toContain("Joga seguro");
    expect(plan.reasons).toEqual([
      expect.objectContaining({ kind: "fallback", confidence: "unknown" }),
    ]);
  });
});
