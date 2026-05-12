import type {
  ChampionCooldown,
  CooldownSpell,
  TacticalFact,
  TacticalCommandResult,
  TacticalMemoryContext,
} from "../shared/types.js";

const COOLDOWN_SECONDS: Record<Exclude<CooldownSpell, "item">, number> = {
  flash: 300,
  heal: 240,
  ignite: 180,
  exhaust: 240,
  cleanse: 240,
  ghost: 210,
  teleport: 360,
  smite: 90,
  ultimate: 120,
};

const SPELL_ALIASES: Array<[RegExp, Exclude<CooldownSpell, "item">]> = [
  [/\b(?:flashou|flash|sem\s+flash)\b/i, "flash"],
  [/\b(?:sem\s+ult|ultou|ultimate)\b/i, "ultimate"],
  [/\bheal\b/i, "heal"],
  [/\bignite\b/i, "ignite"],
  [/\bexhaust\b/i, "exhaust"],
  [/\bcleanse\b/i, "cleanse"],
  [/\bghost\b/i, "ghost"],
  [/\b(?:teleport|tp)\b/i, "teleport"],
  [/\bsmite\b/i, "smite"],
];

const QUERY_RE = /[?]|\b(?:tem|voltou|quando\s+volta)\b/i;
const NEGATED_TEM_RE = /\bn(?:ao|\u00e3o)\s+tem\b/i;
const STATUS_RE = /\b(?:sem|gastou|n(?:ao|\u00e3o)\s+tem)\b/i;
const GROUPED_QUERY_WORD_RE = /^\s*sem\b|\b(?:quem|todos|geral)\b/i;

const MULTI_WORD_CHAMPIONS = [
  "Nunu & Willump",
  "Renata Glasc",
  "Miss Fortune",
  "Aurelion Sol",
  "Twisted Fate",
  "Tahm Kench",
  "Dr. Mundo",
  "Cho'Gath",
  "Jarvan IV",
  "Master Yi",
  "Xin Zhao",
  "Bel'Veth",
  "Kai'Sa",
  "K'Sante",
  "Kha'Zix",
  "Kog'Maw",
  "Rek'Sai",
  "Vel'Koz",
  "Lee Sin",
  "LeBlanc",
];

export class TacticalMemory {
  private readonly cooldowns = new Map<string, ChampionCooldown>();
  private readonly facts: TacticalFact[] = [];

