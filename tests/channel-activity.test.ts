import { describe, expect, it } from "vitest";
import { ChannelActivityTracker } from "../src/channel-activity.js";

describe("ChannelActivityTracker", () => {
  it("drops messages outside the activity window", () => {
    const tracker = new ChannelActivityTracker(120, 3, 12);
    const now = 1_000_000;
    tracker.record("ch-1", now - 130_000);
    tracker.record("ch-1", now);
    expect(tracker.count("ch-1", now)).toBe(1);
  });

  it("saturates activity level at the configured count", () => {
    const tracker = new ChannelActivityTracker(120, 3, 12);
    const now = 1_000_000;
    tracker.record("ch-1", now);
    tracker.record("ch-1", now + 1);
    expect(tracker.level("ch-1", now + 1)).toBeCloseTo(2 / 3);

    tracker.record("ch-1", now + 2);
    expect(tracker.level("ch-1", now + 2)).toBe(1);
    tracker.record("ch-1", now + 3);
    expect(tracker.level("ch-1", now + 3)).toBe(1);
  });

  it("blocks channel chatter during cooldown", () => {
    const tracker = new ChannelActivityTracker(120, 3, 12);
    const now = 1_000_000;
    tracker.markChattered("ch-1", now);
    expect(tracker.isChannelCooldownActive("ch-1", now + 5_000)).toBe(true);
    expect(tracker.isChannelCooldownActive("ch-1", now + 13_000)).toBe(false);
    expect(tracker.getLastChatterAt("ch-1")?.getTime()).toBe(now);
  });
});
