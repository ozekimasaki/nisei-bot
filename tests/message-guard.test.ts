import { describe, expect, it } from "vitest";
import { MessageGuard } from "../src/message-guard.js";

describe("MessageGuard", () => {
  it("blocks the same message id while in flight", () => {
    const guard = new MessageGuard();
    expect(guard.begin("msg-1")).toBe(true);
    expect(guard.begin("msg-1")).toBe(false);
    guard.complete("msg-1");
    expect(guard.begin("msg-1")).toBe(false);
  });

  it("allows a new message id after the previous one completes", () => {
    const guard = new MessageGuard();
    expect(guard.begin("msg-1")).toBe(true);
    guard.complete("msg-1");
    expect(guard.begin("msg-2")).toBe(true);
  });

  it("releases in-flight state on abort", () => {
    const guard = new MessageGuard();
    expect(guard.begin("msg-1")).toBe(true);
    guard.abort("msg-1");
    expect(guard.begin("msg-1")).toBe(true);
  });
});
