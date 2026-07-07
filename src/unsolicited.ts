import type { MessageIntent } from "./classifier.js";

const UNSOLICITED_CHANCE_INTENTS = new Set<MessageIntent["type"]>([
  "greeting",
  "fortune",
  "haiku",
  "poke",
  "treasure",
  "kanchigai",
  "album",
  "quiz",
  "attachment",
  "chatter",
  "numericPoem",
  "question"
]);

export function needsUnsolicitedChance(intentType: MessageIntent["type"]): boolean {
  return UNSOLICITED_CHANCE_INTENTS.has(intentType);
}
