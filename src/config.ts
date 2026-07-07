import "dotenv/config";

export type Talkativeness = "quiet" | "normal" | "loud";

export type AppConfig = {
  discordToken: string;
  clientId: string;
  guildId?: string;
  botDisplayName?: string;
  botNames: string[];
  talkativeness: Talkativeness;
  confusionRate: number;
  memoryMixRate: number;
  jankenWinRate: number;
  cooldownSeconds: number;
  wrongUserRate: number;
  treasurePickRate: number;
  affectionGainRate: number;
  misunderstandingReuseRate: number;
  silenceRate: number;
  emojiUseRate: number;
  activityWindowSeconds: number;
  activityBoostMax: number;
  activitySaturateCount: number;
  channelCooldownSeconds: number;
  affectionTalkCap: number;
  chatterChanceCap: number;
  moodPersistRate: number;
  tsukkomiResponseRate: number;
  wikiEnabled: boolean;
  wikiFallbackRate: number;
  wikiWrongResultRate: number;
  wikiRelatedWordRate: number;
  wikiCooldownSeconds: number;
  wikiUserAgent: string;
  idleChatterRate: number;
  idleChatterMinutes: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

function talkativenessEnv(): Talkativeness {
  const raw = process.env.TALKATIVENESS ?? "normal";
  if (raw === "quiet" || raw === "normal" || raw === "loud") return raw;
  throw new Error("TALKATIVENESS must be quiet, normal, or loud");
}

export function loadConfig(): AppConfig {
  const botNames = (process.env.BOT_NAMES ?? "にせい,偽性")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  return {
    discordToken: requiredEnv("DISCORD_TOKEN"),
    clientId: requiredEnv("CLIENT_ID"),
    guildId: process.env.GUILD_ID || undefined,
    botDisplayName: process.env.BOT_DISPLAY_NAME || undefined,
    botNames,
    talkativeness: talkativenessEnv(),
    confusionRate: numberEnv("CONFUSION_RATE", 0.2),
    memoryMixRate: numberEnv("MEMORY_MIX_RATE", 0.15),
    jankenWinRate: numberEnv("JANKEN_WIN_RATE", 0.95),
    cooldownSeconds: numberEnv("COOLDOWN_SECONDS", 15),
    wrongUserRate: numberEnv("WRONG_USER_RATE", 0.12),
    treasurePickRate: numberEnv("TREASURE_PICK_RATE", 0.08),
    affectionGainRate: numberEnv("AFFECTION_GAIN_RATE", 1),
    misunderstandingReuseRate: numberEnv("MISUNDERSTANDING_REUSE_RATE", 0.15),
    silenceRate: numberEnv("SILENCE_RATE", 0.12),
    emojiUseRate: numberEnv("EMOJI_USE_RATE", 0.18),
    activityWindowSeconds: numberEnv("ACTIVITY_WINDOW_SECONDS", 120),
    activityBoostMax: numberEnv("ACTIVITY_BOOST_MAX", 0.3),
    activitySaturateCount: numberEnv("ACTIVITY_SATURATE_COUNT", 3),
    channelCooldownSeconds: numberEnv("CHANNEL_COOLDOWN_SECONDS", 12),
    affectionTalkCap: numberEnv("AFFECTION_TALK_CAP", 0.2),
    chatterChanceCap: numberEnv("CHATTER_CHANCE_CAP", 0.8),
    moodPersistRate: numberEnv("MOOD_PERSIST_RATE", 0.65),
    tsukkomiResponseRate: numberEnv("TSUKKOMI_RESPONSE_RATE", 0.8),
    wikiEnabled: (process.env.WIKI_ENABLED ?? "true") !== "false",
    wikiFallbackRate: numberEnv("WIKI_FALLBACK_RATE", 0.05),
    wikiWrongResultRate: numberEnv("WIKI_WRONG_RESULT_RATE", 0.3),
    wikiRelatedWordRate: numberEnv("WIKI_RELATED_WORD_RATE", 0.25),
    wikiCooldownSeconds: numberEnv("WIKI_COOLDOWN_SECONDS", 60),
    wikiUserAgent:
      process.env.WIKI_USER_AGENT ??
      "nisei-bot/0.1 (chisei-oss; https://github.com/chisei-oss/chisei-oss)",
    idleChatterRate: numberEnv("IDLE_CHATTER_RATE", 0.03),
    idleChatterMinutes: numberEnv("IDLE_CHATTER_MINUTES", 30)
  };
}
