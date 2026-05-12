import type { TacticalPlan, TacticalPlanInput } from "./types";

export function createTacticalPlan(input: TacticalPlanInput): TacticalPlan {
  const gameTime = safeGameTime(input.gameTimeSeconds);

  return {
    intent: "farm_safe",
    priority: "low",
    summary: "Joga seguro e farma ate aparecer uma janela melhor.",
    confidence: "unknown",
    createdAtGameTimeSeconds: gameTime,
    expiresAtGameTimeSeconds: gameTime + 45,
    reasons: [
      {
        kind: "fallback",
        text: "Contexto insuficiente para recomendar luta ou objetivo.",
        confidence: "unknown",
        weight: 0,
      },
    ],
  };
}

function safeGameTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
