import type { Mood } from "./mood.js";
import type { RandomSource } from "./random.js";
import { clampTalkLevel } from "./talk-level.js";

export type InterjectInput = {
  now: number;
  talkLevel: number;
  cooldownSeconds: number;
  channelCooldownSeconds: number;
  guildLastSpokeAt: Date | null;
  channelLastChatterAt: Date | null;
  activityLevel: number;
  userAffection: number;
  hasKnownWord: boolean;
  hasRecentSnippet: boolean;
  mood: Mood;
  messageLength: number;
  hasEmotion: boolean;
  activityBoostMax: number;
  affectionTalkCap: number;
  chanceCap: number;
};

export function talkLevelBase(level: number): number {
  return clampTalkLevel(level) * 0.02;
}

export function hasEmotionInText(text: string): boolean {
  return /すご|やば|嬉し|悲し|楽し|つら|腹立|最高|最悪|わくわく|こわ|怖/u.test(text);
}

export function hasRecentSnippetMatch(text: string, snippets: string[]): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return snippets.some((snippet) => {
    if (snippet.length < 2) return false;
    return normalized.includes(snippet) || snippet.includes(normalized);
  });
}

function isGuildCooldownActive(input: InterjectInput): boolean {
  if (!input.guildLastSpokeAt) return false;
  return (input.now - input.guildLastSpokeAt.getTime()) / 1000 < input.cooldownSeconds;
}

function isChannelCooldownActive(input: InterjectInput): boolean {
  if (!input.channelLastChatterAt) return false;
  return (input.now - input.channelLastChatterAt.getTime()) / 1000 < input.channelCooldownSeconds;
}

export function computeInterjectChance(input: InterjectInput): number {
  if (isGuildCooldownActive(input)) return 0;
  if (isChannelCooldownActive(input)) return 0;

  let chance = talkLevelBase(input.talkLevel);
  chance += input.activityLevel * input.activityBoostMax;
  chance += Math.min(input.userAffection * 0.012, input.affectionTalkCap);
  if (input.hasKnownWord) chance *= 1.25;
  if (input.hasRecentSnippet) chance += 0.05;
  if (input.mood === "genki" || input.mood === "proud") chance *= 1.25;
  if (input.mood === "sleepy") chance *= 0.6;
  if (input.hasEmotion) chance += 0.05;
  if (input.messageLength >= 30) chance += 0.04;
  return Math.min(chance, input.chanceCap);
}

export function shouldInterject(input: InterjectInput, random: RandomSource): boolean {
  const chance = computeInterjectChance(input);
  if (chance <= 0) return false;
  return random.chance(chance);
}
