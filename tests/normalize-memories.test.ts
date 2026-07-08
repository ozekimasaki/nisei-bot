import { describe, expect, test } from "vitest";
import {
  planGuildMemoryBatch,
  planMessageSnippetBatch,
  planTreasureWordBatch,
  summarizePlans
} from "../src/normalize-memories.js";

describe("planGuildMemoryBatch", () => {
  test("updates long subjects to single words", () => {
    const plans = planGuildMemoryBatch([
      {
        id: "a",
        guildId: "g1",
        subject: "とても楽しくて毎日続けている",
        predicate: "赤い",
        confidence: 1,
        updatedAt: new Date("2026-01-01")
      }
    ]);

    expect(plans.some((plan) => plan.kind === "update")).toBe(true);
  });

  test("deletes rows that cannot normalize", () => {
    const plans = planGuildMemoryBatch([
      {
        id: "a",
        guildId: "g1",
        subject: "あ",
        predicate: "b",
        confidence: 1,
        updatedAt: new Date("2026-01-01")
      }
    ]);

    expect(plans).toEqual([{ kind: "delete", id: "a", reason: "invalid_word" }]);
  });

  test("merges rows with the same normalized subject", () => {
    const plans = planGuildMemoryBatch([
      {
        id: "a",
        guildId: "g1",
        subject: "りんご",
        predicate: "赤い",
        confidence: 2,
        updatedAt: new Date("2026-01-02")
      },
      {
        id: "b",
        guildId: "g1",
        subject: "りんご",
        predicate: "赤い",
        confidence: 3,
        updatedAt: new Date("2026-01-01")
      }
    ]);

    expect(plans.some((plan) => plan.kind === "merge")).toBe(true);
  });
});

describe("planTreasureWordBatch", () => {
  test("merges rows that normalize to the same word", () => {
    const plans = planTreasureWordBatch([
      {
        id: "keeper",
        guildId: "g1",
        word: "とてもねむい",
        weight: 10
      },
      {
        id: "duplicate",
        guildId: "g1",
        word: "ねむい",
        weight: 3
      }
    ]);

    const merge = plans.find((plan) => plan.kind === "merge");
    expect(merge).toMatchObject({
      kind: "merge",
      intoId: "keeper",
      mergeIds: ["duplicate"],
      after: { word: "ねむい", weight: 13 }
    });
    expect(plans.some((plan) => plan.kind === "update" && plan.id === "keeper")).toBe(false);
  });
});

describe("planMessageSnippetBatch", () => {
  test("deduplicates normalized snippets", () => {
    const plans = planMessageSnippetBatch([
      {
        id: "a",
        guildId: "g1",
        text: "りんご",
        createdAt: new Date("2026-01-02")
      },
      {
        id: "b",
        guildId: "g1",
        text: "りんご",
        createdAt: new Date("2026-01-01")
      }
    ]);

    const summary = summarizePlans(plans);
    expect(summary.delete).toBe(1);
    expect(summary.keep + summary.update).toBe(1);
  });
});
