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

  it("prepares a neutral objective when it is spawning soon", () => {
    const plan = createTacticalPlan(baseInput({
      gameTimeSeconds: 540,
      objectiveStates: [{ name: "dragão", spawnIn: "60 segundos", available: false }],
    }));

    expect(plan.intent).toBe("prepare_objective");
    expect(plan.priority).toBe("medium");
    expect(plan.summary).toContain("dragão");
    expect(plan.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "objective", confidence: "estimated" }),
    ]));
  });

  it("does not prepare unavailable objectives outside the preparation window", () => {
    const plan = createTacticalPlan(baseInput({
      gameTimeSeconds: 300,
      objectiveStates: [{ name: "dragão", spawnIn: "300 segundos", available: false }],
    }));

    expect(plan.intent).toBe("farm_safe");
  });

  it("avoids fights when enemy threat is strong and an ally is dead", () => {
    const plan = createTacticalPlan(baseInput({
      enemyThreat: { championName: "Zed", score: 12, kda: "6/1/2", build: ["Youmuu"], majorItemCount: 2 },
      enemyThreats: [{ championName: "Zed", score: 12, kda: "6/1/2", build: ["Youmuu"], majorItemCount: 2 }],
      alliedDeaths: [{ championName: "Jinx", isEnemy: false, respawnAtSeconds: 645 }],
      alliedPower: 8,
      enemyPower: 13,
    }));

    expect(plan.intent).toBe("avoid_fight");
    expect(plan.priority).toBe("high");
    expect(plan.summary).toContain("evita luta");
    expect(plan.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "threat", text: expect.stringContaining("Zed") }),
      expect.objectContaining({ kind: "death", text: expect.stringContaining("Jinx") }),
    ]));
  });

  it("uses confirmed enemy cooldowns to strengthen objective preparation", () => {
    const plan = createTacticalPlan(baseInput({
      gameTimeSeconds: 700,
      objectiveStates: [{ name: "dragão", spawnIn: "30 segundos", available: false }],
      cooldowns: [{ champion: "Ashe", spell: "flash", isEnemy: true, confidence: "confirmed", readyAtSeconds: 850 }],
    }));

    expect(plan.intent).toBe("prepare_objective");
    expect(plan.priority).toBe("high");
    expect(plan.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "cooldown", text: expect.stringContaining("Ashe") }),
    ]));
    expect(plan.confidence).toBe("estimated");
  });
});
