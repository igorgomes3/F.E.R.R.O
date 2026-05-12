export interface CoreSettings {
  zaiApiKey: string;
  zaiEndpoint: string;
  zaiModel: string;
  llmProtocol: "chat_completions" | "responses";
  liveClientBaseUrl: string;
  ddragonVersionsUrl: string;
  ddragonCdnUrl: string;
  pollIntervalSeconds: number;
  coachingIntervalSeconds: number;
  mapReminderIntervalSeconds: number;
  stalledGoldThreshold: number;
  dragonFirstSpawnSeconds: number;
  dragonRespawnSeconds: number;
  grubsFirstSpawnSeconds: number;
  grubsDespawnSeconds: number;
  heraldFirstSpawnSeconds: number;
  heraldDespawnSeconds: number;
  baronFirstSpawnSeconds: number;
  baronRespawnSeconds: number;
  objectiveOneMinuteCallSeconds: number;
  objectiveThirtySecondsCallSeconds: number;
  objectiveTenSecondsCallSeconds: number;
  ttsEnabled: boolean;
  ttsProvider: string;
  ttsVolume: number;
  ttsVoice?: string;
  piperExecutable: string;
  piperModelPath: string;
  piperSpeaker: number;
  elevenlabsApiKey: string;
  elevenlabsVoiceId: string;
  coachMessageMode: string;
  logsDir: string;
  logSnapshots: boolean;
  logLlmPayloads: boolean;
  simulationDurationSeconds: number;
  simulationStartGameTimeSeconds: number;
  simulationTickMs: number;
}

export interface CompactItem {
  id: number;
  name: string;
}

export interface SnapshotPlayer {
  summonerName: string;
  championName: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  currentGold: number;
  items: CompactItem[];
  position: string;
  wardScore: number;
}

export interface GameEvent {
  EventID?: number;
  EventName?: string;
  EventTime?: number;
  KillerName?: string;
  VictimName?: string;
  TurretKilled?: string;
  InhibKilled?: string;
  DragonType?: string;
  Stolen?: string | boolean;
  KillStreak?: number;
  Result?: string;
  Recipient?: string;
  [key: string]: unknown;
}

export interface GameSnapshot {
  gameTime: number;
  activePlayerName: string;
  activePlayerChampion: string;
  activePlayerLevel: number;
  activePlayerIsDead: boolean;
  activePlayerRespawnTimer: number;
  activePlayerGold: number;
  activePlayerTeam: string;
  activePlayerKda: string;
  activePlayerPosition: string;
  alliedPlayers: SnapshotPlayer[];
  enemyPlayers: SnapshotPlayer[];
  events: GameEvent[];
}

export interface ObjectiveState {
  name: string;
  spawnIn: string;
  available: boolean;
}

export interface EnemyThreat {
  championName: string;
  score: number;
  kda: string;
  build: string[];
  majorItemCount: number;
}

export interface ActivePlayerContext {
  championName: string;
  build: string[];
  majorItemCount: number;
  majorItemIds: Set<number>;
  majorItemDetails: Array<{ id: number; name: string }>;
}

export interface EnemyBuildContext {
  championName: string;
  majorItemIds: Set<number>;
  majorItemDetails: Array<{ id: number; name: string }>;
  itemNames: string[];
}

export interface StrategicContext {
  activePlayer: ActivePlayerContext;
  enemyBuilds: EnemyBuildContext[];
  enemyThreat: EnemyThreat | null;
  enemyThreats: EnemyThreat[];
  alliedPower: number;
  enemyPower: number;
  scalingRead: string;
  objectiveStates: ObjectiveState[];
  tacticalPlan?: TacticalPlan;
  tacticalMemory?: string;
}

export type TacticalPlanIntent =
  | "fight"
  | "avoid_fight"
  | "prepare_objective"
  | "trade_objective"
  | "reset"
  | "pressure_lane"
  | "farm_safe";

export type TacticalPlanPriority = "low" | "medium" | "high";
export type TacticalPlanConfidence = "confirmed" | "estimated" | "unknown";

export interface TacticalPlanReason {
  kind: "objective" | "cooldown" | "death" | "threat" | "powerspike" | "lane" | "fallback";
  text: string;
  confidence: TacticalPlanConfidence;
  weight: number;
}

