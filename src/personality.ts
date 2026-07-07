import type { KnownUserSummary, MemoryFact, TreasureSummary } from "./db.js";
import { affectionTier, displayNameForUser } from "./affection.js";
import { defaultEmoji, defaultReactions, defaultThoughts, defaultWords, maybeEmoji } from "./default-brain.js";
import type { Mood } from "./mood.js";
import type { RandomSource } from "./random.js";

export type PersonalityContext = {
  mood: Mood;
  currentUser?: KnownUserSummary;
  facts: MemoryFact[];
  snippets: string[];
  treasures: TreasureSummary[];
  directSnippets: string[];
  emojis: string[];
};

export class PersonalityEngine {
  constructor(private readonly random: RandomSource) {}

  utterance(context: PersonalityContext): string {
    const thoughts: string[] = [...defaultThoughts, ...defaultReactions];
    const favorite = this.pickFocus(context);

    if (favorite && this.random.chance(0.45)) {
      thoughts.push(`${favorite}のこと考えてた`);
      thoughts.push(`${favorite}いる`);
      thoughts.push(`${favorite}すきかも`);
      thoughts.push(`${favorite}わかった`);
    }

    if (context.currentUser) {
      const tier = affectionTier(context.currentUser.affection);
      const name = displayNameForUser(context.currentUser.displayName, context.currentUser.affection);

      if (tier === "friendly" || tier === "favorite") {
        thoughts.push(`${name}きた`);
        thoughts.push(`${name}えらい`);
        thoughts.push(`${name}の声した`);
      }

      if (tier === "known" || tier === "friendly" || tier === "favorite") {
        thoughts.push(`${name}いる`);
        thoughts.push(`${name}のこと`);
      }
    }

    switch (context.mood) {
      case "sleepy":
        thoughts.push("ねるかも");
        thoughts.push("まぶたがおもい");
        thoughts.push("いま半分ねてる");
        break;
      case "confused":
        thoughts.push("わかった。わからない");
        thoughts.push("あれ？");
        thoughts.push("たぶんちがう");
        break;
      case "genki":
        thoughts.push("いける");
        thoughts.push("つよい");
        thoughts.push("いまかしこい");
        break;
      case "proud":
        thoughts.push("えへん");
        thoughts.push("偽性ある");
        thoughts.push("できた");
        break;
      default:
        thoughts.push("はい");
        thoughts.push("うん");
        thoughts.push("へへ");
    }

    return this.withEmoji(this.random.pick(thoughts), 0.18, context.emojis);
  }

  prefixMaybe(text: string, context: PersonalityContext): string {
    if (!this.random.chance(0.2)) return text;
    const thought = this.utterance(context);
    if (thought === text) return text;
    return `${thought}。${text}`;
  }

  withEmoji(text: string, probability = 0.12, learnedEmojis: string[] = []): string {
    if (!this.random.chance(probability)) return text;
    const emojiPool = [...learnedEmojis, ...defaultEmoji];
    return maybeEmoji(text, this.random.pick(emojiPool));
  }

  private pickFocus(context: PersonalityContext): string | null {
    const candidates = [
      ...context.directSnippets,
      ...context.treasures.map((treasure) => treasure.word),
      ...context.facts.flatMap((fact) => [fact.subject, fact.predicate]),
      ...context.snippets,
      ...defaultWords
    ].filter((item) => item.length >= 2 && item.length <= 16);

    if (candidates.length === 0) return null;
    return this.random.pick(candidates);
  }
}
