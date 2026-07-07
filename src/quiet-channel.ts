import type { MessageIntent } from "./classifier.js";

export function shouldBlockInQuietChannel(intent: MessageIntent, called: boolean): boolean {
  if (intent.type === "quietOn" || intent.type === "quietOff") return false;
  return !called;
}
