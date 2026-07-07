export type MessageIntent =
  | { type: "mention" }
  | { type: "teach"; subject: string; predicate: string }
  | { type: "question"; subject: string }
  | { type: "greeting"; kind: "morning" | "night" | "home" | "other" }
  | { type: "fortune" }
  | { type: "haiku" }
  | { type: "poke" }
  | { type: "treasure" }
  | { type: "jankenStart" }
  | { type: "jankenHand"; hand: JankenHand }
  | { type: "numericPoem"; count: number }
  | { type: "chatter" };

export type JankenHand = "gu" | "choki" | "pa";

export type ClassifierOptions = {
  botNames: string[];
  botUserId?: string;
};

const handAliases: Record<string, JankenHand> = {
  "ぐー": "gu",
  "グー": "gu",
  "ぐう": "gu",
  "グウ": "gu",
  "✊": "gu",
  "ちょき": "choki",
  "チョキ": "choki",
  "ちょきー": "choki",
  "✌": "choki",
  "✌️": "choki",
  "ぱー": "pa",
  "パー": "pa",
  "ぱあ": "pa",
  "パア": "pa",
  "✋": "pa"
};

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function isCalled(text: string, options: ClassifierOptions): boolean {
  const normalized = normalize(text);
  if (options.botUserId && normalized.includes(`<@${options.botUserId}>`)) return true;
  if (options.botUserId && normalized.includes(`<@!${options.botUserId}>`)) return true;
  return options.botNames.some((name) => normalized.includes(name));
}

export function classifyMessage(text: string, options: ClassifierOptions): MessageIntent {
  const normalized = normalize(text);

  const teach = normalized.match(/^(.{1,40}?)[はって]([^?？]{1,100}?)(?:だよ|です|だ|なの|やで|だね)[。.!！]*$/u);
  if (teach) {
    return {
      type: "teach",
      subject: teach[1]!.trim(),
      predicate: teach[2]!.trim()
    };
  }

  const question = normalized.match(/^(.{1,40}?)(?:は|って)?(?:なに|何|なんだっけ|何だっけ|だれ|誰)?[?？]$/u);
  if (question) {
    return {
      type: "question",
      subject: question[1]!.trim()
    };
  }

  if (/^(?:じゃんけん|ジャンケン|janken)/iu.test(normalized)) return { type: "jankenStart" };
  const hand = handAliases[normalized];
  if (hand) return { type: "jankenHand", hand };

  if (/占(?:い|って|う)|うらない|運勢/u.test(normalized)) return { type: "fortune" };
  if (/俳句|一句|575|五七五/u.test(normalized)) return { type: "haiku" };
  if (/つんつん|つっつ|poke|にせいつん/u.test(normalized)) return { type: "poke" };
  if (/たからもの|宝物|宝もの|treasure/u.test(normalized)) return { type: "treasure" };

  const numeric = normalized.match(/^\d{1,2}$/u);
  if (numeric) return { type: "numericPoem", count: Number(numeric[0]) };

  if (/おはよ|お早う|good morning/iu.test(normalized)) return { type: "greeting", kind: "morning" };
  if (/おやすみ|寝る|ねる|good night/iu.test(normalized)) return { type: "greeting", kind: "night" };
  if (/ただいま/u.test(normalized)) return { type: "greeting", kind: "home" };
  if (/こんにちは|こんばんは|やあ|hello|hi/iu.test(normalized)) return { type: "greeting", kind: "other" };

  if (isCalled(normalized, options)) return { type: "mention" };

  return { type: "chatter" };
}
