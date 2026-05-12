import type { ObjectiveState, TacticalPlan, TacticalPlanInput, TacticalPlanReason } from "./types";

export function createTacticalPlan(input: TacticalPlanInput): TacticalPlan {
  const gameTime = safeGameTime(input.gameTimeSeconds);
  const avoidReasons = collectAvoidFightReasons(input, gameTime);

  if (score(avoidReasons) >= 7) {
    return {
      intent: "avoid_fight",
      priority: "high",
      summary: "evita luta agora e joga para sobreviver ate a janela melhorar.",
      confidence: confidenceFromReasons(avoidReasons),
      createdAtGameTimeSeconds: gameTime,
      expiresAtGameTimeSeconds: gameTime + 30,
      reasons: avoidReasons.slice(0, 4),
    };
  }

  const objective = findSoonObjective(input.objectiveStates);
  if (objective) {
    const cooldownReasons = collectEnemyCooldownReasons(input, gameTime);
    const reasons: TacticalPlanReason[] = [
      {
        kind: "objective",
        text: `${capitalize(objective.name)} esta em janela de preparacao.`,
        confidence: "estimated",
        weight: 4,
      },
      ...cooldownReasons,
    ];

    return {
      intent: "prepare_objective",
      priority: objective.available || score(cooldownReasons) >= 3 ? "high" : "medium",
      summary: `Prepara ${objective.name}: arruma visao e evita luta longa antes da contestacao.`,
      confidence: confidenceFromReasons(reasons),
      createdAtGameTimeSeconds: gameTime,
      expiresAtGameTimeSeconds: gameTime + 45,
      reasons,
    };
  }

  return fallbackPlan(gameTime);
}

function collectAvoidFightReasons(input: TacticalPlanInput, gameTime: number): TacticalPlanReason[] {
  const reasons: TacticalPlanReason[] = [];

  if (input.enemyThreat && input.enemyThreat.score >= 10) {
    reasons.push({
      kind: "threat",
      text: `${input.enemyThreat.championName} esta forte (${input.enemyThreat.kda}).`,
      confidence: "estimated",
      weight: 4,
    });
  }

  const activeAlliedDeaths = input.alliedDeaths.filter((death) => death.respawnAtSeconds > gameTime);
  for (const death of activeAlliedDeaths.slice(0, 2)) {
    reasons.push({
      kind: "death",
      text: `${death.championName} ainda esta morto.`,
      confidence: "confirmed",
      weight: 3,
    });
  }

  if (input.enemyPower - input.alliedPower >= 4) {
    reasons.push({
      kind: "powerspike",
      text: "O inimigo parece mais forte no momento.",
      confidence: "estimated",
      weight: 3,
    });
  }

  return reasons;
}

function collectEnemyCooldownReasons(input: TacticalPlanInput, gameTime: number): TacticalPlanReason[] {
  return input.cooldowns
    .filter((cooldown) => cooldown.isEnemy && cooldown.readyAtSeconds > gameTime && (cooldown.confidence === "confirmed" || cooldown.confidence === "estimated"))
    .sort((left, right) => {
      const confidenceDiff = confidenceRank(right.confidence) - confidenceRank(left.confidence);
      return confidenceDiff || left.readyAtSeconds - right.readyAtSeconds;
    })
    .slice(0, 2)
    .map((cooldown) => ({
      kind: "cooldown" as const,
      text: `${cooldown.champion} esta sem ${cooldown.spell}.`,
      confidence: cooldown.confidence === "confirmed" ? "confirmed" : "estimated",
      weight: cooldown.confidence === "confirmed" ? 3 : 2,
    }));
}

function confidenceRank(confidence: TacticalPlanInput["cooldowns"][number]["confidence"]): number {
  return confidence === "confirmed" ? 2 : confidence === "estimated" ? 1 : 0;
}

function findSoonObjective(objectives: ObjectiveState[]): ObjectiveState | null {
  return objectives.find((objective) => {
    const spawnIn = objective.spawnIn.toLowerCase();
    return objective.available || /^\s*(?:10|30|60) segundos\s*$/.test(spawnIn) || /^\s*1 minuto\s*$/.test(spawnIn);
  }) ?? null;
}

function fallbackPlan(gameTime: number): TacticalPlan {
  return {
    intent: "farm_safe",
    priority: "low",
    summary: "Joga seguro e farma ate aparecer uma janela melhor.",
    confidence: "unknown",
    createdAtGameTimeSeconds: gameTime,
    expiresAtGameTimeSeconds: gameTime + 45,
    reasons: [{ kind: "fallback", text: "Contexto insuficiente para recomendar luta ou objetivo.", confidence: "unknown", weight: 0 }],
  };
}

function confidenceFromReasons(reasons: TacticalPlanReason[]): TacticalPlan["confidence"] {
  if (reasons.some((reason) => reason.confidence === "unknown")) return "unknown";
  if (reasons.some((reason) => reason.confidence === "estimated")) return "estimated";
  return "confirmed";
}

function score(reasons: TacticalPlanReason[]): number {
  return reasons.reduce((sum, reason) => sum + reason.weight, 0);
}

function safeGameTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