  handleText(input: string, gameTimeSeconds: number, context?: TacticalMemoryContext): TacticalCommandResult {
    const groupedQuery = this.parseGroupedQuery(input);
    if (groupedQuery) {
      const cooldowns = this.listCooldowns(gameTimeSeconds)
        .filter((cooldown) => cooldown.spell === groupedQuery.spell && cooldown.confidence !== "expired")
        .sort((a, b) => a.readyAtSeconds - b.readyAtSeconds);

      if (cooldowns.length === 0) {
        return {
          ok: true,
          kind: "query",
          message: `Ninguem sem ${groupedQuery.spell} na memoria ativa`,
          cooldowns,
        };
      }

      return {
        ok: true,
        kind: "query",
        message: cooldowns.map((cooldown) => this.formatQueryMessage(cooldown, gameTimeSeconds)).join("; "),
        cooldowns,
      };
    }

    const parsed = this.parse(input);
    if (!parsed) {
      const status = this.parseStatus(input);
      if (status) {
        const fact: TacticalFact = {
          id: `status:${status.champion.toLowerCase()}:${gameTimeSeconds}:${this.slug(status.rest)}`,
          kind: "status",
          champion: status.champion,
          team: "enemy",
          source: "manual",
          confidence: "confirmed",
          text: status.text,
          gameTimeSeconds,
          createdAt: new Date().toISOString(),
        };
        this.facts.push(fact);

        return {
          ok: true,
          kind: "registered",
          message: `Anotado: ${fact.text}.`,
          facts: [{ ...fact }],
        };
      }

      return { ok: false, kind: "unknown", message: "Comando tatico nao reconhecido." };
    }

    if (parsed.isQuery) {
      const cooldowns = this.findCooldowns(parsed.champion, parsed.spell, gameTimeSeconds);
      if (cooldowns.length === 0) {
        return {
          ok: true,
          kind: "query",
          message: `${parsed.champion} ${parsed.spell}: sem memoria ativa.`,
          cooldowns,
        };
      }

      return {
        ok: true,
        kind: "query",
        message: this.formatQueryMessage(cooldowns[0], gameTimeSeconds),
        cooldowns,
      };
    }

    const cooldownKey = this.key(parsed.champion, parsed.spell);
    const estimate = this.estimateCooldown(parsed.champion, parsed.spell, context);
    const cooldown: ChampionCooldown = {
      id: cooldownKey,
      champion: parsed.champion,
      spell: parsed.spell,
      source: "manual",
      confidence: parsed.spell === "ultimate" ? "estimated" : "confirmed",
      baseCooldownSeconds: estimate.baseCooldownSeconds,
      adjustedCooldownSeconds: estimate.adjustedCooldownSeconds,
      usedAtSeconds: gameTimeSeconds,
      readyAtSeconds: gameTimeSeconds + estimate.adjustedCooldownSeconds,
      isEnemy: true,
      ...(estimate.notes ? { notes: estimate.notes } : {}),
    };
    this.cooldowns.set(cooldownKey, cooldown);

    return {
      ok: true,
      kind: "registered",
      message: `${cooldown.champion} ${cooldown.spell} registrado ate ${this.formatClock(cooldown.readyAtSeconds)}.`,
      cooldowns: [{ ...cooldown }],
    };
  }

  listCooldowns(gameTimeSeconds: number): ChampionCooldown[] {
    return [...this.cooldowns.values()].map((cooldown) => this.withCurrentConfidence(cooldown, gameTimeSeconds));
  }

  listFacts(): TacticalFact[] {
    return this.facts.map((fact) => ({ ...fact }));
  }

  formatCoachContext(gameTimeSeconds: number): string {
    const cooldownSummaries = this.listCooldowns(gameTimeSeconds)
      .filter((cooldown) => cooldown.confidence !== "expired")
      .map(
        (cooldown) =>
          `${cooldown.champion} ${cooldown.spell} volta em ${this.formatClock(cooldown.readyAtSeconds - gameTimeSeconds)} (${cooldown.confidence})`,
      );
    const factSummaries = this.facts
      .slice(-5)
      .map((fact) => `${fact.text} (${fact.confidence})`);

    return [...cooldownSummaries, ...factSummaries].join("; ");
  }

  reset(): void {
    this.cooldowns.clear();
    this.facts.length = 0;
  }

  private parse(input: string): { champion: string; spell: Exclude<CooldownSpell, "item">; isQuery: boolean } | null {
    const normalized = input.trim().replace(/\s+/g, " ");
    const championMatch = this.parseChampion(normalized);
    const champion = championMatch?.champion;
    const rest = championMatch?.rest ?? "";
    if (!champion || !rest || this.detectSpell(champion)) {
      return null;
    }

    const spell = this.detectSpell(rest);
    if (!spell) {
      return null;
    }

    return {
      champion,
      spell,
      isQuery: this.isQuery(rest),
    };
  }

  private parseGroupedQuery(input: string): { spell: Exclude<CooldownSpell, "item"> } | null {
    const normalized = input.trim().replace(/\s+/g, " ");
    const spell = this.detectSpell(normalized);
    if (!spell || !GROUPED_QUERY_WORD_RE.test(normalized) || !QUERY_RE.test(normalized)) {
      return null;
    }

    return { spell };
  }

  private isQuery(text: string): boolean {
    return QUERY_RE.test(text) && !NEGATED_TEM_RE.test(text);
  }