export interface TacticalPlan {
  intent: TacticalPlanIntent;
  priority: TacticalPlanPriority;
  summary: string;
  reasons: TacticalPlanReason[];
  confidence: TacticalPlanConfidence;
  createdAtGameTimeSeconds: number;
  expiresAtGameTimeSeconds?: number;
}

export interface TacticalPlanCooldownInput {
  champion: string;
  spell: string;
  isEnemy: boolean;
  confidence: "confirmed" | "estimated" | "expired" | "unknown";
  readyAtSeconds: number;
}

export interface TacticalPlanDeathInput {
  championName: string;
  isEnemy: boolean;
  respawnAtSeconds: number;
}

export interface TacticalPlanInput {
  gameTimeSeconds: number;
  objectiveStates: ObjectiveState[];
  enemyThreat: EnemyThreat | null;
  enemyThreats: EnemyThreat[];
  alliedPower: number;
  enemyPower: number;
  alliedDeaths: TacticalPlanDeathInput[];
  enemyDeaths: TacticalPlanDeathInput[];
  cooldowns: TacticalPlanCooldownInput[];
}

export interface AnalyzeSnapshotResult {
  triggers: string[];
  strategicContext: StrategicContext;
}

export interface CoachDecision {
  shouldSpeak: boolean;
  message: string;
  reason: string;
  priority: string | null;
  prompt: string;
  rawModelMessage: string;
  fallbackUsed: boolean;
  llmMs: number;
  llmTokens: unknown;
  llmError: string | null;
  skippedLlm: boolean;
}

export interface MatchupTip {
  message: string;
  llmMs: number;
  llmTokens: unknown;
}

export interface SpeakResult {
  generateMs: number;
  playMs: number;
  provider: string;
}

export interface LoggerSessionInfo {
  sessionId: string;
  filePath: string;
  gameFilePath: string;
}

export type LoggerPayload = Record<string, unknown>;

export interface CoreLogger {
  readonly sessionId: string;
  readonly filePath: string;
  readonly gameFilePath: string;
  log(type: string, payload?: LoggerPayload): Promise<void>;
  logGame(type: string, payload?: LoggerPayload): Promise<void>;
  newSession(): Promise<LoggerSessionInfo>;
}

export interface LoopStateShape {
  lastCoachingAt: number;
  lastMapReminderAt: number;
  lastSeenEventCount: number;
  lastActiveMajorItemCount: number;
  enemyThreatItemCount: Map<string, number>;
  announcedKeys: Set<string>;
  lastAnalyzedGameTime: number | null;
  playerDeathCount: number;
  matchupDone: boolean;
  openingGreetingDone: boolean;
  lastActiveLevel: number;
  lastEnemyLaneLevel: number;
  seenActiveItemIds: Set<number>;
  seenEnemyItemIds: Map<string, Set<number>>;
  seenEnemyCounterTags: Set<string>;
  hasLoggedWaitingState: boolean;
  lastGameTime: number | null;
  lastMessageTimes: Map<string, number>;
  pendingTriggers: string[];
  lastSpeakGameTime: number;
  lastGroupMessageTimes: Map<string, number>;
  allyDragonKills: number;
  enemyDragonKills: number;
  lastAllyDragonSoulWarningAt: number;
  lastEnemyDragonSoulWarningAt: number;
  lastCsCheckAt: number;
  lastCsValue: number;
  lastWardScoreCheckAt: number;
  lastWardScore: number;
  lastLaneGoldCheckAt: number;
  processedEventIds: Set<number>;
  queueTriggers(triggers: string[]): void;
  drainPendingTriggers(): string[];
  canRepeatMessage(messageKey: string, gameTime: number, cooldownSeconds: number): boolean;
  markMessageSpoken(messageKey: string, gameTime: number): void;
  canSpeakGlobal(gameTime: number): boolean;
  markGlobalSpeak(gameTime: number): void;
  canRepeatGroup(category: string, gameTime: number): boolean;
  markGroupSpoken(groupName: string, gameTime: number): void;
  reset(): void;
  detectGameReset(currentGameTime: number): boolean;
}
