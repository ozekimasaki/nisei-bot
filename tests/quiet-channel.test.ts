import { describe, expect, test } from "vitest";
import type { MessageIntent } from "../src/classifier.js";
import { shouldBlockInQuietChannel } from "../src/quiet-channel.js";

describe("shouldBlockInQuietChannel", () => {
  test("allows quiet toggle intents without bot name", () => {
    expect(shouldBlockInQuietChannel({ type: "quietOn" }, false)).toBe(false);
    expect(shouldBlockInQuietChannel({ type: "quietOff" }, false)).toBe(false);
  });

  test("blocks chatter when bot is not called", () => {
    expect(shouldBlockInQuietChannel({ type: "chatter" }, false)).toBe(true);
    expect(shouldBlockInQuietChannel({ type: "greeting", kind: "morning" }, false)).toBe(true);
  });

  test("allows explicit intents when bot is called", () => {
    expect(shouldBlockInQuietChannel({ type: "chatter" }, true)).toBe(false);
    expect(shouldBlockInQuietChannel({ type: "fortune" }, true)).toBe(false);
  });

  test("blocks fortune when bot is not called", () => {
    const intent: MessageIntent = { type: "fortune" };
    expect(shouldBlockInQuietChannel(intent, false)).toBe(true);
  });
});