  private parseChampion(normalized: string): { champion: string; rest: string } | null {
    const lower = normalized.toLowerCase();
    for (const champion of MULTI_WORD_CHAMPIONS) {
      const prefix = `${champion.toLowerCase()} `;
      if (lower.startsWith(prefix)) {
        return { champion, rest: normalized.slice(prefix.length) };
      }
    }

    const [champion, ...restParts] = normalized.split(" ");
    return champion ? { champion: this.formatChampion(champion), rest: restParts.join(" ") } : null;
  }

  private parseStatus(input: string): { champion: string; rest: string; text: string } | null {
    const normalized = input.trim().replace(/\s+/g, " ");
    const championMatch = this.parseChampion(normalized);
    if (!championMatch?.champion || !championMatch.rest || this.detectSpell(championMatch.rest)) {
      return null;
    }

    if (!STATUS_RE.test(championMatch.rest)) {
      return null;
    }

    return { champion: championMatch.champion, rest: championMatch.rest, text: normalized };
  }

  private detectSpell(text: string): Exclude<CooldownSpell, "item"> | null {
    return SPELL_ALIASES.find(([pattern]) => pattern.test(text))?.[1] ?? null;
  }

  private findCooldowns(
    champion: string,
    spell: Exclude<CooldownSpell, "item">,
    gameTimeSeconds: number,
  ): ChampionCooldown[] {
    const cooldown = this.cooldowns.get(this.key(champion, spell));
    return cooldown ? [this.withCurrentConfidence(cooldown, gameTimeSeconds)] : [];
  }

  private withCurrentConfidence(cooldown: ChampionCooldown, gameTimeSeconds: number): ChampionCooldown {
    if (gameTimeSeconds >= cooldown.readyAtSeconds) {
      return { ...cooldown, confidence: "expired" };
    }
    return { ...cooldown };
  }

  private estimateCooldown(
    champion: string,
    spell: Exclude<CooldownSpell, "item">,
    context?: TacticalMemoryContext,
  ): { baseCooldownSeconds: number; adjustedCooldownSeconds: number; notes?: string } {
    if (spell !== "ultimate") {
      const cooldownSeconds = COOLDOWN_SECONDS[spell];
      return { baseCooldownSeconds: cooldownSeconds, adjustedCooldownSeconds: cooldownSeconds };
    }

    const player = context?.enemyPlayers.find(
      (enemy) => enemy.championName.toLowerCase() === champion.toLowerCase(),
    );
    const baseCooldownSeconds = player
      ? player.level >= 16
        ? 80
        : player.level >= 11
          ? 100
          : 120
      : 120;
    const haste = player?.items.reduce((total, item) => {
      const name = item.name.toLowerCase();
      let itemHaste = 0;
      if (name.includes("ionian") || name.includes("lucidity")) itemHaste += 10;
      if (name.includes("malignance")) itemHaste += 20;
      if (name.includes("axiom")) itemHaste += 25;
      return total + itemHaste;
    }, 0) ?? 0;
    const adjustedCooldownSeconds = Math.round(baseCooldownSeconds * (100 / (100 + haste)));

    return {
      baseCooldownSeconds,
      adjustedCooldownSeconds,
      ...(haste > 0 ? { notes: `Estimado com ${haste} ability haste.` } : {}),
    };
  }

  private formatQueryMessage(cooldown: ChampionCooldown, gameTimeSeconds: number): string {
    if (cooldown.confidence === "expired") {
      return `${cooldown.champion} ${cooldown.spell} pronto.`;
    }

    return `${cooldown.champion} ${cooldown.spell} volta em ${this.formatClock(cooldown.readyAtSeconds - gameTimeSeconds)}.`;
  }

  private key(champion: string, spell: CooldownSpell): string {
    return `${champion.toLowerCase()}:${spell}`;
  }

  private formatChampion(champion: string): string {
    return champion.charAt(0).toUpperCase() + champion.slice(1);
  }

  private slug(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  private formatClock(totalSeconds: number): string {
    const clamped = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(clamped / 60).toString().padStart(2, "0");
    const seconds = (clamped % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }
}
