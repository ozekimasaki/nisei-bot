import bcdice from "bcdice";
import type { RandomSource } from "./random.js";

type DiceBotGameSystem = {
  eval: (command: string) => { text?: string } | null | undefined;
};

type DynamicLoaderInstance = {
  dynamicLoad: (id: string) => Promise<DiceBotGameSystem>;
};

const { DynamicLoader } = bcdice as {
  DynamicLoader: new () => DynamicLoaderInstance;
};

let diceBotPromise: Promise<DiceBotGameSystem> | null = null;

function loadDiceBot(): Promise<DiceBotGameSystem> {
  if (!diceBotPromise) {
    diceBotPromise = new DynamicLoader().dynamicLoad("DiceBot");
  }
  return diceBotPromise;
}

export type DiceRollOk = {
  ok: true;
  display: string;
  detail?: string;
};

export type DiceRollFail = {
  ok: false;
};

export type DiceRollResult = DiceRollOk | DiceRollFail;

function extractFinalValue(bcdiceText: string): string {
  const parts = bcdiceText.split("＞").map((part) => part.trim());
  const last = parts.at(-1);
  if (last && last.length > 0) return last;
  return bcdiceText;
}

export class DiceRoller {
  constructor(private readonly random: RandomSource) {}

  roll1d100(): DiceRollResult {
    const value = this.random.int(1, 100);
    return { ok: true, display: String(value) };
  }

  async rollFormula(formula: string): Promise<DiceRollResult> {
    const trimmed = formula.trim();
    if (!trimmed) return { ok: false };

    try {
      const gameSystem = await loadDiceBot();
      const result = gameSystem.eval(trimmed);
      if (!result?.text) return { ok: false };
      return {
        ok: true,
        display: extractFinalValue(result.text),
        detail: result.text
      };
    } catch {
      return { ok: false };
    }
  }
}
