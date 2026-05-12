import type {
  ChampionCooldown,
  CooldownSpell,
  TacticalCommandResult,
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

  handleText(input: string, gameTimeSeconds: number): TacticalCommandResult {
    const parsed = this.parse(input);
    if (!parsed) {
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

    const cooldown: ChampionCooldown = {
      champion: parsed.champion,
      spell: parsed.spell,
      source: "manual",
      confidence: parsed.spell === "ultimate" ? "estimated" : "confirmed",
      usedAtSeconds: gameTimeSeconds,
      readyAtSeconds: gameTimeSeconds + COOLDOWN_SECONDS[parsed.spell],
      isEnemy: true,
    };
    this.cooldowns.set(this.key(parsed.champion, parsed.spell), cooldown);

    return {
      ok: true,
      kind: "registered",
      message: `${cooldown.champion} ${cooldown.spell} registrado ate ${this.formatClock(cooldown.readyAtSeconds)}.`,
      cooldowns: [cooldown],
    };
  }

  listCooldowns(gameTimeSeconds: number): ChampionCooldown[] {
    return [...this.cooldowns.values()].map((cooldown) => this.withCurrentConfidence(cooldown, gameTimeSeconds));
  }

  reset(): void {
    this.cooldowns.clear();
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
      isQuery: QUERY_RE.test(rest),
    };
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

  private formatClock(totalSeconds: number): string {
    const clamped = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(clamped / 60).toString().padStart(2, "0");
    const seconds = (clamped % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }
}
